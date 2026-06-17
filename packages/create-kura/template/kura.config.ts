// The one Kura file: declare the docs site and bind it to your content + index.
import { createDocs } from "@kurajs/docs";
import { transformers } from "@kurajs/transformers";
import { DOCS, doc } from "./app/_content";
import { INDEX_B64 } from "./app/_index";
import { MDX } from "./app/_mdx";

// Frozen by `kura index` and imported (not read from disk) so the worker bundle stays
// filesystem-free on Cloudflare Workers. atob is available on Workers, Bun, and Node 18+.
const indexBytes = Uint8Array.from(atob(INDEX_B64), (c) => c.charCodeAt(0));

export const kura = createDocs({
  content: { DOCS, doc },
  indexBytes,
  mdxHtml: MDX,
  config: {
    sections: ["Getting started", "Guides"],
    site: { name: "PROJECT_NAME", brand: "PROJECT_NAME" },
    embedder: transformers(), // local bge-m3 (swap for workersAI() on Cloudflare)
  },
});
