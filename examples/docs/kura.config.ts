// The one Kura file: declare the docs site and bind it to this app's content + index.
// june.config.ts is a generated shim that feeds this to June — you never edit it.
import { defineKura, createDocs } from "@kurajs/docs";
import { transformers } from "@kurajs/transformers";
import { DOCS, doc, docs } from "./app/_content";
import { INDEX_B64 } from "./app/_index";
import { MDX } from "./app/_mdx";
import { META, META_LOCALES } from "./app/_meta";

const indexBytes = Uint8Array.from(atob(INDEX_B64), (c) => c.charCodeAt(0));

const kuraConfig = defineKura({
  site: {
    name: "Kura Docs",
    brand: "Kura",
    titleTemplate: "%s · Kura Docs",
    description: "The knowledgebase for humans and agents.",
  },
  i18n: {
    defaultLocale: "en",
    locales: {
      en: {},
      "ja-JP": { path: "/ja" },
    },
  },
  localeNames: { en: "English", "ja-JP": "日本語" },
  tabLabels: { "ja-JP": { Guides: "ガイド", Reference: "リファレンス" } },
  embedder: transformers(),
  labels: {
    "ja-JP": {
      onThisPage: "目次",
      navigation: "ナビゲーション",
      searchPlaceholder: "ドキュメントを検索…  (/ キー)",
      copyMarkdown: "Markdown をコピー",
      copyMarkdownHint: "このページを LLM 向けに Markdown でコピー",
      viewMarkdown: "Markdown として表示",
      viewMarkdownHint: "このページをプレーンテキストで表示",
      openInChatGPT: "ChatGPT で開く",
      openInChatGPTHint: "このページについて ChatGPT に質問",
      openInClaude: "Claude で開く",
      openInClaudeHint: "このページについて Claude に質問",
      previous: "前へ",
      next: "次へ",
      search: "検索",
      noResults: "結果がありません。",
      notTranslated: "未翻訳 —— デフォルト言語で表示しています。",
    },
  },
  // EXPERIMENT: soft-swap navigation — June fetches the next page's HTML and morphs it in,
  // so the sidebar/scroll stay put and clicking around feels instant.
  june: { clientRouter: true },
});

export default kuraConfig;

export const kura = createDocs({
  content: { DOCS, doc, docs },
  i18n: kuraConfig.i18n,
  indexBytes,
  mdxHtml: MDX,
  meta: META,
  metaLocales: META_LOCALES,
  config: kuraConfig,
});
