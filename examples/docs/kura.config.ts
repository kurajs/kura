// The one Kura file: declare the docs site and bind it to this app's content + index.
import { createDocs } from "@kurajs/docs";
import { transformers } from "@kurajs/transformers";
import { DOCS, doc, docs } from "./app/_content";
import { i18n } from "./june.config";
import fs from "node:fs";
import path from "node:path";

const indexPath = path.join(process.cwd(), "app", "_index.bin");
const indexBytes = fs.existsSync(indexPath) ? new Uint8Array(fs.readFileSync(indexPath)) : undefined;

const mdxPath = path.join(process.cwd(), "app", "_mdx.json");
const mdxHtml = fs.existsSync(mdxPath) ? JSON.parse(fs.readFileSync(mdxPath, "utf8")) : undefined;

export const kura = createDocs({
  content: { DOCS, doc, docs },
  i18n,
  indexBytes,
  mdxHtml,
  config: {
    // Section frontmatter values are stable English KEYS; sectionLabels localizes the display.
    sections: ["Get started", "Concepts", "Advanced"],
    sectionLabels: {
      "ja-JP": { "Get started": "入門", Concepts: "コンセプト", Advanced: "発展" },
    },
    localeNames: { en: "English", "ja-JP": "日本語" },
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
