// Search wiring: build a search index from a content collection (build time) and
// load/serve it at runtime. Encapsulates chunking + the Kb engine + embedder.
import { Kb } from "@kurajs/core";
import type { Embedder, KbHit } from "@kurajs/core";
import { Bm25, rrfScored, latinTokenizer } from "@kurajs/search";
import type { Tokenizer, TokenizerResolver } from "@kurajs/search";
import { cjkSegmenter } from "@kurajs/tokenizers";
import type { DocLike } from "./nav.ts";
import { slugify } from "./nav.ts";
import { stripMdx } from "./util.ts";

// Default per-locale keyword tokenizer policy: CJK locales get native word
// segmentation (Intl.Segmenter, falling back to bigram); everything else uses the
// Latin tokenizer. Override via KuraConfig.tokenizer — e.g. to fold 繁/簡 with an
// OpenCC pipeline on zh-TW (see @kurajs/search README). Tokenizers are cached per
// locale (Intl.Segmenter is not free).
const CJK_PRIMARY = new Set(["zh", "ja", "ko"]);
export function defaultTokenizer(): TokenizerResolver {
  const cache = new Map<string, Tokenizer>();
  return (lang) => {
    if (!lang) return latinTokenizer;
    const l = lang.toLowerCase(); // BCP 47 tags are case-insensitive (also keeps the cache keyed once)
    const primary = l.split("-")[0];
    if (!primary || !CJK_PRIMARY.has(primary)) return latinTokenizer;
    let tok = cache.get(l);
    if (!tok) { tok = cjkSegmenter(l); cache.set(l, tok); }
    return tok;
  };
}

// `headingId` aligns with nav's slugify(), so a hit deep-links to the exact rendered anchor
// (#heading); `heading` is the section's heading text (the page title still travels in `title`).
// The intro section (text before the first h2/h3) has an empty headingId → links to the page top.
export type SearchData = { slug: string; title: string; section: string; text: string; locale?: string; headingId?: string; heading?: string };
export type SearchHit = { slug: string; title: string; section: string; text: string; score: number; locale?: string; headingId?: string; heading?: string };

/** Split a doc body into overlapping chunks for embedding. */
export function chunk(text: string, size = 500, overlap = 80): string[] {
  const clean = text.replace(/\r/g, "");
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) out.push(clean.slice(i, Math.min(i + size, clean.length)).trim());
  return out.filter((c) => c.length > 30);
}

/** A heading-anchored slice of a doc body. */
export interface Section { headingId: string; heading: string; text: string }

/**
 * Split a markdown body into heading-anchored sections at `##`/`###` (the levels nav's
 * processHtml anchors), so each section can be indexed and deep-linked to its own `#id`.
 * `headingId` uses the same {@link slugify} as the renderer, guaranteeing the anchor exists.
 * Text before the first heading is the intro section (empty headingId = page top). ATX markers
 * inside fenced code blocks are ignored, matching what actually becomes a rendered heading.
 */
export function splitByHeadings(body: string): Section[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const sections: Section[] = [];
  let cur: Section = { headingId: "", heading: "", text: "" };
  let inFence = false;
  const flush = () => { const t = cur.text.trim(); if (t || cur.heading) sections.push({ ...cur, text: t }); };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (m) {
      flush();
      const heading = m[2]!.replace(/[`*_~]/g, "").trim();
      cur = { headingId: slugify(heading), heading, text: "" };
    } else {
      cur.text += line + "\n";
    }
  }
  flush();
  return sections.length ? sections : [{ headingId: "", heading: "", text: body.trim() }];
}

/** Keep at most `max` hits per page (slug), preserving order — so one page can't crowd out the
 *  rest of the results, while still surfacing its few most relevant headings (Mintlify-style). */
function capPerPage<T extends { slug: string }>(hits: T[], max: number): T[] {
  const count = new Map<string, number>();
  const out: T[] = [];
  for (const h of hits) {
    const n = count.get(h.slug) ?? 0;
    if (n >= max) continue;
    count.set(h.slug, n + 1);
    out.push(h);
  }
  return out;
}

async function indexKb(entries: readonly DocLike[], embedder: Embedder): Promise<Kb<SearchData>> {
  const kb = new Kb<SearchData>({ embedder });
  let n = 0;
  for (const d of entries) {
    // Tag each chunk with the entry's authored locale (undefined = default) so a query
    // can be resolved to the right language; the id is locale-scoped to avoid collisions
    // between a doc and its variants (same slug across locales).
    const base = { slug: d.slug, title: String(d.data.title ?? d.slug), section: String(d.data.section ?? ""), ...(d.locale ? { locale: d.locale } : {}) };
    // Index per heading-anchored section so a semantic hit deep-links to the exact heading.
    // Prefix the heading text into the embedded chunk (so the heading's own words are searchable
    // and a short section still yields a chunk), then strip MDX/JSX so neither embeddings nor
    // snippets carry raw `<Tab …>`-style markup.
    for (const sec of splitByHeadings(d.body)) {
      const secData = sec.headingId ? { headingId: sec.headingId, heading: sec.heading } : {};
      const text = stripMdx(sec.heading ? `${sec.heading}\n${sec.text}` : sec.text);
      for (const c of chunk(text)) await kb.addText([{ id: `${d.locale ?? "_"}:${d.slug}#${sec.headingId}@${n++}`, text: c, data: { ...base, ...secData, text: c } }]);
    }
  }
  return kb;
}

/** Build a serialized index by embedding every doc chunk. Use at build time (`kura index`). */
export async function buildIndex(opts: { entries: readonly DocLike[]; embedder: Embedder }): Promise<Uint8Array> {
  return (await indexKb(opts.entries, opts.embedder)).serialize();
}

export interface SearchOptions {
  topK?: number;
  locale?: string;
  /** `"keyword"` runs BM25 alone — instant, no embed — for per-keystroke typeahead; `"hybrid"`
   *  (default when an embedder exists) adds semantic recall on submit/idle. No-op without an embedder. */
  mode?: "keyword" | "hybrid";
  /** Max hits per page (slug) in the result. Default 3. */
  maxPerPage?: number;
}

export interface SearchHandle {
  getKb(): Promise<Kb<SearchData> | null>;
  search(query: string, opts?: SearchOptions): Promise<SearchHit[]>;
  /** The query's terms exactly as the keyword index tokenizes them (per-locale) — so a client
   *  can highlight the same terms BM25 matched on (CJK-correct), not a naive whitespace split. */
  tokensOf(query: string, locale?: string): string[];
}

// Keyword search via BM25 (Okapi), used when no embedder is configured (e.g. a
// Cloudflare Workers deploy without Workers AI). Pure JS, zero-dependency, no model —
// but a real ranked index: BM25's IDF + length normalization far outrank naive
// substring hit-counting (XQuAD en: R@1 92% vs 46%). Title and section are folded
// into the indexed text; a snippet is cut around the first query hit for display.
type KeywordData = { slug: string; title: string; section: string; body: string; locale?: string; headingId?: string; heading?: string };

function buildKeywordIndex(entries: readonly DocLike[], tokenizer: TokenizerResolver): Bm25<KeywordData> {
  // One BM25 record per heading-anchored section so a keyword hit ranks (and deep-links to) the
  // most relevant heading, not just the page. The page title + section heading are folded into
  // each record's text, so searching a page's title still surfaces it via its sections.
  const records = entries.flatMap((e) => {
    const title = String(e.data.title ?? e.slug);
    const section = String(e.data.section ?? "");
    return splitByHeadings(e.body ?? "").map((sec) => {
      const body = stripMdx(sec.text);
      return {
        id: `${e.locale ?? "_"}:${e.slug}#${sec.headingId}`,
        text: `${title}\n${sec.heading}\n${body}`,
        lang: e.locale, // tokenize each doc by its own locale
        data: { slug: e.slug, title, section, body, ...(sec.headingId ? { headingId: sec.headingId, heading: sec.heading } : {}), ...(e.locale ? { locale: e.locale } : {}) },
      };
    });
  });
  return Bm25.from(records, { resolveTokenizer: tokenizer });
}

// `tokens` are the query terms as the BM25 index produced them (per-locale / normalized) —
// so the snippet anchors on what actually matched, not on a naive re-split of the query.
function snippetAround(body: string, tokens: string[]): string {
  if (!tokens.length) return body.slice(0, 160).trim();
  // Land on the first WHOLE-token match (BM25 has no stemming), so a query token doesn't hit
  // a substring inside a larger word ("cat" must not match "concatenate"). Tokens can come
  // from any tokenizer now, so escape them for the regex. The Unicode look-around is a
  // script-aware word boundary (better than \b for accents).
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(?<![\\p{L}\\p{N}])(?:" + tokens.map(esc).join("|") + ")(?![\\p{L}\\p{N}])", "iu");
  let at = body.search(re);
  if (at < 0) {
    // No word-boundary match. CJK has no whitespace boundaries (the look-around can't match
    // between Han characters), so fall back to the first plain substring occurrence.
    const lc = body.toLowerCase();
    for (const t of tokens) { const i = lc.indexOf(t.toLowerCase()); if (i >= 0 && (at < 0 || i < at)) at = i; }
  }
  const start = at > 60 ? at - 40 : 0;
  return body.slice(start, start + 160).trim();
}

function keywordSearch(index: Bm25<KeywordData>, query: string, limit: number, fetchK = limit * 4, locale?: string): SearchHit[] {
  // Collapse a slug's locale variants (DOCS carries every locale) into one hit — otherwise
  // RRF, which fuses by slug, would see the same slug at several ranks and over-boost it.
  // Keep the highest-BM25 variant, breaking ties toward the reader's `locale` so the snippet
  // is same-language (mirrors collapseSemantic). Fetch `fetchK` rows (default limit*4 for
  // dedup headroom; a caller that already over-fetched passes fetchK = limit). `locale` also
  // tokenizes the query per-locale (CJK), matching how each doc was indexed.
  const queryTokens = index.tokensOf(query, locale); // the exact terms BM25 matches on
  const best = new Map<string, { hit: SearchHit; score: number }>();
  for (const h of index.search(query, { topK: fetchK, lang: locale })) {
    const hit: SearchHit = {
      slug: h.data.slug,
      title: h.data.title,
      section: h.data.section,
      text: snippetAround(h.data.body, queryTokens),
      score: Number(h.score.toFixed(3)),
      ...(h.data.locale ? { locale: h.data.locale } : {}),
      ...(h.data.headingId ? { headingId: h.data.headingId, heading: h.data.heading } : {}),
    };
    // Dedup per heading-anchored section (slug#headingId), keeping each page's distinct headings
    // as separate hits; locale variants of the SAME section still collapse to the best one.
    const key = `${h.data.slug}#${h.data.headingId ?? ""}`;
    const prev = best.get(key);
    if (!prev) { best.set(key, { hit, score: h.score }); continue; }
    const prefer = h.score > prev.score || (!!locale && h.data.locale === locale && prev.hit.locale !== locale && h.score >= prev.score);
    if (prefer) best.set(key, { hit, score: h.score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((e) => e.hit);
}

// Collapse a vector search's many per-chunk hits into one ranked hit per slug.
// bge-m3 is multilingual, so a query naturally ranks same-language chunks higher;
// on top of that we tie-break toward the reader's locale for a same-language snippet.
function collapseSemantic(raw: KbHit<SearchData>[], locale?: string): SearchHit[] {
  const best = new Map<string, { hit: SearchHit; score: number }>();
  for (const h of raw) {
    const hit: SearchHit = { slug: h.data.slug, title: h.data.title, section: h.data.section, score: Number(h.score.toFixed(3)), text: h.data.text, locale: h.data.locale, ...(h.data.headingId ? { headingId: h.data.headingId, heading: h.data.heading } : {}) };
    // Collapse a section's many per-chunk hits into one (slug#headingId); distinct headings of the
    // same page stay separate so the palette can surface several anchors per page.
    const key = `${h.data.slug}#${h.data.headingId ?? ""}`;
    const prev = best.get(key);
    if (!prev) { best.set(key, { hit, score: h.score }); continue; }
    const prefer = h.score > prev.score || (locale && h.data.locale === locale && prev.hit.locale !== locale && h.score >= prev.score - 0.04);
    if (prefer) best.set(key, { hit, score: h.score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).map((e) => e.hit);
}

/**
 * Runtime search. With an embedder, runs HYBRID search: semantic vectors (over a
 * precomputed index — no corpus embedding on the request thread) fused with BM25
 * keyword via Reciprocal Rank Fusion, giving keyword precision plus semantic /
 * cross-lingual recall. The model is warmed shortly after boot. WITHOUT an embedder,
 * search falls back to the zero-dependency BM25 keyword index alone — so a site still
 * deploys (and searches well) on Cloudflare Workers with no Workers AI. The embedder
 * is the optional upgrade from keyword-only to hybrid.
 */
export function createSearch(opts: {
  entries: readonly DocLike[];
  embedder?: Embedder;
  indexBytes?: Uint8Array;
  warm?: boolean;
  /** Per-locale keyword tokenizer. Default {@link defaultTokenizer} (CJK via Intl.Segmenter). */
  tokenizer?: TokenizerResolver;
}): SearchHandle {
  const tokenizer = opts.tokenizer ?? defaultTokenizer();
  // No embedder → BM25 keyword mode. The index is built lazily from the bundled
  // entries on first search and cached; building is cheap at docs scale.
  if (!opts.embedder) {
    let index: Bm25<KeywordData> | null = null;
    const idx = () => (index ??= buildKeywordIndex(opts.entries, tokenizer));
    return {
      getKb: async () => null,
      search: async (query, o) => {
        const topK = o?.topK ?? 8;
        // Over-fetch sections, cap per page so one doc can't crowd the list, then take topK.
        const hits = keywordSearch(idx(), query, topK * 3, undefined, o?.locale);
        return capPerPage(hits, o?.maxPerPage ?? 3).slice(0, topK);
      },
      tokensOf: (query, locale) => idx().tokensOf(query, locale),
    };
  }
  const embedder = opts.embedder;
  let building: Promise<Kb<SearchData>> | null = null;
  let keyword: Bm25<KeywordData> | null = null;
  const getKb = () =>
    (building ??= opts.indexBytes
      ? Promise.resolve(Kb.load<SearchData>(opts.indexBytes, { embedder }))
      : indexKb(opts.entries, embedder));
  const getKeyword = () => (keyword ??= buildKeywordIndex(opts.entries, tokenizer));

  if (opts.warm !== false) {
    // Kick the KB build off in the background so the first real query is fast. GUARDED: createDocs()
    // runs at module top-level, and workerd forbids timers (and I/O) in global scope — so on Workers
    // this throws synchronously and crashes worker startup. Swallow it; the index just builds lazily
    // on the first request instead (getKb is memoized). Warming still works on long-running hosts.
    try {
      setTimeout(() => { getKb().then((kb) => kb.searchText("warm", { topK: 1 })).catch(() => {}); }, 50);
    } catch {
      /* workerd global scope — no eager warm; the first query builds the index */
    }
  }

  const search = async (query: string, o?: SearchOptions): Promise<SearchHit[]> => {
    const topK = o?.topK ?? 8;
    const maxPerPage = o?.maxPerPage ?? 3;
    const depth = topK * 4; // over-fetch from each side so RRF has rank signal to fuse
    // Keyword-only fast path (typeahead): BM25 alone, no embed (~200ms) on the request thread.
    if (o?.mode === "keyword") {
      const hits = keywordSearch(getKeyword(), query, topK * 3, depth, o?.locale);
      return capPerPage(hits, maxPerPage).slice(0, topK);
    }
    const kb = await getKb();
    const semantic = collapseSemantic(await kb.searchText(query, { topK: depth }), o?.locale);
    const keywordHits = keywordSearch(getKeyword(), query, depth, depth, o?.locale); // caller already over-fetched
    // Hybrid: keyword precision (exact terms) + semantic / cross-lingual recall, fused by
    // rank so BM25 scores and cosine similarities don't need to be comparable. Keyword first
    // so a section found by both lists keeps the query-term snippet; semantic-only hits keep their chunk.
    // Fuse by heading-anchored section (slug#headingId) so a page's distinct headings rank
    // independently. Use the fused RRF score for `score` so it's consistent with the ordering.
    const fused = rrfScored<SearchHit>([{ hits: keywordHits }, { hits: semantic }], (h) => `${h.slug}#${h.headingId ?? ""}`, { topK: topK * 3 })
      .map(({ item, score }) => ({ ...item, score: Number(score.toFixed(4)) }));
    return capPerPage(fused, maxPerPage).slice(0, topK);
  };

  return { getKb, search, tokensOf: (query, locale) => getKeyword().tokensOf(query, locale) };
}
