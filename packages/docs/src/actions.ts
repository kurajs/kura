// Agent tools as a factory. One defineAction() is a UI/server action AND an MCP tool at
// /mcp, behind a single auth gate. Wire these once and every Kura docs app gets the read-only
// KnowledgeKura surface — search_docs / get_page / list_docs — the agent side of "humans and
// agents", and the shared grounding both Kura agents (maintainer + reader) build on. See
// docs/kura-agent-architecture.md. NOTE: read-only by design — writes go through reviewed PRs.
import { defineAction } from "@junejs/core/agent";
export { defineAction } from "@junejs/core/agent";
import type { SearchHandle } from "./search.ts";
import type { DocLike } from "./nav.ts";

// The `sources:` frontmatter — the code↔doc map. Normalized to a string[] (June parses a
// `[a, b]` list to string[]; a bare value to a string; absent → []).
function sourcesOf(e: DocLike): string[] {
  const s = (e.data as Record<string, unknown>).sources;
  return Array.isArray(s) ? (s as string[]) : typeof s === "string" && s ? [s] : [];
}

export function docsActions(opts: {
  search: SearchHandle;
  entries: readonly DocLike[];
  doc: (slug: string, locale?: string) => DocLike | null | undefined;
  /** slug → repo-relative source path (from frozen LinkData). get_page returns it as `source.path`
   *  so an agent holding the RAW markdown can resolve its relative links itself. */
  sourcePaths?: Record<string, string>;
  /** locale → slug → the variant's own source path — keeps source.path truthful when a locale
   *  variant's bytes are returned (the pairing invariant: path always describes the bytes). */
  localeSourcePaths?: Record<string, Record<string, string>>;
}) {
  const search_docs = defineAction({
    id: "search_docs",
    description:
      "Hybrid keyword + semantic search over the docs. Returns the most relevant passages with their doc slug, title, and relevance score.",
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
      properties: {
        slug: { type: "string", description: "The page slug." },
        locale: { type: "string", description: "Optional locale — returns that variant when it exists." },
      },
      required: ["slug"],
    },
    run(input: { slug: string; locale?: string }) {
      const e = opts.doc(input.slug, input.locale);
      if (e) {
        // The pairing invariant: source.path always describes the BYTES returned — the variant's
        // own file when a locale variant is served, the default file otherwise (incl. fallback).
        const path =
          (e.locale ? opts.localeSourcePaths?.[e.locale]?.[e.slug] : undefined) ?? opts.sourcePaths?.[e.slug];
        return {
          slug: e.slug,
          title: String(e.data.title ?? e.slug),
          section: String(e.data.section ?? ""),
          sources: sourcesOf(e), // code↔doc map (used to scope maintenance)
          markdown: e.original, // RAW authored bytes — agents resolve relative links via source.path
          ...(path ? { source: { path } } : {}),
        };
      }
      return { error: `No page "${input.slug}". Pages: ${opts.entries.map((d) => d.slug).join(", ")}` };
    },
  });

  const list_docs = defineAction({
    id: "list_docs",
    description:
      "List every doc page with its slug, title, section, and `sources` (the code paths it documents). The map for finding which pages a code change affects.",
    input: { type: "object", properties: {} },
    run() {
      return {
        pages: opts.entries.map((e) => ({
          slug: e.slug,
          title: String(e.data.title ?? e.slug),
          section: String(e.data.section ?? ""),
          sources: sourcesOf(e),
        })),
      };
    },
  });

  return { search_docs, get_page, list_docs };
}
