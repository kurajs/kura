import { test } from "node:test";
import assert from "node:assert/strict";
import { byLocale, pipeline, lowercase, minLength, stopwords, latinTokenizer } from "../src/tokenize.ts";
import { Bm25 } from "../src/bm25.ts";

test("latinTokenizer lowercases and splits on non-alphanumerics", () => {
  assert.deepEqual(latinTokenizer("Hello, World! 42"), ["hello", "world", "42"]);
});

test("byLocale resolves exact tag, primary subtag, then default (case-insensitive)", () => {
  const zh: (s: string) => string[] = (s) => ["ZH:" + s];
  // specific-tag registration: matched case-insensitively (BCP 47 tags are case-insensitive)
  const r1 = byLocale({ default: latinTokenizer, "zh-TW": zh });
  assert.deepEqual(r1("zh-TW")("x"), ["ZH:x"]);
  assert.deepEqual(r1("zh-tw")("x"), ["ZH:x"]); // lowercased query
  assert.deepEqual(r1("ZH-TW")("x"), ["ZH:x"]); // uppercased query
  assert.deepEqual(r1("zh")("A b"), ["a", "b"]); // bare primary ≠ a specific-tag registration
  // primary-tag registration: a regional query falls back to it
  const r2 = byLocale({ default: latinTokenizer, zh });
  assert.deepEqual(r2("zh")("x"), ["ZH:x"]);
  assert.deepEqual(r2("ZH-Hant-TW")("x"), ["ZH:x"]); // primary subtag, any case
  assert.deepEqual(r2("en")("A b"), ["a", "b"]); // falls to default
  assert.deepEqual(r2(undefined)("A b"), ["a", "b"]);
});

test("pipeline composes pre-filters, segmenter, and token filters", () => {
  const tok = pipeline({
    pre: (t) => t.replace(/<[^>]+>/g, " "), // strip tags
    segment: latinTokenizer,
    filters: [lowercase, stopwords(["the"]), minLength(2)],
  });
  assert.deepEqual(tok("<b>The</b> Quick a Fox"), ["quick", "fox"]);
});

test("Bm25 with a per-locale resolver tokenizes each doc by its lang", () => {
  // toy bigram for the 'zh' locale; latin elsewhere
  const bigram: (s: string) => string[] = (s) => { const o: string[] = []; for (let i = 0; i < s.length - 1; i++) o.push(s.slice(i, i + 2)); return o; };
  const bm = Bm25.from(
    [
      { id: "en", text: "search engine", lang: "en" },
      { id: "zh", text: "搜尋引擎", lang: "zh" },
    ],
    { resolveTokenizer: byLocale({ default: latinTokenizer, zh: bigram }) },
  );
  assert.equal(bm.search("搜尋", { lang: "zh" })[0]?.id, "zh");
  assert.equal(bm.search("engine", { lang: "en" })[0]?.id, "en");
});
