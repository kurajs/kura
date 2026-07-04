// Static-search seam: a static build has no server to answer /search.json?q=… per keystroke, so the
// search route ships the CORPUS instead and the browser builds the (pure-JS) BM25 index locally.
// searchRoute.json includes `index` ONLY on static targets; server targets stay lean and query the
// endpoint per request. Imports app.tsx (JSX) → runs under bun (see package.json).
import { test, expect } from "bun:test";

import { createDocs } from "../../src/app.tsx";
import { DOCS } from "../fixtures.ts";

const finder = (slug: string) => DOCS.find((d) => d.slug === slug) ?? null;
const empty = { q: "", hits: [], tokens: [] };

test("searchRoute.json: static target ships the corpus so the browser can run BM25 client-side", () => {
  const kura = createDocs({
    content: { DOCS, doc: finder as never },
    config: { basePath: "", deploy: { target: "github-pages", basePath: "/x" } } as never,
  });
  const out = kura.searchRoute.json(empty) as { index?: { slug: string; html: string; data: { title: string } }[] };
  expect(Array.isArray(out.index)).toBe(true);
  expect(out.index!.length).toBe(DOCS.length);
  // each corpus entry carries what the client index needs: slug + rendered HTML (→ text + preview) + a title
  const e = out.index![0]!;
  expect(typeof e.slug).toBe("string");
  expect(typeof e.html).toBe("string");
  expect(typeof e.data.title).toBe("string");
});

test("searchRoute.json: 'static' alias also ships the corpus", () => {
  const kura = createDocs({ content: { DOCS, doc: finder as never }, config: { deploy: { target: "static" } } as never });
  expect(Array.isArray((kura.searchRoute.json(empty) as { index?: unknown[] }).index)).toBe(true);
});

test("searchRoute.json: server target stays lean — no corpus (queries hit the endpoint per request)", () => {
  const kura = createDocs({ content: { DOCS, doc: finder as never }, config: { deploy: { target: "workers" } } as never });
  expect("index" in (kura.searchRoute.json(empty) as object)).toBe(false);
});

test("searchRoute.json: no deploy target → not static → no corpus", () => {
  const kura = createDocs({ content: { DOCS, doc: finder as never }, config: {} as never });
  expect("index" in (kura.searchRoute.json(empty) as object)).toBe(false);
});

// ── i18n corpus rows (S10–S17) — the locale model: each locale's search.json is its own MERGED
// view (variant-else-default), the envelope carries defaultLocale only for i18n sites, and the
// no-i18n envelope stays byte-identical to the legacy shape.
import { docsFor } from "../fixtures.ts";
import { docsActions } from "../../src/actions.ts";
import type { SearchHandle } from "../../src/search.ts";

const JA_HTML: Record<string, string> = {
  "getting-started/introduction": "<h2>概要</h2><p>はじめにへようこそ</p>",
};
const docsJa = (locale?: string) =>
  docsFor(locale).map((e) => (e.locale && JA_HTML[e.slug] ? { ...e, html: JA_HTML[e.slug]! } : e));
const finderJa = (slug: string, locale?: string) => docsJa(locale).find((d) => d.slug === slug) ?? null;
const I18N = { defaultLocale: "en", locales: { en: {}, "ja-JP": { path: "/ja" } } };

const mkI18n = () =>
  createDocs({
    content: { DOCS, doc: finderJa as never, docs: docsJa as never },
    config: { basePath: "", deploy: { target: "github-pages" }, i18n: I18N } as never,
  });

test("S10 REGRESSION (red pre-fix): the ja search.json carries the ja MERGED corpus", () => {
  const out = mkI18n().searchRoute.json({ ...empty, locale: "ja-JP" }) as {
    index?: { slug: string; html: string; locale?: string }[];
  };
  expect(out.index!.length).toBe(DOCS.length); // merged view = full set
  const intro = out.index!.find((e) => e.slug === "getting-started/introduction")!;
  expect(intro.locale).toBe("ja-JP"); // translated → the variant
  expect(intro.html).toContain("はじめに");
  const untranslated = out.index!.find((e) => e.slug === "advanced/deploy")!;
  expect(untranslated.locale).toBeUndefined(); // fallback → the default entry
});

test("S11 the ROOT (default) search.json of an i18n site: all-default corpus + defaultLocale present", () => {
  const out = mkI18n().searchRoute.json(empty) as { index?: { locale?: string }[]; defaultLocale?: string };
  expect(out.index!.every((e) => e.locale === undefined)).toBe(true);
  expect(out.defaultLocale).toBe("en"); // EVERY i18n search.json carries it, root included
});

test("S12 BYTE-PARITY: a no-i18n site's search.json envelope is exactly the legacy shape", () => {
  const kura = createDocs({
    content: { DOCS, doc: finder as never },
    config: { basePath: "", deploy: { target: "github-pages" } } as never,
  });
  const out = kura.searchRoute.json(empty) as Record<string, unknown>;
  expect("defaultLocale" in out).toBe(false);
  const legacy = {
    q: "",
    hits: [],
    tokens: [],
    index: DOCS.map((e) => ({ slug: e.slug, html: e.html, data: { title: (e.data.title as string) ?? e.slug } })),
  };
  expect(JSON.stringify(out)).toBe(JSON.stringify(legacy));
});

test("S14 REGRESSION (red pre-fix): server keyword search finds a ja-only term", async () => {
  const kura = createDocs({
    content: { DOCS, doc: finderJa as never, docs: docsJa as never },
    config: { basePath: "", deploy: { target: "workers" }, i18n: I18N } as never,
  });
  const d = await kura.searchRoute.loader({
    url: new URL("https://x/search?q=はじめに&mode=keyword"),
    locale: "ja-JP",
  } as never);
  expect(d.hits.some((h) => h.slug === "getting-started/introduction" && h.locale === "ja-JP")).toBe(true);
});

test("S15 navTitle override clobbers the variant title in the ja corpus (accepted, sidebar-parity)", () => {
  const kura = createDocs({
    content: { DOCS, doc: finderJa as never, docs: docsJa as never },
    config: {
      basePath: "",
      deploy: { target: "github-pages" },
      i18n: I18N,
      nav: { tabs: [{ title: "T", groups: ["g"] }], groups: { g: { pages: [{ slug: "getting-started/introduction", title: "Intro Override" }] } } },
    } as never,
  });
  const out = kura.searchRoute.json({ ...empty, locale: "ja-JP" }) as { index?: { slug: string; data: { title: string } }[] };
  expect(out.index!.find((e) => e.slug === "getting-started/introduction")!.data.title).toBe("Intro Override");
});

test("S16 corpus link URLs carry the CORPUS locale prefix (fallback entries included)", () => {
  const withLinks = createDocs({
    content: { DOCS, doc: finderJa as never, docs: docsJa as never },
    config: { basePath: "", deploy: { target: "github-pages" }, i18n: I18N } as never,
    links: { repoUrl: null, sourcePaths: { "advanced/deploy": "docs/advanced/deploy.md", "advanced/i18n": "docs/advanced/i18n.md" } },
  });
  // give the fallback entry a link to a sibling doc
  const DOCS2 = DOCS.map((e) => (e.slug === "advanced/deploy" ? { ...e, html: '<a href="i18n.md">i18n</a>' } : e));
  const kura = createDocs({
    content: { DOCS: DOCS2 as never, doc: ((s: string, l?: string) => DOCS2.find((d) => d.slug === s) ?? null) as never, docs: ((l?: string) => (l ? DOCS2 : DOCS2)) as never },
    config: { basePath: "", deploy: { target: "github-pages" }, i18n: I18N } as never,
    links: { repoUrl: null, sourcePaths: { "advanced/deploy": "docs/advanced/deploy.md", "advanced/i18n": "docs/advanced/i18n.md" } },
  });
  const out = kura.searchRoute.json({ ...empty, locale: "ja-JP" }) as { index?: { slug: string; html: string }[] };
  const entry = out.index!.find((e) => e.slug === "advanced/deploy")!;
  expect(entry.html).toContain('href="/ja/advanced/i18n"');
  void withLinks;
});

test("S17 MCP search_docs forwards locale to the engine", async () => {
  const calls: unknown[] = [];
  const spy: SearchHandle = { getKb: async () => null, search: async (_q, o) => { calls.push(o); return []; }, tokensOf: () => [] };
  const actions = docsActions({ search: spy, entries: [], doc: () => null });
  await (actions.search_docs.run as (i: unknown) => Promise<unknown>)({ query: "x", locale: "ja-JP" });
  await (actions.search_docs.run as (i: unknown) => Promise<unknown>)({ query: "x" });
  expect((calls[0] as { locale?: string }).locale).toBe("ja-JP");
  expect((calls[1] as { locale?: string }).locale).toBeUndefined();
});
