// createDocs() — the one wiring point. Given a content collection, config, and a
// precomputed index, it returns bound route handlers (loader/View/md/json/metadata for
// docs, home, and search) plus the agent actions. An app's kura.config.ts calls this; the
// route files just re-export the handlers, and importing it registers the MCP tools.
//
// Locale-aware by absence: with no `i18n` the finders are called without a locale and
// every per-locale helper collapses to the single default collection (zero overhead).
// With `i18n`, June resolves ctx.locale before routing; the loaders thread it into the
// content finders (variant → default fallback), the nav, the labels, and the MDX bucket.
import { createNav, treeOf, flattenTree, processHtml, rewriteDocLinks, topFolderOf, activeTabIndex, normalizeBasePath, docPath, ogImageUrl, canonicalUrl, type DocLike, type Nav, type NavNode } from "./nav.ts";
import { mergeMeta, type MetaMap, type TabConfig } from "./meta.ts";
import { createSearch, type SearchHit } from "./search.ts";
import { docsActions } from "./actions.ts";
import { DocsLayoutShell, DocBody, SearchResults, type SiteInfo, type SidebarGroup, type SidebarNode, type DocView, type Href, type LocaleLink, type TabLink, type NavTab } from "./ui.tsx";
import type { KuraConfig } from "./config.ts";
import { resolveLabels, pickLabel, type Labels } from "./labels.ts";
import { localeHref, type I18nConfig } from "@junejs/core/i18n";
import { JuneOutlet } from "@junejs/core/outlet";
import { currentLocale } from "@junejs/db";
import type React from "react";
import { stripMdx } from "./util.ts";
import { createOgRoute } from "./og.js";

type DocCtx = { params?: { slug?: string }; locale?: string };
type SearchCtx = { url: URL; locale?: string };

/** A June content finder: `doc(slug)` single-locale, `doc(slug, locale)` localized. */
type Finder<T> = (slug: string, locale?: string, opts?: { fallback?: boolean }) => T | null | undefined;
/** A June locale-merged lister: each entry is its locale variant when present, else default. */
type Lister<T> = (locale?: string) => readonly T[];

/** The loader payload: the page plus its locale-resolved chrome, so the View and the
 *  .md/.json projections stay pure functions of their own data. */
export type DocPage = { doc: DocView; sidebar: SidebarGroup[]; tabs?: TabLink[]; labels: Labels; locale?: string };

export function createDocs<T extends DocLike>(opts: {
  content: { DOCS: readonly T[]; doc: Finder<T>; docs?: Lister<T> };
  config: KuraConfig;
  /** Routing i18n — pass june.config.ts's `i18n` verbatim. Drives fallback detection,
   *  localized internal links, and the language switcher. Omit for a single-locale site. */
  i18n?: I18nConfig;
  indexBytes?: Uint8Array;
  /** Precompiled MDX html bucketed by locale ("default" = flat default), built by `kura index`. */
  mdxHtml?: Record<string, Record<string, string>>;
  /** Per-folder nav metadata (folder path → { title, pages }), frozen from meta.json by `kura index`. */
  meta?: MetaMap;
  /** Per-locale meta overrides (locale → folder path → { title, … }), from each locale's mirror.
   *  Merged over `meta` per folder, so a locale localizes folder group titles (and order) without
   *  restating the whole tree. Frozen as `META_LOCALES` by `kura index`. */
  metaLocales?: Record<string, MetaMap>;
  /** Per-doc last-updated ISO date (slug → date), frozen as `LAST_UPDATED` by `kura index` when
   *  `config.lastUpdated` is on (an empty map otherwise → no dates shown). A frontmatter
   *  `lastUpdated:` on a page overrides its entry here. */
  lastUpdated?: Record<string, string>;
}) {
  const { DOCS, doc, docs } = opts.content;
  // embedder is OPTIONAL: with one, search is semantic (over the frozen index); without one,
  // createSearch degrades to a lexical scan — so a site deploys + searches on Workers with no AI.
  // i18n drives every internal link's locale prefix (hrefFor → localeHref). Accept it either as a
  // top-level option OR (the common path) read it from `config.i18n` — the generated .june/routes
  // barrel passes only `config`, so requiring the top-level form silently dropped the locale prefix
  // from sidebar/pager links on every zero-boilerplate site (currentLocale worked; hrefFor didn't).
  const i18n = opts.i18n ?? opts.config.i18n;
  const defaultLocale = i18n?.defaultLocale;
  // URL prefix for doc pages ("/docs" default, "" = site root). All generated doc links go through
  // docPath(basePath, …); the app mounts its route files to match.
  const basePath = normalizeBasePath(opts.config.basePath);
  // Deploy subpath (config.deploy.basePath) — the prefix the WHOLE site is served under on a static
  // host (e.g. GitHub Pages "/openab/docs"). Orthogonal to `basePath` (the docs-mount prefix): the
  // two compose in the final URL. Empty for a root deploy → every link is byte-identical to before.
  // (June's document prefixes ASSET urls with the same value; here we prefix Kura's own nav links.)
  const deployBase = (opts.config.deploy?.basePath ?? "").replace(/^\/+|\/+$/g, "");
  const deployPrefix = deployBase ? "/" + deployBase : "";

  // Localize an internal route path to a locale (identity when i18n is off), then prefix the deploy
  // subpath; build the language-switcher links for a given page (its URL in every locale). Both lean
  // on June's localeHref so inbound routing and these outbound links can never drift.
  const hrefFor = (locale?: string): Href =>
    i18n
      ? (path) => deployPrefix + localeHref(i18n, path, locale ?? i18n.defaultLocale)
      : (path) => deployPrefix + path;
  const localeName = (l: string): string => opts.config.localeNames?.[l] ?? l;
  const switchFor = (locale: string | undefined, routePath: string): LocaleLink[] | undefined =>
    i18n
      ? Object.keys(i18n.locales).map((l) => ({
          locale: l,
          name: localeName(l),
          href: deployPrefix + localeHref(i18n, routePath, l),
          active: l === (locale ?? i18n.defaultLocale),
        }))
      : undefined;

  // Resolve in-content Markdown cross-links (`[x](other.md)`) to the target doc's real URL: match the
  // link to a doc slug (exact, else by basename) and route it through hrefFor so it carries the docs
  // mount, locale prefix, and deploy subpath. Lets repo-relative .md links survive folder grouping.
  const slugSet = new Set<string>(DOCS.map((d) => d.slug));
  const byBasename = new Map<string, string[]>();
  for (const d of DOCS) {
    const b = d.slug.split("/").pop() ?? d.slug;
    const arr = byBasename.get(b);
    arr ? arr.push(d.slug) : byBasename.set(b, [d.slug]);
  }
  const resolveDocSlug = (target: string): string | null => {
    const clean = target.replace(/\.md$/i, "").replace(/^(\.\.?\/)+/, "").replace(/^\/+/, "");
    if (slugSet.has(clean)) return clean;
    const cands = byBasename.get(clean.split("/").pop() ?? "");
    // Prefer the shallowest slug (a top-level doc over a same-named ADR), then lexical for stability.
    return cands?.length ? [...cands].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0]! : null;
  };
  const docLinkResolver = (locale?: string) => (href: string): string | null => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) return null; // external / bare anchor
    const hash = href.indexOf("#");
    const p = hash >= 0 ? href.slice(0, hash) : href;
    if (!/\.md$/i.test(p)) return null; // only Markdown links
    const slug = resolveDocSlug(p);
    return slug == null ? null : hrefFor(locale)(docPath(basePath, slug)) + (hash >= 0 ? href.slice(hash) : "");
  };

  const site: SiteInfo = { name: opts.config.site?.name, brand: opts.config.site?.brand };
  const search = createSearch({ entries: DOCS, embedder: opts.config.embedder, indexBytes: opts.indexBytes, tokenizer: opts.config.tokenizer });
  const actions = docsActions({ search, entries: DOCS, doc });

  // Folder nav metadata for a locale: the default `meta`, with this locale's per-folder overrides
  // merged in (shallow, per folder key) so a locale can relabel/reorder a folder without restating
  // the rest. No i18n (or no override for the locale) → the default map, untouched. Memoized.
  const metaCache = new Map<string, MetaMap | undefined>();
  const metaFor = (locale?: string): MetaMap | undefined => {
    const over = locale ? opts.metaLocales?.[locale] : undefined;
    if (!over) return opts.meta;
    const key = locale!;
    let m = metaCache.get(key);
    if (!m) {
      m = mergeMeta(opts.meta, over);
      metaCache.set(key, m);
    }
    return m;
  };

  // Tabs (Mintlify-style): an optional grouping of top-level section folders, declared in the ROOT
  // meta.json (`tabs: [{title, pages}]`). Off by absence → today's single sidebar. URLs are unchanged
  // — a tab is pure navigation, resolved from the slug's top-level folder, never a path prefix.
  // STRUCTURE is single-source (the default meta, locale-independent — arrays don't merge per-locale
  // cleanly); only the TITLE localizes, via config.tabLabels keyed by the English title.
  const tabDefs = (): TabConfig[] | undefined => {
    if (hasSections) return undefined;
    const t = opts.meta?.[""]?.tabs;
    return t && t.length ? t : undefined;
  };
  const tabLabel = (locale: string | undefined, title: string): string => pickLabel(opts.config.tabLabels, locale, title);
  // The top-level folders shown for the tab that owns `slug` (undefined = no tabs → all folders).
  const tabFoldersFor = (slug?: string): string[] | undefined => {
    const defs = tabDefs();
    return defs ? defs[activeTabIndex(defs, slug ?? "")]!.pages : undefined;
  };

  // Per-locale entries + nav, memoized — built once per locale, reused across requests.
  const entriesFor = (locale?: string): readonly T[] => (docs ? docs(locale) : DOCS);
  const navCache = new Map<string, Nav<T>>();
  const navFor = (locale?: string): Nav<T> => {
    const key = locale ?? "";
    let n = navCache.get(key);
    if (!n) {
      n = createNav({ entries: entriesFor(locale), sections: opts.config.sections });
      navCache.set(key, n);
    }
    return n;
  };
  // Section frontmatter values are stable KEYS; sectionLabels maps them to localized headings.
  const sectionLabel = (locale: string | undefined, key: string): string =>
    (locale ? opts.config.sectionLabels?.[locale]?.[key] : undefined) ?? key;
  // Section = top group; within it, slug folders nest (treeOf) into collapsible sub-groups.
  const toNode = (n: NavNode<T>): SidebarNode =>
    n.kind === "doc"
      ? { slug: n.entry.slug, title: String(n.entry.data.title ?? n.entry.slug) }
      : { title: n.title, items: n.children.map(toNode), ...(n.index ? { slug: n.index.slug } : {}) };
  // Two nav models. With `section` frontmatter → sections are the top groups (folders nest within).
  // Without → folder-driven (Fumadocs/GitBook style): top-level FOLDERS are the sections, ordered by
  // the root meta.json; a folder's index shows as its first item.
  const hasSections = DOCS.some((d) => d.data.section);
  // A top-level folder group → a sidebar section: its index page (if any) leads, then its children.
  const groupToSection = (n: Extract<NavNode<T>, { kind: "group" }>): SidebarGroup => {
    const items: SidebarNode[] = [];
    if (n.index) items.push({ slug: n.index.slug, title: String(n.index.data.title ?? n.title) });
    items.push(...n.children.map(toNode));
    return { title: n.title, items };
  };
  // `tabFolders` restricts the sidebar to one tab's top-level folders (in order); undefined = all.
  const sidebarFor = (locale?: string, tabFolders?: string[]): SidebarGroup[] => {
    const meta = metaFor(locale);
    if (hasSections) {
      return navFor(locale).groups().map((g) => ({
        title: sectionLabel(locale, g.title),
        items: treeOf(g.items, meta).map(toNode),
      }));
    }
    const byKey = new Map<string, Extract<NavNode<T>, { kind: "group" }>>();
    const loose: SidebarNode[] = [];
    for (const n of treeOf(entriesFor(locale), meta)) {
      if (n.kind === "group") byKey.set(n.key, n);
      else loose.push(toNode(n));
    }
    if (tabFolders) return tabFolders.map((k) => byKey.get(k)).filter((n): n is Extract<NavNode<T>, { kind: "group" }> => !!n).map(groupToSection);
    const groups = [...byKey.values()].map(groupToSection);
    return loose.length ? [{ title: "", items: loose }, ...groups] : groups;
  };

  // prev/next follow the SAME order as the sidebar (the flattened nav tree), not the legacy
  // section/frontmatter order — so they match what the reader sees. Memoized per locale.
  const orderCache = new Map<string, readonly T[]>();
  const orderedFor = (locale?: string, tabFolders?: string[]): readonly T[] => {
    const key = `${locale ?? ""}::${tabFolders ? tabFolders.join(",") : "*"}`;
    let o = orderCache.get(key);
    if (!o) {
      if (hasSections) {
        o = navFor(locale).groups().flatMap((g) => flattenTree(treeOf(g.items, metaFor(locale))));
      } else {
        const nodes = treeOf(entriesFor(locale), metaFor(locale));
        const scoped = tabFolders
          ? tabFolders.map((k) => nodes.find((n) => n.kind === "group" && n.key === k)).filter((n): n is NavNode<T> => !!n)
          : nodes;
        o = flattenTree(scoped);
      }
      orderCache.set(key, o);
    }
    return o;
  };
  // prev/next stay WITHIN the active tab (you don't page from one tab into another).
  const prevNextOf = (slug: string, locale?: string): { prev: T | null; next: T | null } => {
    const all = orderedFor(locale, tabFoldersFor(slug));
    const i = all.findIndex((e) => e.slug === slug);
    return { prev: i > 0 ? all[i - 1]! : null, next: i >= 0 && i < all.length - 1 ? all[i + 1]! : null };
  };
  // The tab bar for a page: each tab links to its first page; the tab owning `slug` is active.
  const tabBarFor = (locale: string | undefined, slug: string): TabLink[] | undefined => {
    const defs = tabDefs();
    if (!defs) return undefined;
    const ai = activeTabIndex(defs, slug);
    const h = hrefFor(locale);
    return defs.map((t, i) => {
      const landing = orderedFor(locale, t.pages)[0];
      return { title: tabLabel(locale, t.title), href: h(docPath(basePath, landing ? landing.slug : t.pages[0]!)), active: i === ai };
    });
  };
  const labelsFor = (locale?: string): Labels => resolveLabels(locale, opts.config.labels);

  // The full nav for the persistent shell: every tab + its sidebar groups (the client filters to
  // the active tab). No tabs → one unnamed tab carrying all groups.
  const navTabsFor = (locale?: string): NavTab[] => {
    const h = hrefFor(locale);
    const defs = tabDefs();
    if (!defs) return [{ key: "_", title: "", href: h(docPath(basePath, "")), groups: sidebarFor(locale) }];
    return defs.map((t) => {
      const landing = orderedFor(locale, t.pages)[0];
      return { key: t.title, title: tabLabel(locale, t.title), href: h(docPath(basePath, landing ? landing.slug : t.pages[0]!)), groups: sidebarFor(locale, t.pages) };
    });
  };

  // The PERSISTENT docs shell as a segment-boundary layout (mount it at app/layout.tsx with
  // `export const segmentBoundary = true`). June renders it once per shell; a soft-nav swaps only
  // the <JuneOutlet> content. The layout gets no ctx, so it reads the request locale + derives
  // active state on the client (see DocsLayoutShell).
  const layout = ({ children }: { children: React.ReactNode }) => {
    const locale = opts.config.i18n ? currentLocale() : undefined;
    return (
      <DocsLayoutShell site={site} navTabs={navTabsFor(locale)} basePath={basePath} labels={labelsFor(locale)} href={hrefFor(locale)} localeSwitch={switchFor(locale, "")}>
        <JuneOutlet>{children}</JuneOutlet>
      </DocsLayoutShell>
    );
  };

  // MDX html for an entry: its own locale bucket → the default bucket → plain markdown html.
  const mdxFor = (e: T): string =>
    opts.mdxHtml?.[e.locale ?? "default"]?.[e.slug] ?? opts.mdxHtml?.default?.[e.slug] ?? e.html;

  const viewOf = (e: T, locale?: string): DocView => {
    const { html: anchored, toc } = processHtml(mdxFor(e));
    const html = rewriteDocLinks(anchored, docLinkResolver(locale)); // repo-relative .md links → doc URLs
    const { prev, next } = prevNextOf(e.slug, locale);
    // A non-default locale that resolved to a non-variant entry fell back to default.
    const notTranslated = !!(locale && defaultLocale && locale !== defaultLocale && e.locale !== locale);
    const description = e.data.description ? String(e.data.description) : undefined;
    // A frontmatter `lastUpdated:` overrides the git-derived date; both absent → no line.
    const lastUpdated =
      (typeof e.data.lastUpdated === "string" ? e.data.lastUpdated : undefined) ?? opts.lastUpdated?.[e.slug];
    return {
      slug: e.slug,
      title: String(e.data.title ?? e.slug),
      section: sectionLabel(locale, String(e.data.section ?? "")),
      ...(description ? { description } : {}),
      html,
      toc,
      prev: prev ? { slug: prev.slug, title: String(prev.data.title ?? prev.slug) } : null,
      next: next ? { slug: next.slug, title: String(next.data.title ?? next.slug) } : null,
      notTranslated,
      ...(lastUpdated ? { lastUpdated } : {}),
    };
  };

  // The site's landing page (`/`): a root `content/docs/index.md` (slug "") if present — so a
  // hand-written home wins — else the first page of the first tab (or the global first).
  const first = (locale?: string): T | undefined => {
    const root = doc("", locale);
    if (root) return root;
    const defs = tabDefs();
    return orderedFor(locale, defs ? defs[0]!.pages : undefined)[0];
  };
  const resolve = (slug: string | undefined, locale?: string): T | undefined =>
    slug ? doc(slug, locale) ?? undefined : first(locale);
  const pageOf = (e: T, locale?: string): DocPage => ({
    doc: viewOf(e, locale),
    sidebar: sidebarFor(locale, tabFoldersFor(e.slug)),
    tabs: tabBarFor(locale, e.slug),
    labels: labelsFor(locale),
    locale,
  });

  // Content-only: the persistent shell (sidebar/topbar) lives in the segment-boundary `layout`;
  // this renders just the page body into the <JuneOutlet>, so a soft-nav swaps only this region.
  const View = (d: DocPage) => (
    <DocBody doc={d.doc} basePath={basePath} labels={d.labels} href={hrefFor(d.locale)} mermaidCdn={opts.config.mermaidCdn} locale={d.locale} />
  );
  const md = (d: DocPage) => stripMdx(doc(d.doc.slug, d.locale)?.original ?? "");
  const json = (d: DocPage) => {
    const e = doc(d.doc.slug, d.locale);
    return { slug: d.doc.slug, title: d.doc.title, section: d.doc.section, locale: d.locale, markdown: e?.original, body: e?.body };
  };
  const siteUrl = opts.config.siteUrl;
  const siteDesc = opts.config.site?.description;
  // Static targets have no server, so the dynamic OG image route is dropped from codegen — don't
  // emit og:image URLs that would 404. (Set siteUrl to the full deploy URL incl. the subpath for
  // correct canonical/OG links under a project subpath.)
  const isStatic = opts.config.deploy?.target === "static" || opts.config.deploy?.target === "github-pages";
  const metadata = (d: DocPage) => {
    const desc = d.doc.description ?? siteDesc;
    // Empty slug (home) → /og/index.png, not the broken /og/.png; nested slugs pass through and the
    // catch-all OG route resolves them. canonical needs siteUrl, so both are gated on it.
    const ogImage = siteUrl && !isStatic ? ogImageUrl(siteUrl, d.doc.slug) : undefined;
    return {
      title: d.doc.title,
      ...(desc ? { description: desc } : {}),
      ...(siteUrl ? { canonical: canonicalUrl(siteUrl, basePath, d.doc.slug) } : {}),
      openGraph: {
        title: d.doc.title,
        ...(desc ? { description: desc } : {}),
        ...(ogImage ? { image: ogImage } : {}),
        type: "article" as const,
      },
    };
  };

  const docRoute = {
    loader: (ctx: DocCtx): DocPage => {
      const e = resolve(ctx.params?.slug, ctx.locale);
      if (!e) throw new Error(`No doc "${ctx.params?.slug ?? ""}"`);
      return pageOf(e, ctx.locale);
    },
    View, md, json, metadata,
    // Enumerate every doc page (× locale) so the static() target can prerender this DYNAMIC
    // catch-all to one HTML file each. FULL pathnames, locale prefix applied, WITHOUT the deploy
    // subpath (June fetches these bare during prerender). Reuses the same localeHref + docPath the
    // links use, so prerendered files and their inbound links can't drift. Ignored off-static.
    staticPaths: (): string[] => {
      const locales = i18n ? Object.keys(i18n.locales) : [undefined];
      const seen = new Set<string>();
      for (const l of locales) {
        for (const e of entriesFor(l)) {
          seen.add(i18n ? localeHref(i18n, docPath(basePath, e.slug), l!) : docPath(basePath, e.slug));
        }
      }
      return [...seen];
    },
  };

  const home = {
    loader: (ctx: DocCtx): DocPage => {
      const e = first(ctx.locale);
      if (!e) throw new Error("createDocs: no docs found");
      return pageOf(e, ctx.locale);
    },
    View, md, json, metadata,
  };

  const searchRoute = {
    loader: async (ctx: SearchCtx): Promise<{ q: string; hits: SearchHit[]; tokens: string[]; locale?: string }> => {
      const q = (ctx.url.searchParams.get("q") ?? "").trim();
      // `mode=keyword` → instant BM25 only (no ~200ms query embed), for per-keystroke typeahead;
      // the default (page load / on submit) runs full hybrid. `tokens` are the exact terms the
      // keyword index matched on, so a client highlights the same spans (CJK-correct).
      const mode = ctx.url.searchParams.get("mode") === "keyword" ? "keyword" as const : undefined;
      const hits = q ? await search.search(q, { topK: 8, locale: ctx.locale, mode }) : [];
      return { q, hits, tokens: q ? search.tokensOf(q, ctx.locale) : [], locale: ctx.locale };
    },
    // Content-only (renders into the shell's <JuneOutlet>); span the content + ToC columns.
    View: (d: { q: string; hits: SearchHit[]; tokens: string[]; locale?: string }) => (
      <main className="px-10 py-8 max-md:px-4" style={{ gridColumn: "2 / -1" }}>
        <SearchResults query={d.q} hits={d.hits} basePath={basePath} labels={labelsFor(d.locale)} href={hrefFor(d.locale)} />
      </main>
    ),
    json: (d: { q: string; hits: SearchHit[]; tokens: string[] }) => ({ q: d.q, hits: d.hits, tokens: d.tokens }),
    metadata: { title: "Search" },
  };

  // OG image route — /og/<slug>.png → kura-branded card for each doc page (nested slugs included).
  // Add app/og/[[...slug]]/route.ts with `export default kura.ogRoute` to enable.
  // Override by calling createOgRoute() directly with a custom card renderer.
  const ogRoute = createOgRoute({ DOCS }, opts.config);

  return {
    nav: navFor(defaultLocale),
    navFor,
    search,
    actions,
    sidebar: () => sidebarFor(defaultLocale),
    sidebarFor,
    site,
    layout,
    docRoute,
    home,
    searchRoute,
    ogRoute,
  };
}
