# Kura example: search

The first example app on the Kura stack — a real **June** website that does
**Traditional-Chinese semantic search** over a folder of Markdown, using
[`@kurajs/core`](../../packages/kura) + [`@kurajs/transformers`](../../packages/kura-transformers)
(local bge-m3, no cloud).

```sh
npm run dev      # june dev → http://localhost:3000  (host: bun)
```

Put `.md` files in `content/`. The home route (`app/page.tsx`):

- **Humans:** `GET /?q=...` → server-rendered result cards (zero client JS).
- **Agents:** `GET /.json?q=...` → the same results as JSON; `/.md`, `/llms.txt` too.
- One `loader` builds the KB once per process (lazy) and runs `kb.searchText(q)`.

It's the same query, one source, four surfaces — June's dual-audience model with Kura
retrieval underneath.

### Agent tool (MCP)

`app/actions.ts` defines `search_docs` via `defineAction` (imported for its side effect
in `app/page.tsx`), so agents can *call* search, not just read it:

```sh
curl -s -X POST http://localhost:3000/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_docs","arguments":{"query":"梵語文法","topK":3}}}'
```

Same KB, same embedder, same SQLite source as the HTML/JSON route — one `defineAction`,
one auth gate.

### Data

`kura.db` is a real SQLite database (1,000 DRCD Taiwan-Wikipedia paragraphs + bge-m3
embeddings). Rebuild it with `prototypes/vector-bench/build-drcd-db.mjs`. Inspect with
`sqlite3 kura.db`.
