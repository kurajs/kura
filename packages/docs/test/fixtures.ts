// Shared test fixture: Kura's own folder-driven docs set (mirrors examples/docs), en-first, with
// folder index pages, per-folder meta, and a partial ja-JP mirror for the i18n tests. Used across
// nav / meta / i18n tests so the fixture doubles as a spec for the example site's shape.
import type { DocLike } from "../src/nav.ts";
import type { MetaMap } from "../src/meta.ts";

/** Minimal DocLike — nav logic only needs slug + data.title (+ optional order/section/locale). */
export function doc(slug: string, title?: string, extra: Record<string, unknown> = {}): DocLike {
  return { slug, data: { ...(title ? { title } : {}), ...extra }, html: "", original: "", body: "" };
}

// Folder index files are slug-collapsed to the folder path (June does this): `features/index.md`
// → slug "features", `features/search/index.md` → "features/search".
export const DOCS: DocLike[] = [
  doc("getting-started", "Get started"), // getting-started/index
  doc("getting-started/introduction", "Introduction"),
  doc("getting-started/quickstart", "Quickstart"),
  doc("features", "Features"), // features/index
  doc("features/search", "Search"), // features/search/index
  doc("features/search/semantic", "Semantic search"),
  doc("features/search/lexical", "Lexical fallback"),
  doc("features/projections", "Projections"), // features/projections/index
  doc("features/projections/markdown", "Markdown"),
  doc("features/projections/json", "JSON"),
  doc("features/projections/mcp", "MCP"),
  doc("concepts/content-model", "The content model"), // concepts has NO index page
  doc("concepts/agents", "Agent-native"),
  doc("advanced/deploy", "Deploy"), // advanced has NO index page
  doc("advanced/i18n", "Internationalization"),
];

export const META: MetaMap = {
  "": { pages: ["getting-started", "features", "concepts", "advanced"] },
  "getting-started": { title: "Get started", pages: ["index", "introduction", "quickstart"] },
  features: { title: "Features", pages: ["index", "search", "projections"] },
  "features/search": { title: "Search", pages: ["index", "semantic", "lexical"] },
  "features/projections": { title: "Projections", pages: ["index", "markdown", "json", "mcp"] },
  concepts: { title: "Concepts", pages: ["content-model", "agents"] },
  advanced: { title: "Advanced", pages: ["deploy", "i18n"] },
};

// ja-JP mirror — a PARTIAL translation (title overrides only; folders left out fall back to en).
// Mirrors examples/docs/content/docs/ja-JP/**/meta.json.
export const META_JA: MetaMap = {
  "getting-started": { title: "入門" },
  features: { title: "機能" },
  "features/search": { title: "検索" },
  concepts: { title: "コンセプト" },
};

// The slugs ja-JP actually translates (partial). Everything else falls back to the en entry.
const JA_SLUGS: Record<string, string> = {
  "getting-started/introduction": "はじめに",
  "getting-started/quickstart": "クイックスタート",
  "features/search/semantic": "セマンティック検索",
  "concepts/agents": "AI エージェント向け",
};

/** A locale-merged listing, mirroring June's `docs(locale)` lister: each entry is its locale variant
 *  when present, else the en default. Lets the nav tests exercise per-locale trees without June. */
export function docsFor(locale?: string): DocLike[] {
  if (locale !== "ja-JP") return DOCS;
  return DOCS.map((e) =>
    JA_SLUGS[e.slug] ? { ...e, data: { ...e.data, title: JA_SLUGS[e.slug] }, locale: "ja-JP" } : e,
  );
}
