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

// Typeahead prefix expansion (prefixLast): the last query token matches as a prefix, so a partial
// word finds the full term. Earlier tokens stay exact; a too-short prefix doesn't expand.
test("prefixLast: a partial last token matches terms that start with it", () => {
  const bm = Bm25.from([
    { id: "feishu", text: "feishu lark messaging setup" },
    { id: "discord", text: "discord bot webhook setup" },
    { id: "feature", text: "feature flags configuration" },
  ]);
  // exact: a partial word finds nothing
  assert.equal(bm.search("feish").length, 0);
  // prefix: every stage from "fe" onward surfaces feishu, and it's the top hit by "feis"
  for (const q of ["fei", "feis", "feish"]) {
    const hits = bm.search(q, { prefixLast: true });
    assert.equal(hits[0]?.id, "feishu", `"${q}" should rank feishu first`);
  }
});

test("prefixLast: earlier tokens are exact, the prefix is the last — matches are OR-fused, best on top", () => {
  const bm = Bm25.from([
    { id: "a", text: "webhook secret setup" }, // webhook (exact) + secret (sec prefix) → both
    { id: "b", text: "webhook token rotation" }, // webhook only
    { id: "c", text: "polling secret store" }, // secret only (sec prefix)
  ]);
  // "webhook sec" → "webhook" exact + "sec" prefix. BM25 is OR-based, so c (secret) still matches,
  // but a (both terms) outranks it; b lacking any "sec*" term still matches on "webhook".
  const hits = bm.search("webhook sec", { prefixLast: true });
  assert.equal(hits[0]?.id, "a", "the doc with both terms ranks first");
  const rank = (id: string) => hits.findIndex((h) => h.id === id);
  assert.ok(rank("a") < rank("c"), "a (webhook + secret) outranks c (secret only)");
});

test("prefixLast: minPrefix guards a too-short prefix from expanding the whole vocab", () => {
  const bm = Bm25.from([{ id: "a", text: "alpha beta" }, { id: "b", text: "alagorithm" }]);
  assert.equal(bm.search("a", { prefixLast: true }).length, 0); // 1 char < minPrefix(2) → no expand → no exact term "a"
  assert.ok(bm.search("al", { prefixLast: true }).length >= 1); // 2 chars → expands (alpha/alagorithm)
});
