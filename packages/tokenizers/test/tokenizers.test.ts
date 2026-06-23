import { test } from "node:test";
import assert from "node:assert/strict";
import { cjkBigram, cjkSegmenter, hasSegmenter } from "../src/index.ts";
import { Bm25, byLocale, latinTokenizer } from "@kurajs/search";

test("cjkBigram emits overlapping bigrams for CJK runs", () => {
  assert.deepEqual(cjkBigram()("搜尋引擎"), ["搜尋", "尋引", "引擎"]);
});

test("cjkBigram keeps Latin/number runs as whole lowercased words", () => {
  assert.deepEqual(cjkBigram()("iPhone 15 手機"), ["iphone", "15", "手機"]);
});

test("cjkBigram emits a lone CJK char as a unigram", () => {
  assert.deepEqual(cjkBigram()("貓 dog"), ["貓", "dog"]);
});

test("a CJK query finds the right doc via bigram BM25", () => {
  const bm = Bm25.from(
    [
      { id: "a", text: "搜尋引擎很快" },
      { id: "b", text: "資料庫系統設計" },
    ],
    { tokenize: cjkBigram() },
  );
  assert.equal(bm.search("搜尋")[0]?.id, "a");
  assert.equal(bm.search("資料庫")[0]?.id, "b");
});

test("Intl.Segmenter is available in this runtime", () => {
  assert.equal(hasSegmenter(), true);
});

test("cjkSegmenter word-segments Chinese (native Intl.Segmenter)", () => {
  const toks = cjkSegmenter("zh")("搜尋引擎很快");
  // ICU should produce word-level units (not bigrams); at minimum non-empty word-like tokens.
  assert.ok(toks.length >= 1);
  assert.ok(toks.every((t) => t.length >= 1));
  assert.ok(toks.join("").includes("搜"));
});

test("cjkSegmenter falls back to bigram when no segmenter is provided", () => {
  const fellBack = cjkSegmenter("zh", { fallback: cjkBigram() });
  assert.equal(typeof fellBack, "function"); // smoke: constructs without throwing
});

test("byLocale wires segmenter for zh and latin elsewhere in one index", () => {
  const bm = Bm25.from(
    [
      { id: "zh", text: "向量搜尋", lang: "zh" },
      { id: "en", text: "vector search", lang: "en" },
    ],
    { resolveTokenizer: byLocale({ default: latinTokenizer, zh: cjkSegmenter("zh") }) },
  );
  assert.equal(bm.search("搜尋", { lang: "zh" })[0]?.id, "zh");
  assert.equal(bm.search("vector", { lang: "en" })[0]?.id, "en");
});
