import { test } from "node:test";
import assert from "node:assert/strict";
import { treeOf, flattenTree, createNav, slugify, type NavNode, type DocLike } from "../src/nav.ts";
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
