// The one Kura file: declare the docs site and bind it to your content.
import { createDocs } from "@kurajs/docs";
import { DOCS, doc } from "./app/_content";
import { MDX } from "./app/_mdx";

export const kura = createDocs({
  content: { DOCS, doc },
  mdxHtml: MDX,
  config: {
    sections: ["Getting started", "Guides"],
    site: { name: "PROJECT_NAME", brand: "PROJECT_NAME" },
    // No embedder → zero-dependency lexical search, so this site installs clean and deploys to
    // Cloudflare Workers out of the box. To upgrade to SEMANTIC search:
    //   1. npm i @kurajs/transformers @huggingface/transformers
    //   2. import { transformers } from "@kurajs/transformers";
    //      import { INDEX_B64 } from "./app/_index";
    //      add  embedder: transformers()  here, and pass
    //      indexBytes: Uint8Array.from(atob(INDEX_B64), (c) => c.charCodeAt(0))
    //   3. drop --no-embed from the scripts in package.json
  },
});
