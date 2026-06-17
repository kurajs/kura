// createDocs() — the one wiring point. Given a content collection, config, and a
// precomputed index, it returns bound route handlers (loader/View/md/json/metadata for
// docs, home, and search) plus the agent actions. An app's kura.config.ts calls this; the
// route files just re-export the handlers, and importing it registers the MCP tools.
//
// Locale-aware by absence: with no `i18n` the finders are called without a locale and
// every per-locale helper collapses to the single default collection (zero overhead).
// With `i18n`, June resolves ctx.locale before routing; the loaders thread it into the
// content finders (variant → default fallback), the nav, the labels, and the MDX bucket.
import { createNav, processHtml, type DocLike, type Nav } from "./nav.ts";
import { createSearch, type SearchHit } from "./search.ts";
import { docsActions } from "./actions.ts";
import { DocsPage, DocsShell, SearchResults, type SiteInfo, type SidebarGroup, type DocView, type Href, type LocaleLink } from "./ui.tsx";
import type { KuraConfig } from "./config.ts";
import { resolveLabels, type Labels } from "./labels.ts";
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
export type DocPage = { doc: DocView; sidebar: SidebarGroup[]; labels: Labels; locale?: string };

export function createDocs<T extends DocLike>(opts: {
  content: { DOCS: readonly T[]; doc: Finder<T>; docs?: Lister<T> };
  config: KuraConfig;
  /** Routing i18n — pass june.config.ts's `i18n` verbatim. Drives fallback detection,
   *  localized internal links, and the language switcher. Omit for a single-locale site. */
  i18n?: I18nConfig;
  indexBytes?: Uint8Array;
  /** Precompiled MDX html bucketed by locale ("default" = flat default), built by `kura index`. */
  mdxHtml?: Record<string, Record<string, string>>;
}) {
  const { DOCS, doc, docs } = opts.content;
  if (!opts.config.embedder) throw new Error("createDocs: config.embedder is required (e.g. transformers())");
  const i18n = opts.i18n;
  const defaultLocale = i18n?.defaultLocale;

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
  const sidebarFor = (locale?: string): SidebarGroup[] =>
    navFor(locale).groups().map((g) => ({
      title: sectionLabel(locale, g.title),
      items: g.items.map((it) => ({ slug: it.slug, title: String(it.data.title ?? it.slug) })),
    }));
  const labelsFor = (locale?: string): Labels => resolveLabels(locale, opts.config.labels);

  // MDX html for an entry: its own locale bucket → the default bucket → plain markdown html.
  const mdxFor = (e: T): string =>
    opts.mdxHtml?.[e.locale ?? "default"]?.[e.slug] ?? opts.mdxHtml?.default?.[e.slug] ?? e.html;

  const viewOf = (e: T, locale?: string): DocView => {
    const { html, toc } = processHtml(mdxFor(e));
    const { prev, next } = navFor(locale).prevNext(e.slug);
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

  const first = (locale?: string): T | undefined => navFor(locale).ordered()[0];
  const resolve = (slug: string | undefined, locale?: string): T | undefined =>
    slug ? doc(slug, locale) ?? undefined : first(locale);
  const pageOf = (e: T, locale?: string): DocPage => ({
    doc: viewOf(e, locale),
    sidebar: sidebarFor(locale),
    labels: labelsFor(locale),
    locale,
  });

  const View = (d: DocPage) => (
    <DocsPage
      site={site}
      sidebar={d.sidebar}
      doc={d.doc}
      labels={d.labels}
      href={hrefFor(d.locale)}
      localeSwitch={switchFor(d.locale, `/docs/${d.doc.slug}`)}
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
          sidebar={sidebarFor(d.locale)}
          labels={labelsFor(d.locale)}
          href={hrefFor(d.locale)}
          localeSwitch={switchFor(d.locale, `/search${qs}`)}
        >
          <SearchResults query={d.q} hits={d.hits} labels={labelsFor(d.locale)} href={hrefFor(d.locale)} />
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
