import { defineKura } from "@kurajs/docs";

export default defineKura({
  site: { name: "PROJECT_NAME", brand: "PROJECT_NAME" },
  // Sidebar groups for the flat (frontmatter `section`) model. Using folders instead? Drop this —
  // add meta.json files and the nav becomes folder-driven (titles/order from meta.json, `tabs` too).
  sections: ["Getting started", "Guides"],
  // The Cloudflare Worker name defaults to this folder's name — `npm create kura website` would
  // deploy a Worker called "website". Set it explicitly to avoid a generic name on your account:
  //   deploy: { target: "workers", name: "PROJECT_NAME" },
  // basePath defaults to "/docs". Set basePath: "" to mount docs at the site root, or e.g.
  // "/guide" for a custom prefix — kura regenerates the route at the matching path on dev/build.
  // No embedder → zero-dependency lexical search, deploys to Cloudflare Workers out of the box.
  // For semantic search: npm i @kurajs/transformers @huggingface/transformers, then add:
  //   import { transformers } from "@kurajs/transformers";
  //   embedder: transformers()
  // and drop --no-embed from your scripts.
});
