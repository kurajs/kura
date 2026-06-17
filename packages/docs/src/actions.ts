// Agent tools as a factory. One defineAction() is a UI/server action AND an MCP tool at
// /mcp, behind a single auth gate. Wire these once and every Kura docs app gets a
// semantic `search_docs` + `get_page` tool — the agent side of "humans and agents".
import { defineAction } from "@junejs/core/agent";
import type { SearchHandle } from "./search.ts";
import type { DocLike } from "./nav.ts";

export function docsActions(opts: {
  search: SearchHandle;
  entries: readonly DocLike[];
  doc: (slug: string, locale?: string) => DocLike | null | undefined;
}) {
  const search_docs = defineAction({
    id: "search_docs",
    description:
      "Semantic search over the docs. Returns the most relevant passages with their doc slug, title, and similarity score.",
    input: {
      type: "object",
      properties: {
        query: { type: "string", description: "A natural-language question or keywords." },
        topK: { type: "integer", description: "Number of results to return (default 5)." },
      },
      required: ["query"],
    },
    async run(input: { query: string; topK?: number }) {
      return opts.search.search(input.query, { topK: input.topK ?? 5 });
    },
  });

  const get_page = defineAction({
    id: "get_page",
    description: "Fetch one doc page as clean Markdown by its slug (e.g. introduction, search, agents).",
    input: {
      type: "object",
      properties: { slug: { type: "string", description: "The page slug." } },
      required: ["slug"],
    },
    run(input: { slug: string }) {
      const e = opts.doc(input.slug);
      if (e) return { slug: e.slug, title: String(e.data.title ?? e.slug), markdown: e.original };
      return { error: `No page "${input.slug}". Pages: ${opts.entries.map((d) => d.slug).join(", ")}` };
    },
  });

  return { search_docs, get_page };
}
