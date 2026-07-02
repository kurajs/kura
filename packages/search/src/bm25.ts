// BM25 keyword search — Okapi BM25 over an in-memory inverted index. Pure JS,
// zero-dependency, so the same code runs on Node, Bun, Deno, Cloudflare Workers
// and the browser. Validated to far exceed naive substring scoring (XQuAD en:
// R@1 92% vs 46%, see prototypes/fts-bench/verify-bm25-vs-lexical.mjs).

import type { Tokenizer, TokenizerResolver } from "./tokenize.ts";
import { latinTokenizer } from "./tokenize.ts";

export type Bm25Record<M = unknown> = {
  /** Stable identifier returned by search. */
  id: string;
  /** Text to index for this record. */
  text: string;
  /** Language tag (e.g. "ja"); selects a tokenizer when a resolver is configured. */
  lang?: string;
} & (undefined extends M
  ? { /** Arbitrary payload returned with each hit. */ data?: M }
  : { /** Payload returned with each hit (required because `M` excludes `undefined`). */ data: M });

export interface Bm25Hit<M = unknown> {
  id: string;
  /** BM25 relevance score (higher = better); not normalized to any range. */
  score: number;
  data: M;
}

export interface Bm25Options {
  /** Term-frequency saturation (Okapi `k1`). Default 1.2. */
  k1?: number;
  /** Document-length normalization (Okapi `b`). Default 0.75. */
  b?: number;
  /** Single tokenizer. Default {@link latinTokenizer}; inject a CJK tokenizer for space-free scripts. */
  tokenize?: Tokenizer;
  /** Per-language tokenizer (e.g. `byLocale({...})`). Overrides `tokenize` and selects by record/query `lang`. */
  resolveTokenizer?: TokenizerResolver;
}

export interface Bm25SearchOptions {
  /** Maximum number of hits to return. Default 10. */
  topK?: number;
  /** Language tag for the query; selects a tokenizer when a resolver is configured. */
  lang?: string;
  /** Typeahead: treat the LAST query token as a PREFIX — match every indexed term starting with it
   *  (so "feis" hits "feishu" before it's fully typed). Earlier tokens stay exact. Off by default;
   *  turn on for per-keystroke keyword search. Needs the prefix ≥ `minPrefix` chars. */
  prefixLast?: boolean;
  /** Minimum length for a prefix to expand (guards a 1-char prefix matching the whole vocab). Default 2. */
  minPrefix?: number;
  /** Cap on how many indexed terms one prefix expands to (bounds the per-keystroke cost). Default 128. */
  maxExpand?: number;
}

/**
 * In-memory BM25 index. Build with {@link Bm25.from} (or `new Bm25()` + {@link Bm25.add}),
 * then {@link Bm25.search}. Building is cheap at docs scale (a few hundred kchars/ms),
 * so a frozen corpus can be re-indexed at startup rather than shipped pre-serialized.
 */
export class Bm25<M = unknown> {
  private readonly k1: number;
  private readonly b: number;
  private readonly tokenize: Tokenizer;
  private readonly resolve?: TokenizerResolver;

  // term -> flat postings [docId0, tf0, docId1, tf1, ...]; docId is the array index below.
  private postings = new Map<string, number[]>();
  private docLen: number[] = [];
  private ids: string[] = [];
  private store: M[] = [];
  private totalLen = 0;

  constructor(opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.2;
    this.b = opts.b ?? 0.75;
    this.tokenize = opts.tokenize ?? latinTokenizer;
    this.resolve = opts.resolveTokenizer;
  }

  /** Tokenizer for a language: the resolver's pick, or the single tokenizer. */
  private tokenizerFor(lang?: string): Tokenizer {
    return this.resolve ? this.resolve(lang) : this.tokenize;
  }

  /** Build an index from records in one call. */
  static from<M>(records: Iterable<Bm25Record<M>>, opts?: Bm25Options): Bm25<M> {
    const bm = new Bm25<M>(opts);
    bm.add(records);
    return bm;
  }

  /** Number of indexed documents. */
  get size(): number {
    return this.ids.length;
  }

  /**
   * Tokenize text exactly as this index does (the configured tokenizer / resolver for `lang`).
   * Use it to align downstream work — e.g. snippet anchoring — with how queries are matched,
   * since a per-locale or normalizing tokenizer can produce different terms than a naive split.
   */
  tokensOf(text: string, lang?: string): string[] {
    return this.tokenizerFor(lang)(text);
  }

  /** Index more records. Records are appended; there is no de-duplication by id. */
  add(records: Iterable<Bm25Record<M>>): void {
    const tf = new Map<string, number>();
    for (const rec of records) {
      const docId = this.ids.length;
      this.ids.push(rec.id);
      this.store.push(rec.data as M);

      const toks = this.tokenizerFor(rec.lang)(rec.text);
      this.docLen.push(toks.length);
      this.totalLen += toks.length;

      tf.clear();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const [t, c] of tf) {
        let p = this.postings.get(t);
        if (!p) {
          p = [];
          this.postings.set(t, p);
        }
        p.push(docId, c);
      }
    }
  }

  /** Rank documents against `query` by BM25, returning the top `topK`. */
  search(query: string, opts: Bm25SearchOptions = {}): Bm25Hit<M>[] {
    const n = this.ids.length;
    if (!n) return [];
    const tokens = this.tokenizerFor(opts.lang)(query);
    if (!tokens.length) return [];

    const avgdl = this.totalLen / n;
    const scores = new Map<number, number>();
    // One term's BM25 contribution to each doc it appears in, handed to `accumulate`.
    const eachDoc = (p: number[], accumulate: (docId: number, s: number) => void) => {
      const df = p.length / 2;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
      for (let i = 0; i < p.length; i += 2) {
        const docId = p[i]!;
        const dl = this.docLen[docId]!;
        const score = idf * (p[i + 1]! * (this.k1 + 1)) / (p[i + 1]! + this.k1 * (1 - this.b + this.b * dl / avgdl));
        accumulate(docId, score);
      }
    };

    // Typeahead: the LAST token is the word being typed → match it as a prefix; earlier tokens are
    // complete words → exact. Guarded by minPrefix so a 1-char prefix can't pull in the whole vocab.
    const last = tokens[tokens.length - 1]!;
    const usePrefix = !!opts.prefixLast && last.length >= (opts.minPrefix ?? 2);
    const exact = new Set(usePrefix ? tokens.slice(0, -1) : tokens);

    for (const t of exact) {
      const p = this.postings.get(t);
      if (p) eachDoc(p, (docId, s) => scores.set(docId, (scores.get(docId) ?? 0) + s));
    }

    if (usePrefix) {
      // Expand the prefix to every indexed term that starts with it, and score the group as an OR:
      // each doc takes its BEST expansion (max), so a page matching the intended word ("feishu")
      // isn't out-ranked by one that happens to contain several other fei* terms. maxExpand bounds
      // the scan/score cost; a very large vocab would instead want a sorted-term / trie lookup.
      const group = new Map<number, number>();
      let expanded = 0;
      const cap = opts.maxExpand ?? 128;
      for (const [term, p] of this.postings) {
        if (!term.startsWith(last)) continue;
        eachDoc(p, (docId, s) => { const c = group.get(docId); if (c === undefined || s > c) group.set(docId, s); });
        if (++expanded >= cap) break;
      }
      for (const [docId, s] of group) scores.set(docId, (scores.get(docId) ?? 0) + s);
    }

    // Normalize topK to a non-negative integer; a negative/float value would hit slice()'s
    // surprising semantics (slice(0, -1) drops the last item rather than returning none).
    const topK = Math.max(0, Math.floor(opts.topK ?? 10));
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docId, score]) => ({ id: this.ids[docId], score, data: this.store[docId] }));
  }
}
