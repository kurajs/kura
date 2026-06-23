# Kura example: docs-cjk（中日文搜尋）

A focused demo of **CJK keyword search** — per-locale tokenization for Traditional
Chinese (zh-TW) and Japanese (ja), plus opt-in **繁/简 normalization** with OpenCC.
Kept separate from [`examples/docs`](../docs) so CJK users get a clean demo and
English users aren't burdened with it.

```sh
npm run verify   # 證明分詞 + 繁简通用真的有效(不需啟動完整 app)
npm run dev      # http://localhost:3000
```

## 這個範例示範什麼

- **依語系斷詞**:中文/日文沒有空格,用 `byLocale()` 為每個語系挑分詞器——繁中與
  日文用原生 `Intl.Segmenter`(ICU 詞典),其他語言用拉丁分詞器。**同一個索引**內每篇
  文件按自己的語系斷詞、每個查詢按查詢語系斷詞。
- **繁/简通用**:繁體與简体的用詞不同(軟體/软件、網路/网络、程式/程序)。用 OpenCC
  在索引與查詢時都折算成同一套繁體用詞,所以讀者輸入简体也能命中繁體文件。
- **純關鍵字、零模型**:這個站只開 BM25 關鍵字搜尋,部署到任何環境(含 Cloudflare
  Workers)都不需要 embedding 模型。

## 核心設定(`kura.config.ts`)

OpenCC 的 `Converter({ from, to })` 本身就是 `(text) => string`,也就是一個
`CharFilter`,直接塞進 `pipeline({ pre })`:

```ts
import { byLocale, pipeline, latinTokenizer } from "@kurajs/search";
import { cjkSegmenter } from "@kurajs/tokenizers";
import * as OpenCC from "opencc-js";

const zhTW = pipeline({
  pre: [OpenCC.Converter({ from: "cn", to: "twp" })], // 繁简轉換 → 繁體(twp)
  segment: cjkSegmenter("zh-TW"),                      // 原生 Intl.Segmenter 斷詞
});

defineKura({
  i18n: { defaultLocale: "zh-TW", locales: { "zh-TW": {}, "ja-JP": { path: "/ja" } } },
  tokenizer: byLocale({
    default: zhTW,
    "zh-TW": zhTW,
    ja: cjkSegmenter("ja"),
    en: latinTokenizer,
  }),
});
```

## 升級成混合搜尋(選用)

加上 `embedder: transformers()`(`@kurajs/transformers`)即可從純關鍵字升級為
**hybrid**(BM25 + 向量語意 + 跨語言)。向量端的 bge-m3 是多語模型,語意上本來就能
橋接繁體與简体,所以混合模式下 OpenCC 主要是補強關鍵字端的精確度。

## 相依

`opencc-js`(Apache-2.0,約 5MB 詞典)只有需要繁简通用的站才安裝;單一字體的站台
其實不需要它。
