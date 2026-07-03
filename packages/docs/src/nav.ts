// Headless docs navigation: sidebar tree, prev/next, and ToC extraction — derived
// from a content collection (the app passes its June-frozen DOCS). No June/React import.
import type { MetaMap } from "./meta.ts";

export interface DocLike {
  slug: string;
  data: { title?: string; description?: string; section?: string; order?: string | number; lastUpdated?: string };
  html: string;
  original: string;
  body: string;
  /** The locale this entry was authored in (June ≥0.0.25); undefined = flat default. */
  locale?: string;
}

export type Toc = { level: number; text: string; id: string }[];

export interface Nav<T extends DocLike = DocLike> {
  groups(): { title: string; items: T[] }[];
  ordered(): T[];
  prevNext(slug: string): { prev: T | null; next: T | null };
}

/** Build the nav from a content collection. `sections` sets sidebar group order. */
export function createNav<T extends DocLike>(opts: { entries: readonly T[]; sections?: string[] }): Nav<T> {
  const order = opts.sections ?? [];
  const groups = () => {
    const m = new Map<string, T[]>();
    for (const d of opts.entries) {
      const s = String(d.data.section ?? "Other");
      const a = m.get(s) ?? [];
      a.push(d);
      m.set(s, a);
    }
    const secs = [...m.entries()].map(([title, items]) => ({
      title,
      items: [...items].sort((a, b) => Number(a.data.order) - Number(b.data.order)),
    }));
    const rank = (t: string) => { const i = order.indexOf(t); return i < 0 ? 1e9 : i; };
    secs.sort((a, b) => rank(a.title) - rank(b.title));
    return secs;
  };
  const ordered = () => groups().flatMap((g) => g.items);
  const prevNext = (slug: string) => {
    const all = ordered();
    const i = all.findIndex((d) => d.slug === slug);
    return { prev: i > 0 ? all[i - 1] : null, next: i >= 0 && i < all.length - 1 ? all[i + 1] : null };
  };
  return { groups, ordered, prevNext };
}

// A sidebar node: a doc leaf, or a folder group (collapsible). A group with an `index` entry is
// "folder-as-page" — its header links to that page AND expands the children (the index is not listed
// as a separate child). `index` is the folder's index.md / README.md (slug collapsed to the folder).
export type NavNode<T extends DocLike> =
  | { kind: "doc"; entry: T }
  | { kind: "group"; key: string; title: string; index?: T; defaultOpen?: boolean; children: NavNode<T>[] };

// "manual-installation" → "Manual installation". Folder fallback title when meta gives none.
export function humanize(seg: string): string {
  const s = seg.replace(/[-_]/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : seg;
}

// Build a nested tree from a flat entry list, using slug "/" segments as folders: `guides/install`
// → a "guides" group containing the "install" leaf. Flat slugs stay top-level. Per-folder `meta`
// (keyed by folder path) sets the group title + child order (meta.pages, by name); without meta a
// group's title is humanized and ordering falls back to frontmatter `order`.
export function treeOf<T extends DocLike>(entries: readonly T[], meta?: MetaMap): NavNode<T>[] {
  type G = { key: string; order: number; groups: Map<string, G>; docs: { order: number; entry: T }[] };
  const mkG = (key: string): G => ({ key, order: Infinity, groups: new Map(), docs: [] });
  const root = mkG("");
  for (const e of entries) {
    const parts = e.slug.split("/");
    const order = Number(e.data.order ?? Infinity);
    let g = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!;
      if (!g.groups.has(seg)) g.groups.set(seg, mkG(seg));
      g = g.groups.get(seg)!;
      g.order = Math.min(g.order, order);
    }
    g.docs.push({ order, entry: e });
  }
  const lastSeg = (slug: string) => slug.split("/").pop() || slug;
  const build = (g: G, path: string): NavNode<T>[] => {
    const pages = meta?.[path]?.pages;
    // Rank by position in meta.pages (by child name); unlisted items fall after, in `order`.
    const rank = (name: string, fallback: number): number => {
      if (!pages) return fallback;
      const i = pages.indexOf(name);
      return i >= 0 ? i : pages.length + (Number.isFinite(fallback) ? fallback : 1e6);
    };
    // A doc whose name matches a sibling folder IS that folder's index page (folder-as-page) — pull it
    // out of the leaf list and attach it to the group; everything else is a normal leaf.
    const indexByFolder = new Map<string, { order: number; entry: T }>();
    const leaves: { order: number; entry: T }[] = [];
    for (const d of g.docs) {
      const name = lastSeg(d.entry.slug);
      if (g.groups.has(name)) indexByFolder.set(name, d);
      else leaves.push(d);
    }
    const groups = [...g.groups.entries()].map(([key, c]) => {
      const childPath = path ? `${path}/${key}` : key;
      const cm = meta?.[childPath];
      const idx = indexByFolder.get(key);
      return {
        rank: rank(key, idx ? idx.order : c.order),
        node: { kind: "group", key, title: cm?.title ?? humanize(key), index: idx?.entry, defaultOpen: cm?.defaultOpen, children: build(c, childPath) } as NavNode<T>,
      };
    });
    const docs = leaves.map((d) => ({ rank: rank(lastSeg(d.entry.slug), d.order), node: { kind: "doc", entry: d.entry } as NavNode<T> }));
    return [...groups, ...docs].sort((a, b) => a.rank - b.rank).map((x) => x.node);
  };
  return build(root, "");
}

// Flatten a nav tree into the linear reading order shown in the sidebar (depth-first: a folder's
// index page first, then its children). prev/next walk THIS, so they always match the sidebar.
export function flattenTree<T extends DocLike>(nodes: readonly NavNode<T>[]): T[] {
  const out: T[] = [];
  for (const n of nodes) {
    if (n.kind === "doc") out.push(n.entry);
    else {
      if (n.index) out.push(n.index);
      out.push(...flattenTree(n.children));
    }
  }
  return out;
}

/** Normalize a configured base path: `undefined` → "/docs"; "" → site root; otherwise a single
 *  leading slash and no trailing slash (`"docs/"` → "/docs", `"/"` → ""). */
export function normalizeBasePath(raw?: string): string {
  if (raw === undefined) return "/docs";
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "" : "/" + trimmed;
}

/** A doc route path from a base path + slug: `docPath("/docs","a/b")` → "/docs/a/b";
 *  `docPath("","a")` → "/a". Append the extension into the slug for `.md`/`.json` projections. */
export const docPath = (basePath: string, slug: string): string => `${basePath}/${slug}`;

/** The OG image URL for a doc page. The home page (empty slug) uses the sentinel "index" so the URL
 *  is `/og/index.png`, never the broken `/og/.png`. The route handler reverses this via
 *  normalizeOgSlug(), so meta tags and the catch-all `og/[[...slug]]` route always agree. A trailing
 *  slash on `siteUrl` (a common config slip) is trimmed so the result never has a `//`. */
export const ogImageUrl = (siteUrl: string, slug: string): string =>
  `${siteUrl.replace(/\/+$/, "")}/og/${slug || "index"}.png`;

/** Recover a doc slug from the OG route's catch-all param: strip the `.png` and map the home
 *  sentinel back. `"getting-started/sdk.png"` → "getting-started/sdk"; `"index.png"`/`"index"` → "".
 *  Pairs with ogImageUrl(); a nested slug arrives already joined by June's `[[...slug]]`. */
export const normalizeOgSlug = (raw: string | undefined): string => {
  const s = String(raw ?? "").replace(/\.png$/, "");
  return s === "index" ? "" : s;
};

/** Resolve the doc slug an OG route param refers to. Prefers a literal doc match so a page actually
 *  named "index" (from `index/index.md`) wins over the home sentinel — otherwise it would render the
 *  home card. Falls back to normalizeOgSlug() (mapping the "index" sentinel → home "") when no doc
 *  owns the literal slug. */
export const resolveOgSlug = (docSlugs: ReadonlySet<string>, raw: string | undefined): string => {
  const literal = String(raw ?? "").replace(/\.png$/, "");
  return docSlugs.has(literal) ? literal : normalizeOgSlug(raw);
};

/** The canonical URL for a doc page: `siteUrl` + its doc path, trailing slash trimmed (root stays
 *  "/"). `canonicalUrl("https://x.dev","/docs","a/b")` → "https://x.dev/docs/a/b"; the home page →
 *  "https://x.dev/docs" (or "https://x.dev/" when basePath is ""). A trailing slash on `siteUrl` is
 *  trimmed so the result never has a `//`. */
export const canonicalUrl = (siteUrl: string, basePath: string, slug: string): string =>
  siteUrl.replace(/\/+$/, "") + (docPath(basePath, slug).replace(/\/$/, "") || "/");

/** The top-level folder of a slug (`features/search/x` → `features`); "" for a bare slug. */
export const topFolderOf = (slug: string): string => slug.split("/")[0] ?? "";

/** Index of the tab whose `pages` include the slug's top-level folder; 0 (the first tab) when none
 *  match — so an unknown/empty slug lands on the first tab rather than nowhere. */
export function activeTabIndex(tabs: readonly { pages: string[] }[], slug: string): number {
  const top = topFolderOf(slug);
  const i = tabs.findIndex((t) => t.pages.includes(top));
  return i >= 0 ? i : 0;
}

export function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[`*_~]/g, "").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "");
}

/** A stateful heading-id generator for ONE document. Slugifies the heading text, falls back to
 *  "section" when slugify yields "" (a punctuation/emoji-only heading would otherwise get id=""),
 *  and de-dups repeats github-slugger style: the first use keeps the bare slug, later ones get -1,
 *  -2, …. Use one slugger per document so the renderer (processHtml) and the search indexer
 *  (splitByHeadings) walk the same headings in order and assign IDENTICAL ids — search deep-links
 *  (`#id`) must match the rendered anchors, including for repeated and h4 headings. */
export function createSlugger(): (text: string) => string {
  const taken = new Map<string, number>(); // every emitted id → its next suffix counter
  return (text: string) => {
    const base = slugify(text) || "section";
    let id = base;
    // Re-check the candidate against ALL emitted ids, not just the base count: a suffixed id like
    // "setup-1" can also be the NATURAL slug of a different heading ("Setup 1"), so keep incrementing
    // until the id is genuinely free (github-slugger's algorithm).
    while (taken.has(id)) {
      const n = (taken.get(base) ?? 0) + 1;
      taken.set(base, n);
      id = `${base}-${n}`;
    }
    taken.set(id, taken.get(id) ?? 0);
    return id;
  };
}

/** Inject ids into h2–h4 of rendered HTML and extract the table of contents. */
export function processHtml(html: string): { html: string; toc: Toc } {
  const toc: Toc = [];
  const slugId = createSlugger();
  html = collapseInPageToc(html, slugId); // fold a hand-written "Table of Contents" list into a collapsed
  // <details>; done BEFORE the heading pass, so that heading is no longer an <h*> and thus also drops out
  // of the right-rail `toc` below. Its id comes from the SAME slugger, so a later real heading with the
  // same text can't collide with it (and ids stay aligned with the search indexer).
  const out = html.replace(/<h([2-4])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    const id = slugId(text);
    toc.push({ level: Number(lvl), text, id });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}

// A doc that hand-writes a "## Table of Contents" list duplicates the auto-generated right-rail ToC and
// eats a screenful of vertical space. Detect that heading + the list right after it and fold both into a
// <details> that is closed by default. Only a list that actually looks like a ToC (mostly in-page anchor
// links) is wrapped, so an ordinary list that happens to follow such a heading is left untouched.
// h2–h4 only, matching the scope of the heading-id pass and the search indexer (splitByHeadings scans
// ##–####), so the folded ToC's slugger id stays aligned with them.
const TOC_HEADING = /<h([2-4])(?:\s[^>]*)?>\s*(Table of Contents|Contents)\s*<\/h\1>/gi;

function collapseInPageToc(html: string, slugId: (text: string) => string): string {
  let result = "";
  let last = 0;
  let m: RegExpExecArray | null;
  TOC_HEADING.lastIndex = 0;
  while ((m = TOC_HEADING.exec(html))) {
    const afterHeading = m.index + m[0].length;
    const lead = /^(\s*)<(ul|ol)[\s>]/.exec(html.slice(afterHeading));
    if (!lead) continue; // heading not immediately followed by a list → leave it alone
    const listStart = afterHeading + lead[1].length;
    const listEnd = matchBalancedTag(html, listStart, lead[2]);
    if (listEnd < 0) continue;
    if (!looksLikeToc(html.slice(listStart, listEnd))) continue;
    // Authors often fence the ToC with `---` rules; once it is a collapsed <details> those <hr>s are
    // just noise, so drop one immediately before the heading and one immediately after the list.
    let start = m.index;
    const before = /<hr\b[^>]*>\s*$/i.exec(html.slice(last, start));
    if (before) start = last + before.index;
    let end = listEnd;
    const after = /^\s*<hr\b[^>]*>/i.exec(html.slice(end));
    if (after) end += after[0].length;
    result += html.slice(last, start);
    result += `<details class="kura-toc" id="${slugId(m[2])}"><summary class="chevron">${m[2]}</summary>${html.slice(listStart, listEnd)}</details>`;
    last = end;
    TOC_HEADING.lastIndex = end; // resume scanning after the wrapped list (and consumed hr)
  }
  return last === 0 ? html : result + html.slice(last);
}

/** Index just past the balanced closing </tag> for the opening <tag at `start` (handles nesting), or -1. */
function matchBalancedTag(html: string, start: number, tag: string): number {
  const re = new RegExp(`<(/?)${tag}[\\s>]`, "gi");
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  return -1;
}

/** A list is a ToC when it has links and most of them are in-page anchors (href="#…"). */
function looksLikeToc(listHtml: string): boolean {
  const links = (listHtml.match(/<a\s[^>]*href=/gi) || []).length;
  if (links === 0) return false;
  const anchors = (listHtml.match(/<a\s[^>]*href="#/gi) || []).length;
  return anchors >= Math.ceil(links * 0.6);
}

/** Rewrite in-content Markdown cross-links (`<a href="…foo.md">` / `foo.md#anchor`) to the target
 *  doc's real URL. Authors write repo-relative `[x](other.md)` links; without this they resolve
 *  against the CURRENT page URL (→ 404), so every docs tool rewrites them. `resolve(href)` returns
 *  the doc URL (basePath + slug, `#anchor` preserved) or null to leave the link as-is (external,
 *  non-.md, or unresolved). Runs on rendered HTML (after processHtml). */
export function rewriteDocLinks(html: string, resolve: (href: string) => string | null): string {
  return html.replace(/(<a\b[^>]*?\shref=")([^"]*)(")/gi, (m, pre: string, href: string, post: string) => {
    const u = resolve(href);
    return u == null ? m : pre + u + post;
  });
}
