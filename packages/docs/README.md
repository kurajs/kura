# @kurajs/docs

**The docs framework on [June](https://june.build) — a knowledgebase for humans and agents.**

One Markdown source becomes a polished website for people *and* a callable MCP server for
agents, with no duplication. Sidebar, table of contents, semantic search, copy-as-Markdown,
MDX components, and i18n are built in — not bolted on.

The fastest way to start is the scaffolder:

```bash
npm create kura my-docs
```

## What you get

- **Three-column docs UI** — sidebar (from frontmatter `section`/`order`), table of contents
  with anchored headings, breadcrumb, and prev/next pager.
- **Semantic search** — pure-JS vector retrieval via [`@kurajs/core`](https://www.npmjs.com/package/@kurajs/core),
  built at `kura index` time and loaded as a static asset (Workers-safe).
- **Agent surface** — every page ships `.md` / `.json` projections, a `/llms.txt` index, and
  `search_docs` + `get_page` MCP tools at `/mcp`.
- **MDX, default-on** — curated `Callout` / `Card` / `Steps` / `Tabs`, precompiled to static
  HTML at build time; the agent-facing `.md` stays clean.
- **i18n** — per-locale content with default-language fallback, localized UI strings and
  navigation, a language switcher, and cross-lingual search.

## Usage

`kura.config.ts` is the one wiring point — bind your generated content and index to the
framework:

```ts
import { createDocs } from "@kurajs/docs";
import { transformers } from "@kurajs/transformers";
import { DOCS, doc, docs } from "./app/_content";

export const kura = createDocs({
  content: { DOCS, doc, docs },
  config: {
    sections: ["Get started", "Concepts"],
    site: { name: "My Docs", brand: "My" },
    embedder: transformers(),
  },
});
```

Route files are thin re-exports of the bound handlers (`kura.docRoute`, `kura.home`,
`kura.searchRoute`). See **[kura.build](https://kura.build)** for the full guide.

## Subpath exports

| Import | Use |
| --- | --- |
| `@kurajs/docs` | `createDocs` + headless nav helpers (runtime) |
| `@kurajs/docs/ui` | Presentational React components + theme |
| `@kurajs/docs/search` | `buildIndex` / `createSearch` (June-free) |
| `@kurajs/docs/mdx` | Build-time MDX → HTML (used by `kura index`) |
| `@kurajs/docs/actions` | The `search_docs` / `get_page` MCP action factory |

## License

MIT
