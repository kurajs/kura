// Search wiring: build a search index from a content collection (build time) and
// load/serve it at runtime. Encapsulates chunking + the Kb engine + embedder.
import { Kb } from "@kurajs/core";
import type { Embedder, KbHit } from "@kurajs/core";
import { Bm25, rrfScored, latinTokenizer } from "@kurajs/search";
import type { Tokenizer, TokenizerResolver } from "@kurajs/search";
import { cjkSegmenter } from "@kurajs/tokenizers";
import type { DocLike } from "./nav.ts";
import { createSlugger } from "./nav.ts";
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

// `headingId` aligns with nav's createSlugger() (same de-dup), so a hit deep-links to the exact
// rendered anchor (#heading); `heading` is the section's heading text (the page title still travels
// in `title`). The intro section (text before the first h2–h4) has an empty headingId → page top.
export type SearchData = { slug: string; title: string; section: string; text: string; locale?: string; headingId?: string; heading?: string };
export type SearchHit = { slug: string; title: string; section: string; text: string; score: number; locale?: string; headingId?: string; heading?: string; html?: string };

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
 * Split a markdown body into heading-anchored sections at `##`–`####` (the levels nav's
 * processHtml anchors), so each section can be indexed and deep-linked to its own `#id`.
 * `headingId` uses the same {@link createSlugger} as the renderer — same heading set, same order —
 * so the ids match exactly, including the -1/-2 de-dup for repeated headings. Text before the first
 * heading is the intro section (empty headingId = page top). ATX markers inside fenced code blocks
 * are ignored, matching what actually becomes a rendered heading.
 */
export function splitByHeadings(body: string): Section[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const sections: Section[] = [];
  const slugId = createSlugger(); // one per body → ids align with processHtml's (incl. de-dup)
  let cur: Section = { headingId: "", heading: "", text: "" };
  let inFence = false;
  const flush = () => { const t = cur.text.trim(); if (t || cur.heading) sections.push({ ...cur, text: t }); };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{2,4})\s+(.+?)\s*#*$/.exec(line);
    if (m) {
      flush();
      const heading = m[2]!.replace(/[`*_~]/g, "").trim();
      cur = { headingId: slugId(heading), heading, text: "" };
    } else {
      cur.text += line + "\n";
    }
  }
  flush();
  return sections.length ? sections : [{ headingId: "", heading: "", text: body.trim() }];
}

/** Rendered HTML → readable plaintext (for indexing + matching): drop script/style, strip tags,
 *  decode the few common entities, collapse whitespace. A regex, not a parser — cheap, no deps,
 *  safe to run in the browser when the static client derives its index from the shipped HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split rendered HTML into heading-anchored sections (h2–h4), mirroring {@link splitByHeadings} on
 *  markdown. Ids come from the SAME slugger (createSlugger, top-to-bottom) that processHtml + the
 *  markdown split use, so a section's `headingId` matches the live page's anchor (deep-links land).
 *  Each section keeps its HTML (for a rich preview) and a derived plaintext (index + snippet). */
function splitHtmlByHeadings(html: string): { headingId: string; heading: string; html: string; text: string }[] {
  const slugId = createSlugger();
  const out: { headingId: string; heading: string; html: string; text: string }[] = [];
  for (const part of html.split(/(?=<h[2-4]\b)/i)) {
    const m = /^<(h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/i.exec(part);
    if (m) {
      const raw = m[2]!.replace(/<[^>]+>/g, "").trim(); // heading text as processHtml slugs it
      const rest = part.slice(m[0].length).trim();
      out.push({ headingId: slugId(raw), heading: htmlToText(m[2]!), html: rest, text: htmlToText(rest) });
    } else {
      // Intro (before the first h2) — drop the leading <h1> (the page title is shown separately).
      const rest = part.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>/i, "").trim();
      const text = htmlToText(rest);
      if (text) out.push({ headingId: "", heading: "", html: rest, text });
    }
  }
  return out.length ? out : [{ headingId: "", heading: "", html: html.trim(), text: htmlToText(html) }];
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
  /** Typeahead: match the last query token as a PREFIX (so "feis" finds "feishu" mid-type). Only
   *  affects keyword mode; the hybrid/submit path always uses exact terms. */
  prefix?: boolean;
  /** Boost hits whose page/section NAME starts with the typed prefix (navigation typeahead) above
   *  body-only matches. Needs `prefix`; keyword mode only. */
  navBoost?: boolean;
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
type KeywordData = { slug: string; title: string; section: string; body: string; locale?: string; headingId?: string; heading?: string; html?: string };

function buildKeywordIndex(entries: readonly DocLike[], tokenizer: TokenizerResolver, defaultLocale?: string): Bm25<KeywordData> {
  // One BM25 record per heading-anchored section so a keyword hit ranks (and deep-links to) the
  // most relevant heading, not just the page. The page title + section heading are folded into
  // each record's text, so searching a page's title still surfaces it via its sections.
  // Source from the rendered HTML when present: it gives clean index text (htmlToText, no markdown
  // symbols) AND keeps each section's HTML for a rich preview. Falls back to the markdown body.
  const records = entries.flatMap((e) => {
    const title = String(e.data.title ?? e.slug);
    const section = String(e.data.section ?? "");
    const secs = e.html
      ? splitHtmlByHeadings(e.html)
      : splitByHeadings(e.body ?? "").map((s) => ({ headingId: s.headingId, heading: s.heading, html: "", text: stripMdx(s.text) }));
    return secs.map((sec) => ({
      id: `${e.locale ?? "_"}:${e.slug}#${sec.headingId}`,
      text: `${title}\n${sec.heading}\n${sec.text}`,
      lang: e.locale ?? defaultLocale, // tokenize each doc by its own locale (default-locale entries carry none)
      data: {
        slug: e.slug, title, section, body: sec.text,
        ...(sec.html ? { html: sec.html } : {}),
        ...(sec.headingId ? { headingId: sec.headingId, heading: sec.heading } : {}),
        ...(e.locale ? { locale: e.locale } : {}),
      },
    }));
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

function keywordSearch(index: Bm25<KeywordData>, query: string, limit: number, fetchK = limit * 4, locale?: string, prefixLast?: boolean, navBoost?: boolean): SearchHit[] {
  // Collapse a slug's locale variants (DOCS carries every locale) into one hit — otherwise
  // RRF, which fuses by slug, would see the same slug at several ranks and over-boost it.
  // Keep the highest-BM25 variant, breaking ties toward the reader's `locale` so the snippet
  // is same-language (mirrors collapseSemantic). Fetch `fetchK` rows (default limit*4 for
  // dedup headroom; a caller that already over-fetched passes fetchK = limit). `locale` also
  // tokenizes the query per-locale (CJK), matching how each doc was indexed.
  const queryTokens = index.tokensOf(query, locale); // the exact terms BM25 matches on
  // Field-prefix nav boost (typeahead): when the page/section NAME starts with the word being typed,
  // that's a strong "go here" signal — lift it over body-only matches (title/slug tier > heading tier
  // > body). Additive constants far above the BM25 range (~0–15) form clean tiers; BM25 orders within
  // a tier. Fires ONLY when the query is a SINGLE word — navigation is typing one name; once you've
  // typed multiple words it's a content query, so we leave it to pure BM25 (a benchmark showed the
  // any-last-token version hijacking content queries whose trailing word happened to name a section).
  // And only the FIRST word of the field counts, so "…guide" doesn't boost every "Guide" page.
  const navPrefix = navBoost && prefixLast && queryTokens.length === 1 && queryTokens[0]!.length >= 2
    ? queryTokens[0]! : null;
  const firstTok = (text?: string): string => { const t = index.tokensOf(text ?? "", locale); return t[0] ?? ""; };
  const boostOf = (d: KeywordData): number => {
    if (!navPrefix) return 0;
    const slugHead = d.slug.split(/[/-]/)[0] ?? "";
    if (slugHead.startsWith(navPrefix) || firstTok(d.title).startsWith(navPrefix)) return 1000; // page name
    if (d.heading && firstTok(d.heading).startsWith(navPrefix)) return 500; // section heading
    return 0;
  };
  const best = new Map<string, { hit: SearchHit; score: number }>();
  for (const h of index.search(query, { topK: fetchK, lang: locale, prefixLast })) {
    const rank = h.score + boostOf(h.data); // ranking score (BM25 + nav boost); hit.score stays BM25
    const hit: SearchHit = {
      slug: h.data.slug,
      title: h.data.title,
      section: h.data.section,
      text: snippetAround(h.data.body, queryTokens),
      score: Number(h.score.toFixed(3)),
      ...(h.data.html ? { html: h.data.html } : {}), // rich HTML preview (rendered section)
      ...(h.data.locale ? { locale: h.data.locale } : {}),
      ...(h.data.headingId ? { headingId: h.data.headingId, heading: h.data.heading } : {}),
    };
    // Dedup per heading-anchored section (slug#headingId), keeping each page's distinct headings
    // as separate hits; locale variants of the SAME section still collapse to the best one.
    const key = `${h.data.slug}#${h.data.headingId ?? ""}`;
    const prev = best.get(key);
    if (!prev) { best.set(key, { hit, score: rank }); continue; }
    const prefer = rank > prev.score || (!!locale && h.data.locale === locale && prev.hit.locale !== locale && rank >= prev.score);
    if (prefer) best.set(key, { hit, score: rank });
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
  /** i18n: the default locale. Locale-less entries/chunks belong to it (tokenization + scoping). */
  defaultLocale?: string;
  /** i18n: the merged entry set for a locale (variant-else-default — June's `docs(locale)` lister).
   *  With it, a search scoped to a locale runs over that locale's own corpus: translated pages match
   *  in their language, untranslated pages stay findable via the default text. */
  entriesFor?: (locale: string) => readonly DocLike[];
  /** i18n: the DECLARED locale tags. Anything else is treated as unset — bounds the per-locale
   *  index cache (MCP callers pass arbitrary strings) and keeps behavior deterministic. */
  knownLocales?: readonly string[];
}): SearchHandle {
  const tokenizer = opts.tokenizer ?? defaultTokenizer();
  const known = opts.knownLocales?.length ? new Set(opts.knownLocales) : null;
  // Normalize a requested locale: only declared tags scope the search; unknown/absent → default view.
  const scope = (l?: string): string | undefined => (l && known?.has(l) ? l : undefined);
  const entriesOf = (l?: string): readonly DocLike[] =>
    l && opts.entriesFor ? opts.entriesFor(l) : opts.entries;
  // One keyword index per SCOPED locale (bounded by knownLocales), built lazily. Key "" = default.
  const kwCache = new Map<string, Bm25<KeywordData>>();
  const kwFor = (l?: string): Bm25<KeywordData> => {
    const key = l ?? "";
    let idx = kwCache.get(key);
    if (!idx) kwCache.set(key, (idx = buildKeywordIndex(entriesOf(l), tokenizer, opts.defaultLocale)));
    return idx;
  };
  // Slugs that HAVE a variant in a locale — the merged semantics for chunk filtering: a translated
  // slug's default-language chunks must not surface in that locale's results.
  const variantCache = new Map<string, Set<string>>();
  const variantSlugsFor = (l: string): Set<string> => {
    let set = variantCache.get(l);
    if (!set) variantCache.set(l, (set = new Set(entriesOf(l).filter((e) => e.locale === l).map((e) => e.slug))));
    return set;
  };
  /** Keep a chunk in locale `l`'s view: its own variant, or the default text of an untranslated slug. */
  const inLocaleView = (l: string, chunkLocale: string | undefined, slug: string): boolean =>
    chunkLocale === l || ((chunkLocale ?? opts.defaultLocale) === opts.defaultLocale && !variantSlugsFor(l).has(slug));
  // No embedder → BM25 keyword mode. The index is built lazily from the bundled
  // entries on first search and cached; building is cheap at docs scale.
  if (!opts.embedder) {
    return {
      getKb: async () => null,
      search: async (query, o) => {
        const topK = o?.topK ?? 8;
        // Over-fetch sections, cap per page so one doc can't crowd the list, then take topK.
        const l = scope(o?.locale);
        // The QUERY tokenizes in the request locale, defaulting to the site's default locale — a
        // locale-less request on a CJK-default site must segment like its index did.
        const qLang = o?.locale ?? opts.defaultLocale;
        const hits = keywordSearch(kwFor(l), query, topK * 3, undefined, qLang, o?.prefix, o?.navBoost);
        return capPerPage(hits, o?.maxPerPage ?? 3).slice(0, topK);
      },
      tokensOf: (query, locale) => kwFor(scope(locale)).tokensOf(query, locale ?? opts.defaultLocale),
    };
  }
  const embedder = opts.embedder;
  let building: Promise<Kb<SearchData>> | null = null;
  const getKb = () =>
    (building ??= opts.indexBytes?.length
      ? Promise.resolve(Kb.load<SearchData>(opts.indexBytes, { embedder }))
      : indexKb(opts.entries, embedder)); // no/empty index bytes (e.g. --no-embed) → build from entries
  // (per-locale keyword indexes come from kwFor above; `keyword` kept the old single-index slot)

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
    const l = scope(o?.locale);
    const qLang = o?.locale ?? opts.defaultLocale; // query tokenization language (see keyword-only path)
    if (o?.mode === "keyword") {
      const hits = keywordSearch(kwFor(l), query, topK * 3, depth, qLang, o?.prefix, o?.navBoost);
      return capPerPage(hits, maxPerPage).slice(0, topK);
    }
    const kb = await getKb();
    // Locale scope on the vector side: the frozen index is majority-default-language, so a scoped
    // query OVER-FETCHES (a flat floor of 64, cheap at docs scale) before filtering — otherwise a
    // locale's chunks ranked below the unscoped depth cutoff would vanish (recall collapse).
    const vecDepth = l ? Math.max(depth, 64) : depth;
    const rawChunks = await kb.searchText(query, { topK: vecDepth });
    const scoped = l ? rawChunks.filter((h) => inLocaleView(l, h.data.locale, h.data.slug)) : rawChunks;
    const semantic = collapseSemantic(scoped.slice(0, depth), o?.locale);
    const keywordHits = keywordSearch(kwFor(l), query, depth, depth, qLang); // caller already over-fetched
    // Hybrid: keyword precision (exact terms) + semantic / cross-lingual recall, fused by
    // rank so BM25 scores and cosine similarities don't need to be comparable. Keyword first
    // so a section found by both lists keeps the query-term snippet; semantic-only hits keep their chunk.
    // Fuse by heading-anchored section (slug#headingId) so a page's distinct headings rank
    // independently. Use the fused RRF score for `score` so it's consistent with the ordering.
    const fused = rrfScored<SearchHit>([{ hits: keywordHits }, { hits: semantic }], (h) => `${h.slug}#${h.headingId ?? ""}`, { topK: topK * 3 })
      .map(({ item, score }) => ({ ...item, score: Number(score.toFixed(4)) }));
    return capPerPage(fused, maxPerPage).slice(0, topK);
  };

  return { getKb, search, tokensOf: (query, locale) => kwFor(scope(locale)).tokensOf(query, locale ?? opts.defaultLocale) };
}
