---
title: AI エージェント向け
description: あなたのドキュメントは、そのままで MCP サーバーになります。
section: Concepts
order: 3
---

# AI エージェント向け

Kura で構築したナレッジベースは、そのままでエージェントが使えるインターフェースになります。

## MCP ツール

すべての `defineAction()` は UI アクションであると同時に MCP ツールでもあり、一つの認可ゲートの
背後にあります。エージェントはこう呼び出せます:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"search_docs","arguments":{"query":"セマンティック検索","topK":3}}}'
```

## llms.txt

`/llms.txt` は自動生成され、すべてのページとツールをインデックス化します。`/llms-full.txt` は
すべてのページの Markdown を一つのコーパスに連結し、エージェントが一度に読めるようにします。

## 二人の読み手

同じルートが人間と機械の両方に応えます: `GET /docs/agents`（HTML）、`GET /docs/agents.md`（ソース）、
`POST /mcp`（呼び出し）。これが「humans and agents」の具体的な形です。
