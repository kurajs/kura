import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMeta } from "../src/meta.ts";
import { treeOf, flattenTree, type NavNode, type DocLike } from "../src/nav.ts";
import { DOCS, META, META_JA, docsFor } from "./fixtures.ts";

const group = (nodes: NavNode<DocLike>[], key: string) => {
  const g = nodes.find((n) => n.kind === "group" && n.key === key);
  assert.ok(g && g.kind === "group", `expected a group "${key}"`);
  return g as Extract<NavNode<DocLike>, { kind: "group" }>;
};
const titleOf = (nodes: NavNode<DocLike>[], key: string) => group(nodes, key).title;

test("mergeMeta: a locale override is shallow-merged per folder; base fields survive", () => {
  const merged = mergeMeta(META, META_JA);
  // title is localized…
  assert.equal(merged.features!.title, "機能");
  // …but `pages` (not in the override) is kept from the base, so ordering is unchanged.
  assert.deepEqual(merged.features!.pages, ["index", "search", "projections"]);
});

test("mergeMeta: folders the locale never mentions keep the base meta verbatim", () => {
  const merged = mergeMeta(META, META_JA);
  assert.equal(merged.advanced, META.advanced); // same reference — untouched
  assert.equal(merged["features/projections"]!.title, "Projections"); // no ja override → en
});

test("mergeMeta: undefined base yields just the override (no crash)", () => {
  assert.deepEqual(mergeMeta(undefined, { x: { title: "X" } }), { x: { title: "X" } });
});

test("locale tree: folder group titles localize where the locale provides them, else fall back", () => {
  const tree = treeOf(docsFor("ja-JP"), mergeMeta(META, META_JA));
  assert.equal(titleOf(tree, "getting-started"), "入門");
  assert.equal(titleOf(tree, "features"), "機能");
  assert.equal(titleOf(tree, "concepts"), "コンセプト");
  assert.equal(titleOf(tree, "advanced"), "Advanced"); // no ja override → en
  // nested folder localizes too
  assert.equal(titleOf(group(tree, "features").children, "search"), "検索");
});

test("locale tree: route targets (slugs) are IDENTICAL across locales — only labels differ", () => {
  // The reading order / nested slugs must not change with locale, so /docs/<slug> and
  // /<locale>/docs/<slug> resolve the same pages — only the displayed titles are localized.
  const en = flattenTree(treeOf(DOCS, META)).map((e) => e.slug);
  const ja = flattenTree(treeOf(docsFor("ja-JP"), mergeMeta(META, META_JA))).map((e) => e.slug);
  assert.deepEqual(ja, en);
  // 3-level nested slug present in both
  assert.ok(en.includes("features/search/semantic"));
});

test("locale listing: translated entries carry the locale; untranslated fall back to en", () => {
  const ja = docsFor("ja-JP");
  const semantic = ja.find((e) => e.slug === "features/search/semantic")!;
  assert.equal(semantic.locale, "ja-JP");
  assert.equal(semantic.data.title, "セマンティック検索");
  const lexical = ja.find((e) => e.slug === "features/search/lexical")!;
  assert.equal(lexical.locale, undefined); // no ja variant → en fallback
  assert.equal(lexical.data.title, "Lexical fallback");
});
