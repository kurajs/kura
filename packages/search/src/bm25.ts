// BM25 keyword search — Okapi BM25 over an in-memory inverted index. Pure JS,
// zero-dependency, so the same code runs on Node, Bun, Deno, Cloudflare Workers
// and the browser. Validated to far exceed naive substring scoring (XQuAD en:
// R@1 92% vs 46%, see prototypes/fts-bench/verify-bm25-vs-lexical.mjs).

import type { Tokenizer } from "./tokenize.ts";
import { latinTokenizer } from "./tokenize.ts";

export type Bm25Record<M = unknown> = {
  /** Stable identifier returned by search. */
  id: string;
  /** Text to index for this record. */
  text: string;
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
  /** Tokenizer. Default {@link latinTokenizer}; inject a CJK tokenizer for space-free scripts. */
  tokenize?: Tokenizer;
}

export interface Bm25SearchOptions {
  /** Maximum number of hits to return. Default 10. */
  topK?: number;
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

  /** Index more records. Records are appended; there is no de-duplication by id. */
  add(records: Iterable<Bm25Record<M>>): void {
    const tf = new Map<string, number>();
    for (const rec of records) {
      const docId = this.ids.length;
      this.ids.push(rec.id);
      this.store.push(rec.data as M);

      const toks = this.tokenize(rec.text);
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
    const terms = [...new Set(this.tokenize(query))];
    if (!terms.length) return [];

    const avgdl = this.totalLen / n;
    const scores = new Map<number, number>();
    for (const t of terms) {
      const p = this.postings.get(t);
      if (!p) continue;
      const df = p.length / 2;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
      for (let i = 0; i < p.length; i += 2) {
        const docId = p[i];
        const freq = p[i + 1];
        const dl = this.docLen[docId];
        const score = idf * (freq * (this.k1 + 1)) / (freq + this.k1 * (1 - this.b + this.b * dl / avgdl));
        scores.set(docId, (scores.get(docId) ?? 0) + score);
      }
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
