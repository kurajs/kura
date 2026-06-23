import { test } from "node:test";
import assert from "node:assert/strict";
import { Bm25 } from "../src/bm25.ts";

test("ranks the document with the rare query terms first", () => {
  const bm = Bm25.from([
    { id: "a", text: "the quick brown fox jumps" },
    { id: "b", text: "the lazy dog sleeps all day" },
    { id: "c", text: "quantum entanglement in modern physics" },
  ]);
  assert.equal(bm.search("quantum physics")[0]?.id, "c");
});

test("idf down-weights common terms (the discriminative term wins)", () => {
  const bm = Bm25.from([
    { id: "a", text: "search engine ranking algorithm" },
    { id: "b", text: "the the the the the search the the" },
  ]);
  // 'engine' is rare (only in a); despite b spamming 'search', a should win.
  assert.equal(bm.search("search engine")[0]?.id, "a");
});

test("returns the payload and respects topK", () => {
  const bm = Bm25.from<{ n: number }>([
    { id: "a", text: "alpha bravo", data: { n: 1 } },
    { id: "b", text: "bravo charlie", data: { n: 2 } },
  ]);
  const hits = bm.search("alpha", { topK: 1 });
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0]?.data, { n: 1 });
});

test("data is optional for the untyped (unknown) payload, carried through when typed", () => {
  // unknown payload → data may be omitted; hit.data is undefined at runtime
  const untyped = Bm25.from([{ id: "a", text: "hello world" }]);
  assert.equal(untyped.search("hello")[0]?.data, undefined);
  // typed payload (M excludes undefined) → data is carried through
  const typed = Bm25.from<{ url: string }>([{ id: "a", text: "hello", data: { url: "/a" } }]);
  assert.deepEqual(typed.search("hello")[0]?.data, { url: "/a" });
  // (The compile-time guarantee — `data` required when M excludes undefined — is enforced by
  //  tsc building src + the typed Bm25.from call sites in @kurajs/docs, not at strip-types runtime.)
});

test("length normalization: a focused short doc beats a long diluted one", () => {
  const bm = Bm25.from([
    { id: "short", text: "kubernetes" },
    { id: "long", text: "kubernetes " + "filler word ".repeat(200) },
  ]);
  assert.equal(bm.search("kubernetes")[0]?.id, "short");
});

test("tokensOf exposes the index's tokenization (per the configured resolver + lang)", () => {
  const bm = Bm25.from<unknown>(
    [{ id: "a", text: "x" }],
    { resolveTokenizer: (lang) => (lang === "rev" ? (s) => [s.split("").reverse().join("")] : (s) => s.toLowerCase().split(/\s+/).filter(Boolean)) },
  );
  assert.deepEqual(bm.tokensOf("Hello World"), ["hello", "world"]);
  assert.deepEqual(bm.tokensOf("abc", "rev"), ["cba"]); // resolver picks the per-lang tokenizer
});

test("a negative topK returns no hits (not slice's drop-last behavior)", () => {
  const bm = Bm25.from([{ id: "a", text: "x" }, { id: "b", text: "x" }, { id: "c", text: "x" }]);
  assert.deepEqual(bm.search("x", { topK: -1 }), []);
  assert.equal(bm.search("x", { topK: 1.9 }).length, 1);
});

test("empty index and no-match queries are safe", () => {
  assert.deepEqual(new Bm25().search("anything"), []);
  const bm = Bm25.from([{ id: "a", text: "hello world" }]);
  assert.deepEqual(bm.search("zzz"), []);
  assert.deepEqual(bm.search(""), []);
});

test("a custom tokenizer is honored", () => {
  // character-bigram tokenizer (toy CJK-style) — proves injection works
  const bigram: (s: string) => string[] = (s) => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };
  const bm = Bm25.from([
    { id: "a", text: "搜尋引擎" },
    { id: "b", text: "資料庫系統" },
  ], { tokenize: bigram });
  assert.equal(bm.search("搜尋")[0]?.id, "a");
});
