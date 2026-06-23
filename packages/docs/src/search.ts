// Search wiring: build a search index from a content collection (build time) and
// load/serve it at runtime. Encapsulates chunking + the Kb engine + embedder.
import { Kb } from "@kurajs/core";
import type { Embedder } from "@kurajs/core";
import { Bm25 } from "@kurajs/search";
import type { DocLike } from "./nav.ts";
import { stripMdx } from "./util.ts";

export type SearchData = { slug: string; title: string; section: string; text: string; locale?: string };
export type SearchHit = { slug: string; title: string; section: string; text: string; score: number; locale?: string };

/** Split a doc body into overlapping chunks for embedding. */
export function chunk(text: string, size = 500, overlap = 80): string[] {
  const clean = text.replace(/\r/g, "");
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) out.push(clean.slice(i, Math.min(i + size, clean.length)).trim());
  return out.filter((c) => c.length > 30);
}

async function indexKb(entries: readonly DocLike[], embedder: Embedder): Promise<Kb<SearchData>> {
  const kb = new Kb<SearchData>({ embedder });
  let n = 0;
  for (const d of entries) {
    // Tag each chunk with the entry's authored locale (undefined = default) so a query
    // can be resolved to the right language; the id is locale-scoped to avoid collisions
    // between a doc and its variants (same slug across locales).
    const base = { slug: d.slug, title: String(d.data.title ?? d.slug), section: String(d.data.section ?? ""), ...(d.locale ? { locale: d.locale } : {}) };
    // Strip MDX/JSX tags before chunking so neither the embeddings nor the result snippets
    // carry raw `<Tab …>`-style markup.
    for (const c of chunk(stripMdx(d.body))) await kb.addText([{ id: `${d.locale ?? "_"}:${d.slug}#${n++}`, text: c, data: { ...base, text: c } }]);
  }
  return kb;
}

/** Build a serialized index by embedding every doc chunk. Use at build time (`kura index`). */
export async function buildIndex(opts: { entries: readonly DocLike[]; embedder: Embedder }): Promise<Uint8Array> {
  return (await indexKb(opts.entries, opts.embedder)).serialize();
}

export interface SearchHandle {
  getKb(): Promise<Kb<SearchData> | null>;
  search(query: string, opts?: { topK?: number; locale?: string }): Promise<SearchHit[]>;
}

// Keyword search via BM25 (Okapi), used when no embedder is configured (e.g. a
// Cloudflare Workers deploy without Workers AI). Pure JS, zero-dependency, no model —
// but a real ranked index: BM25's IDF + length normalization far outrank naive
// substring hit-counting (XQuAD en: R@1 92% vs 46%). Title and section are folded
// into the indexed text; a snippet is cut around the first query hit for display.
type KeywordData = { slug: string; title: string; section: string; body: string; locale?: string };

function buildKeywordIndex(entries: readonly DocLike[]): Bm25<KeywordData> {
  return Bm25.from(
    entries.map((e) => {
      const title = String(e.data.title ?? e.slug);
      const section = String(e.data.section ?? "");
      const body = stripMdx(e.body ?? "");
      return {
        id: `${e.locale ?? "_"}:${e.slug}`,
        text: `${title}\n${section}\n${body}`,
        data: { slug: e.slug, title, section, body, ...(e.locale ? { locale: e.locale } : {}) },
      };
    }),
  );
}

function snippetAround(body: string, query: string): string {
  const lc = body.toLowerCase();
  let firstAt = -1;
  for (const t of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const at = lc.indexOf(t);
    if (at >= 0 && (firstAt < 0 || at < firstAt)) firstAt = at;
  }
  const start = firstAt > 60 ? firstAt - 40 : 0;
  return body.slice(start, start + 160).trim();
}

function keywordSearch(index: Bm25<KeywordData>, query: string, topK: number): SearchHit[] {
  return index.search(query, { topK }).map((h) => ({
    slug: h.data.slug,
    title: h.data.title,
    section: h.data.section,
    text: snippetAround(h.data.body, query),
    score: Number(h.score.toFixed(3)),
    ...(h.data.locale ? { locale: h.data.locale } : {}),
  }));
}

/**
 * Runtime search. With an embedder, runs semantic search over a precomputed index (fast; no
 * corpus embedding on the request thread), warming the model shortly after boot. WITHOUT an
 * embedder, search falls back to a zero-dependency BM25 keyword index built from the entries —
 * so a site still deploys (and searches well) on Cloudflare Workers with no Workers AI. The
 * embedder is the optional upgrade from keyword to semantic.
 */
export function createSearch(opts: {
  entries: readonly DocLike[];
  embedder?: Embedder;
  indexBytes?: Uint8Array;
  warm?: boolean;
}): SearchHandle {
  // No embedder → BM25 keyword mode. The index is built lazily from the bundled
  // entries on first search and cached; building is cheap at docs scale.
  if (!opts.embedder) {
    let index: Bm25<KeywordData> | null = null;
    return {
      getKb: async () => null,
      search: async (query, o) => keywordSearch((index ??= buildKeywordIndex(opts.entries)), query, o?.topK ?? 8),
    };
  }
  const embedder = opts.embedder;
  let building: Promise<Kb<SearchData>> | null = null;
  const getKb = () =>
    (building ??= opts.indexBytes
      ? Promise.resolve(Kb.load<SearchData>(opts.indexBytes, { embedder }))
      : indexKb(opts.entries, embedder));

  if (opts.warm !== false) {
    setTimeout(() => { getKb().then((kb) => kb.searchText("warm", { topK: 1 })).catch(() => {}); }, 50);
  }

  const search = async (query: string, o?: { topK?: number; locale?: string }): Promise<SearchHit[]> => {
    const kb = await getKb();
    const topK = o?.topK ?? 8;
    // Over-fetch so we can collapse a doc's many chunks (and its locale variants) into one
    // hit per slug. bge-m3 is multilingual, so a query naturally ranks same-language chunks
    // higher; on top of that we prefer the active locale's variant when scores are comparable.
    const raw = await kb.searchText(query, { topK: topK * 4 });
    const best = new Map<string, { hit: SearchHit; score: number }>();
    for (const h of raw) {
      const hit: SearchHit = { slug: h.data.slug, title: h.data.title, section: h.data.section, score: Number(h.score.toFixed(3)), text: h.data.text, locale: h.data.locale };
      const prev = best.get(h.data.slug);
      if (!prev) { best.set(h.data.slug, { hit, score: h.score }); continue; }
      // Keep the higher score; tie-break toward the reader's locale for a same-language snippet.
      const prefer = h.score > prev.score || (o?.locale && h.data.locale === o.locale && prev.hit.locale !== o.locale && h.score >= prev.score - 0.04);
      if (prefer) best.set(h.data.slug, { hit, score: h.score });
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, topK).map((e) => e.hit);
  };

  return { getKb, search };
}
