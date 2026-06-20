// createDocs() — the one wiring point. Given a content collection, config, and a
// precomputed index, it returns bound route handlers (loader/View/md/json/metadata for
// docs, home, and search) plus the agent actions. An app's kura.config.ts calls this; the
// route files just re-export the handlers, and importing it registers the MCP tools.
//
// Locale-aware by absence: with no `i18n` the finders are called without a locale and
// every per-locale helper collapses to the single default collection (zero overhead).
// With `i18n`, June resolves ctx.locale before routing; the loaders thread it into the
// content finders (variant → default fallback), the nav, the labels, and the MDX bucket.
import { createNav, treeOf, flattenTree, processHtml, topFolderOf, activeTabIndex, normalizeBasePath, docPath, type DocLike, type Nav, type NavNode } from "./nav.ts";
import { mergeMeta, type MetaMap, type TabConfig } from "./meta.ts";
import { createSearch, type SearchHit } from "./search.ts";
import { docsActions } from "./actions.ts";
import { DocsPage, DocsShell, SearchResults, type SiteInfo, type SidebarGroup, type SidebarNode, type DocView, type Href, type LocaleLink, type TabLink } from "./ui.tsx";
import type { KuraConfig } from "./config.ts";
import { resolveLabels, pickLabel, type Labels } from "./labels.ts";
import { localeHref, type I18nConfig } from "@junejs/core/i18n";
import { stripMdx } from "./util.ts";

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
}) {
  const { DOCS, doc, docs } = opts.content;
  // embedder is OPTIONAL: with one, search is semantic (over the frozen index); without one,
  // createSearch degrades to a lexical scan — so a site deploys + searches on Workers with no AI.
  const i18n = opts.i18n;
  const defaultLocale = i18n?.defaultLocale;
  // URL prefix for doc pages ("/docs" default, "" = site root). All generated doc links go through
  // docPath(basePath, …); the app mounts its route files to match.
  const basePath = normalizeBasePath(opts.config.basePath);

  // Localize an internal route path to a locale (identity when i18n is off); build the
  // language-switcher links for a given page (its URL in every locale). Both lean on June's
  // localeHref so inbound routing and these outbound links can never drift.
  const hrefFor = (locale?: string): Href =>
    i18n ? (path) => localeHref(i18n, path, locale ?? i18n.defaultLocale) : (path) => path;
  const localeName = (l: string): string => opts.config.localeNames?.[l] ?? l;
  const switchFor = (locale: string | undefined, routePath: string): LocaleLink[] | undefined =>
    i18n
      ? Object.keys(i18n.locales).map((l) => ({
          locale: l,
          name: localeName(l),
          href: localeHref(i18n, routePath, l),
          active: l === (locale ?? i18n.defaultLocale),
        }))
      : undefined;

  const site: SiteInfo = { name: opts.config.site?.name, brand: opts.config.site?.brand };
  const search = createSearch({ entries: DOCS, embedder: opts.config.embedder, indexBytes: opts.indexBytes });
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

  // MDX html for an entry: its own locale bucket → the default bucket → plain markdown html.
  const mdxFor = (e: T): string =>
    opts.mdxHtml?.[e.locale ?? "default"]?.[e.slug] ?? opts.mdxHtml?.default?.[e.slug] ?? e.html;

  const viewOf = (e: T, locale?: string): DocView => {
    const { html, toc } = processHtml(mdxFor(e));
    const { prev, next } = prevNextOf(e.slug, locale);
    // A non-default locale that resolved to a non-variant entry fell back to default.
    const notTranslated = !!(locale && defaultLocale && locale !== defaultLocale && e.locale !== locale);
    return {
      slug: e.slug,
      title: String(e.data.title ?? e.slug),
      section: sectionLabel(locale, String(e.data.section ?? "")),
      html,
      toc,
      prev: prev ? { slug: prev.slug, title: String(prev.data.title ?? prev.slug) } : null,
      next: next ? { slug: next.slug, title: String(next.data.title ?? next.slug) } : null,
      notTranslated,
    };
  };

  // The site's first page: the first page of the first tab when tabs are on, else the global first.
  const first = (locale?: string): T | undefined => {
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

  const View = (d: DocPage) => (
    <DocsPage
      site={site}
      sidebar={d.sidebar}
      tabs={d.tabs}
      doc={d.doc}
      basePath={basePath}
      labels={d.labels}
      href={hrefFor(d.locale)}
      localeSwitch={switchFor(d.locale, docPath(basePath, d.doc.slug))}
      mermaidCdn={opts.config.mermaidCdn}
    />
  );
  const md = (d: DocPage) => stripMdx(doc(d.doc.slug, d.locale)?.original ?? "");
  const json = (d: DocPage) => {
    const e = doc(d.doc.slug, d.locale);
    return { slug: d.doc.slug, title: d.doc.title, section: d.doc.section, locale: d.locale, markdown: e?.original, body: e?.body };
  };
  const metadata = (d: DocPage) => ({ title: d.doc.title });

  const docRoute = {
    loader: (ctx: DocCtx): DocPage => {
      const e = resolve(ctx.params?.slug, ctx.locale);
      if (!e) throw new Error(`No doc "${ctx.params?.slug ?? ""}"`);
      return pageOf(e, ctx.locale);
    },
    View, md, json, metadata,
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
    loader: async (ctx: SearchCtx): Promise<{ q: string; hits: SearchHit[]; locale?: string }> => {
      const q = (ctx.url.searchParams.get("q") ?? "").trim();
      return { q, hits: q ? await search.search(q, { topK: 8, locale: ctx.locale }) : [], locale: ctx.locale };
    },
    View: (d: { q: string; hits: SearchHit[]; locale?: string }) => {
      const qs = d.q ? `?q=${encodeURIComponent(d.q)}` : "";
      return (
        <DocsShell
          site={site}
          sidebar={sidebarFor(d.locale, tabFoldersFor(""))}
          tabs={tabBarFor(d.locale, "")}
          pageTitle={labelsFor(d.locale).search}
          labels={labelsFor(d.locale)}
          href={hrefFor(d.locale)}
          localeSwitch={switchFor(d.locale, `/search${qs}`)}
        >
          <SearchResults query={d.q} hits={d.hits} basePath={basePath} labels={labelsFor(d.locale)} href={hrefFor(d.locale)} />
        </DocsShell>
      );
    },
    json: (d: { q: string; hits: SearchHit[] }) => ({ q: d.q, hits: d.hits }),
    metadata: { title: "Search" },
  };

  return {
    nav: navFor(defaultLocale),
    navFor,
    search,
    actions,
    sidebar: () => sidebarFor(defaultLocale),
    sidebarFor,
    site,
    docRoute,
    home,
    searchRoute,
  };
}
