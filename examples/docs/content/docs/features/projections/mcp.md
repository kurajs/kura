---
title: MCP
description: Your docs as an MCP server — agents search and read without scraping.
---

# MCP

Kura exposes your knowledgebase as an [MCP](https://modelcontextprotocol.io) server at
`/mcp`. Agents can search the index and fetch any page's Markdown through typed tools —
no HTML scraping, no guessing at structure.

A `/llms.txt` file points agents at the canonical page list, so a model can discover the
whole site in one request.
