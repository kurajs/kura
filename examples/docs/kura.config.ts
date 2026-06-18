// The one Kura file: declare the docs site and bind it to this app's content + index.
import { createDocs } from "@kurajs/docs";
import { transformers } from "@kurajs/transformers";
import { DOCS, doc, docs } from "./app/_content";
import { INDEX_B64 } from "./app/_index";
import { MDX } from "./app/_mdx";
import { META, META_LOCALES } from "./app/_meta";
import { i18n } from "./june.config";

// Frozen by `kura index` and imported (not read from disk) so the worker bundle stays
// filesystem-free on Cloudflare Workers. atob is available on Workers, Bun, and Node 18+.
const indexBytes = Uint8Array.from(atob(INDEX_B64), (c) => c.charCodeAt(0));

export const kura = createDocs({
  content: { DOCS, doc, docs },
  i18n,
  indexBytes,
  mdxHtml: MDX,
  // Folder-driven nav: top-level folders are the sections, ordered by content/docs/meta.json.
  // META_LOCALES localizes folder group titles per locale (e.g. "Features" → "機能").
  meta: META,
  metaLocales: META_LOCALES,
  config: {
    localeNames: { en: "English", "ja-JP": "日本語" },
    // Tab structure is declared once in content/docs/meta.json; only the titles localize here,
    // keyed by the English title (same shape as sectionLabels).
    tabLabels: { "ja-JP": { Guides: "ガイド", Reference: "リファレンス" } },
    site: { name: "Kura Docs", brand: "Kura" },
    embedder: transformers(), // local bge-m3 (swap for workersAI() on Cloudflare)
    labels: {
      "ja-JP": {
        onThisPage: "目次",
        searchPlaceholder: "ドキュメントを検索…  (/ キー)",
        copyMarkdown: "Markdown をコピー",
        viewMarkdown: "Markdown として表示",
        openInChatGPT: "ChatGPT で開く",
        openInClaude: "Claude で開く",
        previous: "前へ",
        next: "次へ",
        search: "検索",
        noResults: "結果がありません。",
        notTranslated: "未翻訳 —— デフォルト言語で表示しています。",
      },
    },
  },
});
