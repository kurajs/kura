---
title: For AI agents
description: Your docs are an MCP server out of the box.
section: Concepts
order: 3
---

# For AI agents

A knowledgebase built with Kura is, out of the box, an interface an agent can use.

## MCP tools

Every `defineAction()` is both a UI action and an MCP tool, behind a single auth gate. An
agent can call:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"search_docs","arguments":{"query":"semantic search","topK":3}}}'
```

## llms.txt

`/llms.txt` is generated automatically, indexing every page and tool; `/llms-full.txt`
concatenates every page's Markdown into one corpus the agent can read in a single pass.

## Two readers

The same route serves humans and machines: `GET /docs/agents` (HTML), `GET /docs/agents.md`
(source), `POST /mcp` (call). That is "humans and agents" made concrete.
