# Kura

**The knowledgebase for humans and agents.**

Kura is agent-native documentation infrastructure, built on [June](https://june.build).
One Markdown source becomes a polished website for people *and* a callable MCP server for
agents — single source, zero drift. Sidebar, table of contents, semantic search,
copy-as-Markdown, MDX, and i18n are built in, not bolted on.

```bash
npm create kura my-docs
```

Then `npm install`, `npm run gen`, `npm run dev` — and open <http://localhost:3000>.

## Why Kura

The audience for docs is changing: more and more traffic comes from AI agents. Traditional
docs tools treat "for agents" as an afterthought; Kura makes it the foundation.

- **Humans** get a fast docs site — sidebar, ToC, search, copy-as-Markdown, MDX components.
- **Agents** get every page as `.md` / `.json`, a `/llms.txt` index, and callable
  `search_docs` / `get_page` tools at `/mcp`.

One source projects to HTML, Markdown, JSON, and MCP with no duplication, so what a human
reads and what an agent calls can never drift apart.

## Packages

| Package | Description |
| --- | --- |
| [`@kurajs/core`](packages/kura) | Portable, zero-dependency vector retrieval engine (f32 brute-force + binary prefilter + rerank). |
| [`@kurajs/docs`](packages/docs) | The docs framework on June: nav, search, MDX, i18n, and the agent (MCP) surface. |
| [`@kurajs/transformers`](packages/kura-transformers) | Local Transformers.js embedder (bge-m3). |
| [`@kurajs/cli`](packages/cli) | `kura index` — build-time search-index + MDX precompiler. |
| [`create-kura`](packages/create-kura) | The scaffolder (`npm create kura`). |

## Examples

- [`examples/docs`](examples/docs) — a docs site with default-language fallback, a language
  switcher, and cross-lingual search (English + a Japanese demo locale).
- [`examples/search`](examples/search) — semantic search over a SQLite corpus, reachable by
  humans (HTML), programs (`.json`), and agents (`/mcp`).

## Development

This is an npm-workspaces monorepo.

```bash
npm install
npm run build --workspaces --if-present   # build the @kurajs/* packages
```

> Note: on some platforms `@huggingface/transformers` pulls `sharp` (image-only, unused for
> text). If `npm install` fails building it, re-run with `npm install --ignore-scripts`.

## Links

- Website & docs: <https://kura.build>
- Built on June: <https://june.build>

## License

[MIT](LICENSE) © Lawrence Lin
