// Proof that this example's per-locale tokenizer config actually works: build the SAME
// tokenizer kura.config.ts uses, index the real content/*.md, and run CJK queries —
// including Simplified queries that must hit Traditional docs via the OpenCC fold.
//
//   npm run verify
import { Bm25, byLocale, pipeline, latinTokenizer } from "@kurajs/search";
import { cjkSegmenter } from "@kurajs/tokenizers";
import * as OpenCC from "opencc-js";
import fs from "node:fs";
import path from "node:path";

// ── the exact tokenizer from kura.config.ts ──
const zhTW = pipeline({ pre: [OpenCC.Converter({ from: "cn", to: "twp" })], segment: cjkSegmenter("zh-TW") });
const resolveTokenizer = byLocale({ default: zhTW, "zh-TW": zhTW, ja: cjkSegmenter("ja"), en: latinTokenizer });

// ── load content/docs/**/*.md, tagging each doc by locale ──
const root = "content/docs";
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}
const records = walk(root).map((file) => {
  const raw = fs.readFileSync(file, "utf8");
  // The app indexes each doc's body (frontmatter already parsed into `data`) after stripMdx,
  // which only removes JSX/MDX component tags — it does NOT strip emphasis or headings. So we
  // mirror that: strip just the frontmatter to recover the body, and otherwise leave Markdown
  // intact. (This is why the demo content avoids `**` around CJK keywords: emphasis markers
  // survive stripMdx and would split a term when the tokenizer runs.)
  const body = raw.replace(/^---[\s\S]*?---/, "").trim();
  const title = (raw.match(/title:\s*(.+)/)?.[1] ?? file).trim();
  const rel = path.relative(root, file).split(path.sep).join("/"); // POSIX separators (Windows-safe)
  const lang = rel.startsWith("ja-JP/") ? "ja" : "zh-TW"; // default locale = zh-TW
  const slug = rel.replace(/\.md$/, "");
  return { id: slug, text: `${title}\n${body}`, lang, data: { slug } };
});

const bm = Bm25.from(records, { resolveTokenizer });
const show = (q, lang) => {
  const hits = bm.search(q, { topK: 3, lang });
  console.log(`  q="${q}" (${lang})  →  ${hits.map((x) => x.data.slug).join(", ") || "(none)"}`);
};

console.log(`indexed ${records.length} docs (per-locale tokenized)\n`);
console.log("繁中關鍵字(Intl.Segmenter 斷詞):");
show("向量搜尋", "zh-TW");
show("軟體開發", "zh-TW");
show("資料庫", "zh-TW");
console.log("\n简体查詢 → 繁體文件(OpenCC 繁简通用):");
show("软件", "zh-TW"); // → 軟體
show("网络", "zh-TW"); // → 網路
show("程序设计", "zh-TW"); // → 程式設計
console.log("\n日本語(Intl.Segmenter 斷詞):");
show("単語分割", "ja");
show("検索", "ja");
