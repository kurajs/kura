// The github-pages/static target seam on the Kura side: docRoute.staticPaths enumerates every doc
// page (× locale) for June to prerender; hrefFor prefixes the deploy subpath onto nav links; and
// og:image is dropped (the dynamic OG route is omitted on static). These import app.tsx (JSX), so
// they run under bun (Node's --experimental-strip-types can't load .tsx) — see package.json.
import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createDocs } from "../../src/app.tsx";
import { DOCS } from "../fixtures.ts";

const finder = (slug: string) => DOCS.find((d) => d.slug === slug) ?? null;
const i18n = { defaultLocale: "en", locales: { en: {}, "ja-JP": { path: "/ja" } } };

test("docRoute.staticPaths: every doc × locale, locale-prefixed, WITHOUT the deploy basePath", () => {
  const kura = createDocs({
    content: { DOCS, doc: finder as never },
    // basePath "" = docs mounted at the site root; deploy under a project subpath.
    config: { basePath: "", i18n, deploy: { target: "github-pages", basePath: "/openab/docs" } } as never,
  });
  const paths = kura.docRoute.staticPaths!();

  // default locale → bare path; ja-JP → /ja prefix (localeHref). NEVER the deploy subpath (June
  // fetches these bare during prerender; the subpath is a host concern, added to links/assets only).
  expect(paths).toContain("/getting-started/introduction");
  expect(paths).toContain("/ja/getting-started/introduction");
  expect(paths.some((p) => p.startsWith("/openab/docs"))).toBe(false);
  // one entry per doc per locale, deduped
  expect(paths.length).toBe(DOCS.length * 2);
});

test("docRoute.staticPaths: single-locale site → one bare path per doc at the docs mount", () => {
  const kura = createDocs({ content: { DOCS, doc: finder as never }, config: { basePath: "/docs" } as never });
  const paths = kura.docRoute.staticPaths!();
  expect(paths.length).toBe(DOCS.length);
  expect(paths).toContain("/docs/getting-started/introduction");
});

test("hrefFor: nav links are prefixed with the deploy basePath so they resolve under the subpath", () => {
  const kura = createDocs({
    content: { DOCS, doc: finder as never },
    config: { basePath: "", i18n, deploy: { target: "github-pages", basePath: "/openab/docs" } } as never,
  });
  const d = kura.docRoute.loader({ params: { slug: "getting-started/introduction" }, locale: "ja-JP" } as never);
  const html = renderToStaticMarkup(kura.docRoute.View(d));
  // at least one in-page nav link carries BOTH the deploy subpath and the locale prefix
  expect(html).toMatch(/href="\/openab\/docs\/ja\//);
  // none drop the deploy subpath
  expect(html).not.toMatch(/href="\/ja\/getting-started/);
});

test("metadata: og:image is dropped on a static target (but kept for a server target)", () => {
  const cfg = (target: string) => ({ site: { name: "T" }, siteUrl: "https://x.dev", basePath: "", deploy: { target } });
  const load = (kura: ReturnType<typeof createDocs>) =>
    kura.docRoute.metadata!(kura.docRoute.loader({ params: { slug: "getting-started/introduction" } } as never) as never);

  const staticMeta = load(createDocs({ content: { DOCS, doc: finder as never }, config: cfg("github-pages") as never }));
  const workersMeta = load(createDocs({ content: { DOCS, doc: finder as never }, config: cfg("workers") as never }));

  expect((staticMeta.openGraph as { image?: string }).image).toBeUndefined(); // dropped: no OG route on static
  expect((workersMeta.openGraph as { image?: string }).image).toMatch(/\/og\//); // server target keeps it
});
