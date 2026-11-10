// Frontmatter `sidebarTitle`: a short label for the navigation chrome (sidebar, prev/next pager)
// while the page keeps its full `title` (H1, <title>, search, llms.txt). Imports app.tsx → bun.
import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createDocs } from "../../src/app.tsx";
import { SidebarItems } from "../../src/ui.tsx";
import { doc } from "../fixtures.ts";

const LONG = "How do I set up a bundle discount (buy one, get one) for two courses?";
const finder = (docs: ReturnType<typeof doc>[]) => (slug: string) => docs.find((d) => d.slug === slug) ?? null;

type Page = { doc: { title: string; prev: { title: string } | null; next: { title: string } | null } };

const folderDocs = [
  doc("marketing", "Marketing overview, everything you can promote with", { sidebarTitle: "Overview" }), // folder index
  doc("marketing/bundle", LONG, { sidebarTitle: "Bundle discount" }),
  doc("marketing/coupons", "Coupons"),
];
const folderMeta = { "": { pages: ["marketing"] }, marketing: { title: "Marketing", pages: ["index", "bundle", "coupons"] } };
const folder = createDocs({
  content: { DOCS: folderDocs, doc: finder(folderDocs) as never },
  meta: folderMeta,
  config: { basePath: "" } as never,
});

test("folder nav: the sidebar shows sidebarTitle for leaves and folder index pages", () => {
  const [group] = folder.sidebarFor();
  expect(group!.items.map((i) => i.title)).toEqual(["Overview", "Bundle discount", "Coupons"]);
});

test("folder nav: the page itself keeps its full title", () => {
  const page = folder.docRoute.loader({ params: { slug: "marketing/bundle" } } as never) as Page;
  expect(page.doc.title).toBe(LONG);
});

test("prev/next pager uses the short label, like the sidebar", () => {
  const page = folder.docRoute.loader({ params: { slug: "marketing/coupons" } } as never) as Page;
  expect(page.doc.prev?.title).toBe("Bundle discount");
  const first = folder.docRoute.loader({ params: { slug: "marketing" } } as never) as Page;
  expect(first.doc.next?.title).toBe("Bundle discount");
});

test("leaves inside a nested folder use sidebarTitle", () => {
  const docs = [
    doc("guide/payments", "Payments: everything about getting paid", { sidebarTitle: "Payments" }), // nested folder index
    doc("guide/payments/refunds", "How do refunds work for a paid order?", { sidebarTitle: "Refunds" }),
  ];
  const meta = { "": { pages: ["guide"] }, guide: { title: "Guide", pages: ["payments"] }, "guide/payments": { title: "Payments group", pages: ["index", "refunds"] } };
  const kura = createDocs({ content: { DOCS: docs, doc: finder(docs) as never }, meta, config: { basePath: "" } as never });
  const [group] = kura.sidebarFor();
  const folderNode = group!.items[0]!;
  expect("items" in folderNode && folderNode.items.map((i) => i.title)).toEqual(["Refunds"]);
});

test("section nav (frontmatter `section`): leaves use sidebarTitle", () => {
  const docs = [
    doc("bundle", LONG, { section: "Marketing", sidebarTitle: "Bundle discount" }),
    doc("coupons", "Coupons", { section: "Marketing" }),
  ];
  const kura = createDocs({ content: { DOCS: docs, doc: finder(docs) as never }, config: { basePath: "" } as never });
  expect(kura.sidebarFor()[0]!.items.map((i) => i.title)).toEqual(["Bundle discount", "Coupons"]);
});

test("virtual nav (config.nav): sidebarTitle applies; a config label still wins over it", () => {
  const docs = [
    doc("bundle", LONG, { sidebarTitle: "Bundle discount" }),
    doc("kiro", "Kiro CLI (Default Agent)", { sidebarTitle: "Kiro CLI" }),
  ];
  const kura = createDocs({
    content: { DOCS: docs, doc: finder(docs) as never },
    config: { basePath: "", nav: { groups: { g: { title: "G", pages: ["bundle", { slug: "kiro", title: "Kiro" }] } } } } as never,
  });
  expect(kura.sidebarFor()[0]!.items.map((i) => i.title)).toEqual(["Bundle discount", "Kiro"]);
  const page = kura.docRoute.loader({ params: { slug: "bundle" } } as never) as Page;
  expect(page.doc.title).toBe(LONG);
});

test("a blank or non-string sidebarTitle falls back to title", () => {
  const docs = [doc("a", "Alpha", { sidebarTitle: "  " }), doc("b", "Beta", { sidebarTitle: 42 })];
  const kura = createDocs({ content: { DOCS: docs, doc: finder(docs) as never }, config: { basePath: "" } as never });
  expect(kura.sidebarFor().flatMap((g) => g.items.map((i) => i.title))).toEqual(["Alpha", "Beta"]);
});

test("llms.txt and search keep the full title", () => {
  const entry = folder.docRoute.llms().find((e) => e.path === "/marketing/bundle");
  expect(entry?.title).toBe(LONG);
});

test("the rendered sidebar markup carries the short label, not the long title", () => {
  const html = renderToStaticMarkup(<SidebarItems items={folder.sidebarFor()[0]!.items} href={(p) => p} basePath="" />);
  expect(html).toContain(">Bundle discount</a>");
  expect(html).not.toContain(LONG);
});
