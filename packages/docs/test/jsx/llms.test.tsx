// docRoute.llms — the docs' /llms.txt entries, read by June's route `llms` export. Sections follow
// the sidebar; every doc is listed exactly once. Imports app.tsx (JSX), so it runs under bun.
import { test, expect } from "bun:test";

import { createDocs } from "../../src/app.tsx";
import { DOCS, META, doc } from "../fixtures.ts";

const finder = (docs: typeof DOCS) => (slug: string) => docs.find((d) => d.slug === slug) ?? null;

test("docRoute.llms: one section per sidebar group, in sidebar order, every doc once", () => {
  const kura = createDocs({ content: { DOCS, doc: finder(DOCS) as never }, meta: META, config: { basePath: "/docs" } as never });
  const entries = kura.docRoute.llms();

  // the folder-driven sidebar: getting-started, features, concepts, advanced (root meta order)
  expect([...new Set(entries.map((e) => e.section))]).toEqual(["Get started", "Features", "Concepts", "Advanced"]);
  expect(entries.map((e) => e.path).sort()).toEqual(DOCS.map((d) => `/docs/${d.slug}`).sort());
  // a folder's index page leads its section; nested folders stay in their top-level section
  expect(entries[0]).toEqual({ path: "/docs/getting-started", title: "Get started", section: "Get started" });
  expect(entries.find((e) => e.path === "/docs/features/search/semantic")?.section).toBe("Features");
});

test("docRoute.llms: frontmatter description travels; basePath is applied; no description → none", () => {
  const docs = [
    doc("intro", "Intro", { description: "Start here." }),
    doc("guide/setup", "Setup"),
  ];
  const kura = createDocs({ content: { DOCS: docs, doc: finder(docs) as never }, config: { basePath: "" } as never });
  const entries = kura.docRoute.llms();
  const intro = entries.find((e) => e.path === "/intro");
  expect(intro?.description).toBe("Start here.");
  expect("description" in entries.find((e) => e.path === "/guide/setup")!).toBe(false);
});

test("docRoute.llms: a page the nav config leaves out is still listed, under Docs", () => {
  const docs = [doc("a", "A"), doc("b", "B"), doc("hidden", "Hidden")];
  const kura = createDocs({
    content: { DOCS: docs, doc: finder(docs) as never },
    config: { basePath: "/docs", nav: { groups: { start: { title: "Start", pages: ["b", { slug: "a", title: "Alpha" }] } } } } as never,
  });
  expect(kura.docRoute.llms()).toEqual([
    { path: "/docs/b", title: "B", section: "Start" },
    { path: "/docs/a", title: "Alpha", section: "Start" }, // the nav's title override, like the sidebar
    { path: "/docs/hidden", title: "Hidden", section: "Docs" },
  ]);
});

test("docRoute.llms: an i18n site lists the default locale's pages only, unprefixed", () => {
  const i18n = { defaultLocale: "en", locales: { en: {}, "ja-JP": { path: "/ja" } } };
  const kura = createDocs({ content: { DOCS, doc: finder(DOCS) as never }, meta: META, config: { basePath: "/docs", i18n } as never });
  const paths = kura.docRoute.llms().map((e) => e.path);
  expect(paths.length).toBe(DOCS.length);
  expect(paths.some((p) => p.startsWith("/ja"))).toBe(false);
});

test('docRoute.llms: a root doc (slug "") keeps its sidebar place, like any other doc', () => {
  const docs = [doc("", "Overview", { section: "Start" }), doc("a", "A", { section: "Start" }), doc("b", "B", { section: "More" })];
  const kura = createDocs({ content: { DOCS: docs, doc: finder(docs) as never }, config: { basePath: "/docs", sections: ["Start", "More"] } as never });
  expect(kura.docRoute.llms()).toEqual([
    { path: "/docs/", title: "Overview", section: "Start" },
    { path: "/docs/a", title: "A", section: "Start" },
    { path: "/docs/b", title: "B", section: "More" },
  ]);
});

test("home and search opt out of /llms.txt: home repeats the first doc, search has no content", () => {
  const kura = createDocs({ content: { DOCS, doc: finder(DOCS) as never }, meta: META, config: {} as never });
  expect(kura.home.llms).toBe(false);
  expect(kura.searchRoute.llms).toBe(false);
});
