import { test } from "node:test";
import assert from "node:assert/strict";
import { byLocale, pipeline, lowercase, minLength, stopwords, latinTokenizer } from "../src/tokenize.ts";
import { Bm25 } from "../src/bm25.ts";

test("latinTokenizer lowercases and splits on non-alphanumerics", () => {
  assert.deepEqual(latinTokenizer("Hello, World! 42"), ["hello", "world", "42"]);
});

test("byLocale resolves exact tag, primary subtag, then default", () => {
  const ja: (s: string) => string[] = (s) => ["JA:" + s];
  const r = byLocale({ default: latinTokenizer, ja });
  assert.deepEqual(r("ja")("x"), ["JA:x"]);
  assert.deepEqual(r("ja-JP")("x"), ["JA:x"]); // primary subtag
  assert.deepEqual(r("en")("A b"), ["a", "b"]); // falls to default
  assert.deepEqual(r(undefined)("A b"), ["a", "b"]);
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
