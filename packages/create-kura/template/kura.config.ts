// The one Kura file: declare the docs site and bind it to your content + index.
import { createDocs } from "@kurajs/docs";
import { transformers } from "@kurajs/transformers";
import { DOCS, doc } from "./app/_content";
import fs from "node:fs";
import path from "node:path";

const indexPath = path.join(process.cwd(), "app", "_index.bin");
const indexBytes = fs.existsSync(indexPath) ? new Uint8Array(fs.readFileSync(indexPath)) : undefined;

export const kura = createDocs({
  content: { DOCS, doc },
  indexBytes,
  config: {
    sections: ["Getting started", "Guides"],
    site: { name: "PROJECT_NAME", brand: "PROJECT_NAME" },
    embedder: transformers(), // local bge-m3 (swap for workersAI() on Cloudflare)
  },
});
