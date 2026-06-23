// The one Kura file. This example focuses on CJK keyword search: per-locale tokenization
// (繁中 / 日本語) plus opt-in 繁/简 normalization with OpenCC — kept separate from the
// English `examples/docs` so CJK users get a focused demo and English users aren't
// burdened with it.
import { defineKura, createDocs } from "@kurajs/docs";
import { byLocale, pipeline, latinTokenizer } from "@kurajs/search";
import { cjkSegmenter } from "@kurajs/tokenizers";
import * as OpenCC from "opencc-js";
import { DOCS, doc, docs } from "./app/_content";
import { MDX } from "./app/_mdx";
import { META, META_LOCALES } from "./app/_meta";

// zh-TW analysis chain: fold 繁/简 to one Traditional vocabulary (OpenCC's `twp`) so a
// Simplified query like 软件 / 网络 matches a Traditional doc that says 軟體 / 網路, THEN
// word-segment with
// the native Intl.Segmenter. OpenCC's Converter is already a `(text) => string`, i.e. a
// CharFilter, so it drops straight into `pipeline({ pre })` — no extra Kura package needed.
// Run the SAME pipeline at index and query time (the resolver below guarantees that).
const zhTW = pipeline({
  pre: [OpenCC.Converter({ from: "cn", to: "twp" })],
  segment: cjkSegmenter("zh-TW"),
});

const kuraConfig = defineKura({
  site: {
    name: "Kura 文件",
    brand: "Kura",
    titleTemplate: "%s · Kura",
    description: "為人類與 AI agent 打造的知識庫。",
  },
  i18n: {
    defaultLocale: "zh-TW",
    locales: {
      "zh-TW": {},
      "ja-JP": { path: "/ja" },
    },
  },
  localeNames: { "zh-TW": "繁體中文", "ja-JP": "日本語" },

  // ── The point of this example ──
  // Per-locale keyword tokenizer: zh-TW gets OpenCC fold + Intl.Segmenter, ja gets
  // Intl.Segmenter, everything else falls back to the Latin tokenizer. `default` is the
  // zh-TW chain because this site's primary language is Traditional Chinese.
  tokenizer: byLocale({
    default: zhTW,
    "zh-TW": zhTW,
    ja: cjkSegmenter("ja"),
    en: latinTokenizer,
  }),

  // No embedder → keyword-only (pure BM25, zero model). Add `embedder: transformers()`
  // (and an index) to upgrade to hybrid keyword + semantic / cross-lingual search.
});

export default kuraConfig;

export const kura = createDocs({
  content: { DOCS, doc, docs },
  i18n: kuraConfig.i18n,
  mdxHtml: MDX,
  meta: META,
  metaLocales: META_LOCALES,
  config: kuraConfig,
});
