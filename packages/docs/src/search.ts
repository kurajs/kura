// Search wiring: build a search index from a content collection (build time) and
// load/serve it at runtime. Encapsulates chunking + the Kb engine + embedder.
import { Kb } from "@kurajs/core";
import type { Embedder } from "@kurajs/core";
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

// Lexical fallback used when no embedder is configured (e.g. a Cloudflare Workers deploy
// without Workers AI). Pure JS, zero-dependency: rank docs by query-term hits in title /
// section / body. Not semantic, but real search with no model and no native deps.
function lexicalSearch(entries: readonly DocLike[], query: string, topK: number): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const e of entries) {
    const title = String(e.data.title ?? e.slug);
    const section = String(e.data.section ?? "");
    const body = stripMdx(e.body ?? "");
    const lcTitle = title.toLowerCase(), lcSection = section.toLowerCase(), lcBody = body.toLowerCase();
    let score = 0;
    let firstAt = -1;
    for (const t of terms) {
      if (lcTitle.includes(t)) score += 5;
      if (lcSection.includes(t)) score += 2;
      const occ = lcBody.split(t).length - 1;
      score += Math.min(occ, 5);
      const at = lcBody.indexOf(t);
      if (at >= 0 && (firstAt < 0 || at < firstAt)) firstAt = at;
    }
    if (score <= 0) continue;
    const start = firstAt > 60 ? firstAt - 40 : 0;
    const text = body.slice(start, start + 160).trim();
    hits.push({ slug: e.slug, title, section, text, score, ...(e.locale ? { locale: e.locale } : {}) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Runtime search. With an embedder, runs semantic search over a precomputed index (fast; no
 * corpus embedding on the request thread), warming the model shortly after boot. WITHOUT an
 * embedder, search degrades to a zero-dependency lexical scan over the entries — so a site
 * still deploys (and searches) on Cloudflare Workers with no Workers AI. The embedder is the
 * optional upgrade from lexical to semantic.
 */
export function createSearch(opts: {
  entries: readonly DocLike[];
  embedder?: Embedder;
  indexBytes?: Uint8Array;
  warm?: boolean;
}): SearchHandle {
  // No embedder → lexical mode (no Kb, no index needed).
  if (!opts.embedder) {
    return {
      getKb: async () => null,
      search: async (query, o) => lexicalSearch(opts.entries, query, o?.topK ?? 8),
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
