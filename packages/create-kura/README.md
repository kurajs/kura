# create-kura

**Kura — the knowledgebase for humans and agents.**

Scaffold a [Kura](https://kura.build) docs site:

```sh
npm create kura my-docs
cd my-docs
npm install
npm run gen    # freeze content + build the search index
npm run dev    # http://localhost:3000
```

You get a working docs site built on [June](https://june.build): sidebar, table of
contents, semantic search, copy-as-Markdown — and an agent surface (per-page `.md`,
`/llms.txt`, and a `/mcp` server with `search_docs`/`get_page`) out of the box. One
source, four surfaces, zero drift.

Edit `kura.config.ts` for site/sections/embedder, and drop Markdown into `content/docs/`.

## License

MIT
