// The one Kura file: declare your docs site here. june.config.ts is a generated shim that just
// feeds this to June — you never edit it. `kura` (below) wires the content + index for the routes.
import { defineKura, createDocs } from "@kurajs/docs";
import { DOCS, doc } from "./app/_content";
import { MDX } from "./app/_mdx";
import { META, META_LOCALES } from "./app/_meta";

const kuraConfig = defineKura({
  site: { name: "PROJECT_NAME", brand: "PROJECT_NAME" },
  // Sidebar groups for the flat (frontmatter `section`) model. Using folders instead? Drop this —
  // add meta.json files and the nav becomes folder-driven (titles/order from meta.json, `tabs` too).
  sections: ["Getting started", "Guides"],
  // basePath defaults to "/docs" (routes live in app/docs/[[...slug]]). To mount at the site root,
  // set basePath: "" AND move that route folder to app/[[...slug]].
  // No embedder → zero-dependency lexical search (installs clean, deploys to Workers out of the box).
  // For SEMANTIC search: npm i @kurajs/transformers @huggingface/transformers, then add
  // `embedder: transformers()` here, pass indexBytes from ./app/_index, and drop --no-embed.
});

export default kuraConfig;

export const kura = createDocs({
  content: { DOCS, doc },
  mdxHtml: MDX,
  // Folder nav metadata, frozen from content/docs/**/meta.json by `kura index` (empty until you add
  // meta.json files; then top-level folders become sections and a root meta.json `tabs` array works).
  meta: META,
  metaLocales: META_LOCALES,
  config: kuraConfig,
});
