import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChinese } from "../src/index.ts";
import { Bm25, byLocale, latinTokenizer, pipeline } from "@kurajs/search";
import { cjkSegmenter } from "@kurajs/tokenizers";

test("folds Simplified vocabulary into Traditional-TW (default)", () => {
  const fold = normalizeChinese();
  assert.equal(fold("软件"), "軟體");
  assert.equal(fold("网络"), "網路");
  assert.equal(fold("程序设计"), "程式設計");
});

test("idempotent on text already in Traditional-TW", () => {
  const fold = normalizeChinese();
  for (const s of ["軟體", "網路", "資料庫", "程式設計"]) assert.equal(fold(s), s);
});

test("leaves Latin and digits untouched", () => {
  assert.equal(normalizeChinese()("vector search 2026"), "vector search 2026");
});

test("can fold the other way (to Simplified)", () => {
  const fold = normalizeChinese({ to: "cn" });
  assert.equal(fold("軟體"), "软件");
  assert.equal(fold("软件"), "软件"); // idempotent on Simplified
});

test("cross-variant keyword match: Simplified query finds a Traditional doc", () => {
  // zh-TW analysis chain: OpenCC fold → native CJK segmentation.
  const zhTW = pipeline({ pre: [normalizeChinese()], segment: cjkSegmenter("zh-TW") });
  const bm = Bm25.from(
    [
      { id: "tw", text: "本文件介紹向量搜尋引擎的軟體架構", lang: "zh-TW" },
      { id: "other", text: "資料庫索引與查詢最佳化", lang: "zh-TW" },
    ],
    { resolveTokenizer: byLocale({ default: latinTokenizer, "zh-TW": zhTW }) },
  );
  // query typed in Simplified — should still hit the Traditional doc
  assert.equal(bm.search("软件", { lang: "zh-TW" })[0]?.id, "tw");
  // and a Traditional query works too
  assert.equal(bm.search("軟體", { lang: "zh-TW" })[0]?.id, "tw");
});
