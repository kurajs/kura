import { test } from "node:test";
import assert from "node:assert/strict";
import { treeOf, flattenTree, createNav, slugify, topFolderOf, activeTabIndex, normalizeBasePath, docPath, ogImageUrl, normalizeOgSlug, resolveOgSlug, canonicalUrl, type NavNode, type DocLike } from "../src/nav.ts";
import { doc, DOCS, META } from "./fixtures.ts";

// Tiny readers over the discriminated NavNode union.
const isGroup = (n: NavNode<DocLike>) => n.kind === "group";
const titles = (nodes: NavNode<DocLike>[]) => nodes.map((n) => (n.kind === "group" ? n.title : n.entry.slug));
const group = (nodes: NavNode<DocLike>[], key: string) => {
  const g = nodes.find((n) => n.kind === "group" && n.key === key);
  assert.ok(g && g.kind === "group", `expected a group "${key}"`);
  return g as Extract<NavNode<DocLike>, { kind: "group" }>;
};

test("treeOf: flat slugs stay top-level leaves (no meta → no nesting)", () => {
  const tree = treeOf([doc("a", "A"), doc("b", "B")]);
  assert.deepEqual(titles(tree), ["a", "b"]);
  assert.ok(tree.every((n) => n.kind === "doc"));
});

test("treeOf: a slug folder becomes a group; title humanized without meta", () => {
  const tree = treeOf([doc("guides/install", "Install"), doc("guides/config", "Config")]);
  const g = group(tree, "guides");
  assert.equal(g.title, "Guides"); // humanized
  assert.equal(g.index, undefined); // no index page
  assert.deepEqual(g.children.map((c) => (c.kind === "doc" ? c.entry.slug : c.key)), ["guides/install", "guides/config"]);
});

test("treeOf: meta sets folder title + child order; flat 'index' is collapsed to the folder", () => {
  const tree = treeOf(DOCS, META);
  // top groups ordered by root meta.pages
  assert.deepEqual(
    tree.map((n) => (n.kind === "group" ? n.key : n.entry.slug)),
    ["getting-started", "features", "concepts", "advanced"],
  );
  const features = group(tree, "features");
  assert.equal(features.title, "Features"); // from meta
  assert.equal(features.index?.slug, "features"); // folder-as-page: index attached, not a child
  // children ordered by meta.pages ["index","search","projections"] (index excluded)
  assert.deepEqual(features.children.map((c) => (c.kind === "group" ? c.key : c.entry.slug)), ["search", "projections"]);
});

test("treeOf: 3 levels deep with meta ordering", () => {
  const search = group(group(treeOf(DOCS, META), "features").children, "search");
  assert.equal(search.title, "Search");
  assert.equal(search.index?.slug, "features/search");
  assert.deepEqual(
    search.children.map((c) => (c.kind === "doc" ? c.entry.slug : c.key)),
    ["features/search/semantic", "features/search/lexical"], // meta.pages order
  );
});

test("treeOf: a folder without an index page has no index, still groups its children", () => {
  const concepts = group(treeOf(DOCS, META), "concepts");
  assert.equal(concepts.title, "Concepts");
  assert.equal(concepts.index, undefined);
  assert.equal(concepts.children.length, 2);
});

test("treeOf: meta.pages reorders; unlisted children fall after listed ones", () => {
  const docs = [doc("g/c", "C"), doc("g/a", "A"), doc("g/b", "B")];
  const meta = { g: { pages: ["b", "a"] } }; // c unlisted
  const g = group(treeOf(docs, meta), "g");
  assert.deepEqual(g.children.map((c) => (c.kind === "doc" ? c.entry.slug : "")), ["g/b", "g/a", "g/c"]);
});

test("flattenTree: reading order = sidebar order (folder index first, then children, depth-first)", () => {
  const order = flattenTree(treeOf(DOCS, META)).map((e) => e.slug);
  assert.deepEqual(order, [
    "getting-started",
    "getting-started/introduction",
    "getting-started/quickstart",
    "features",
    "features/search",
    "features/search/semantic",
    "features/search/lexical",
    "features/projections",
    "features/projections/markdown",
    "features/projections/json",
    "features/projections/mcp",
    "concepts/content-model",
    "concepts/agents",
    "advanced/deploy",
    "advanced/i18n",
  ]);
});

test("flattenTree: the folder index page's next is its first child (the bug we fixed)", () => {
  const order = flattenTree(treeOf(DOCS, META)).map((e) => e.slug);
  const i = order.indexOf("features"); // Features overview
  assert.equal(order[i + 1], "features/search"); // Search overview, NOT projections
});

test("createNav: section frontmatter groups; sections honor the configured order", () => {
  const nav = createNav({
    entries: [doc("x", "X", { section: "B" }), doc("y", "Y", { section: "A" })],
    sections: ["A", "B"],
  });
  assert.deepEqual(nav.groups().map((g) => g.title), ["A", "B"]);
  const { prev, next } = nav.prevNext("y");
  assert.equal(prev, null);
  assert.equal(next?.slug, "x");
});

test("slugify: lowercases, dashes spaces, drops punctuation", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("Getting Started"), "getting-started");
});

test("topFolderOf: the first slug segment (or '' for a bare slug)", () => {
  assert.equal(topFolderOf("features/search/semantic"), "features");
  assert.equal(topFolderOf("features"), "features");
  assert.equal(topFolderOf(""), "");
});

test("normalizeBasePath: default /docs; '' = root; trims slashes", () => {
  assert.equal(normalizeBasePath(undefined), "/docs"); // default
  assert.equal(normalizeBasePath("/docs"), "/docs");
  assert.equal(normalizeBasePath("docs"), "/docs"); // leading slash added
  assert.equal(normalizeBasePath("/docs/"), "/docs"); // trailing trimmed
  assert.equal(normalizeBasePath("guide/handbook"), "/guide/handbook");
  assert.equal(normalizeBasePath(""), ""); // explicit root
  assert.equal(normalizeBasePath("/"), ""); // root
});

test("docPath: joins base + slug; '' base yields a root-relative path", () => {
  assert.equal(docPath("/docs", "features/search"), "/docs/features/search");
  assert.equal(docPath("", "features/search"), "/features/search");
  assert.equal(docPath("/docs", "intro.md"), "/docs/intro.md"); // projection ext baked into slug
});

test("activeTabIndex: the tab owning the slug's top folder; first tab as fallback", () => {
  const tabs = [
    { pages: ["getting-started", "features"] },
    { pages: ["concepts", "advanced"] },
  ];
  assert.equal(activeTabIndex(tabs, "features/search/semantic"), 0);
  assert.equal(activeTabIndex(tabs, "concepts/agents"), 1);
  assert.equal(activeTabIndex(tabs, "advanced"), 1);
  assert.equal(activeTabIndex(tabs, "unknown/page"), 0); // fallback → first tab
  assert.equal(activeTabIndex(tabs, ""), 0);
});

const SITE = "https://kura.build";

test("ogImageUrl: nested slug passes through; home uses the index sentinel (never /og/.png)", () => {
  assert.equal(ogImageUrl(SITE, "getting-started/sdk"), "https://kura.build/og/getting-started/sdk.png");
  assert.equal(ogImageUrl(SITE, "sdk"), "https://kura.build/og/sdk.png");
  assert.equal(ogImageUrl(SITE, ""), "https://kura.build/og/index.png"); // not /og/.png
  assert.equal(ogImageUrl("https://kura.build/", "sdk"), "https://kura.build/og/sdk.png"); // siteUrl trailing slash → no //
});

test("normalizeOgSlug: strips .png, maps the home sentinel back, tolerates missing param", () => {
  assert.equal(normalizeOgSlug("getting-started/sdk.png"), "getting-started/sdk"); // joined catch-all
  assert.equal(normalizeOgSlug("sdk.png"), "sdk");
  assert.equal(normalizeOgSlug("index.png"), "");
  assert.equal(normalizeOgSlug("index"), "");
  assert.equal(normalizeOgSlug(""), "");
  assert.equal(normalizeOgSlug(undefined), "");
});

test("resolveOgSlug: a real doc named 'index' wins over the home sentinel; else falls back to home", () => {
  assert.equal(resolveOgSlug(new Set(["index"]), "index.png"), "index"); // literal doc wins → its own card
  assert.equal(resolveOgSlug(new Set([""]), "index.png"), ""); // no 'index' doc → home sentinel
  assert.equal(resolveOgSlug(new Set(["getting-started/sdk"]), "getting-started/sdk.png"), "getting-started/sdk");
  assert.equal(resolveOgSlug(new Set(["sdk"]), "sdk.png"), "sdk");
  assert.equal(resolveOgSlug(new Set([]), undefined), ""); // /og with no segment → home
});

test("contract: the OG meta URL round-trips back to the doc slug through the route handler", () => {
  // What the meta tag emits and what the og/[[...slug]] handler receives must agree, or the image
  // 404s (the reported bug). June delivers the path after /og/ as the joined catch-all param.
  for (const slug of ["getting-started/sdk", "sdk", ""]) {
    const param = ogImageUrl(SITE, slug).slice(`${SITE}/og/`.length); // e.g. "getting-started/sdk.png"
    assert.equal(normalizeOgSlug(param), slug, `slug=${JSON.stringify(slug)}`);
  }
});

test("canonicalUrl: siteUrl + doc path, trailing slash trimmed (home stays at the base root)", () => {
  assert.equal(canonicalUrl(SITE, "/docs", "getting-started/sdk"), "https://kura.build/docs/getting-started/sdk");
  assert.equal(canonicalUrl(SITE, "/docs", ""), "https://kura.build/docs"); // home, no trailing slash
  assert.equal(canonicalUrl(SITE, "", "guide"), "https://kura.build/guide"); // basePath "" (site root)
  assert.equal(canonicalUrl(SITE, "", ""), "https://kura.build/"); // root home → "/"
  assert.equal(canonicalUrl("https://kura.build/", "/docs", "a/b"), "https://kura.build/docs/a/b"); // siteUrl trailing slash → no //
});
