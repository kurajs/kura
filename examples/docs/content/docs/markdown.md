---
title: Markdown & projections
description: One source, four projections — HTML, Markdown, JSON, MCP.
section: Concepts
order: 2
---

# Markdown & projections

Every Kura page grows multiple "projections" from one Markdown source, each for a different
reader.

## One source, four projections

| Projection | For whom | How to get it |
| --- | --- | --- |
| HTML | Humans | Just browse this page |
| Markdown | People / agents | Append `.md` to the URL |
| JSON | Programs | Append `.json` to the URL |
| MCP tool | AI agents | `POST /mcp` |

## Copy as Markdown

A "Copy Markdown" button in the top-right of every page copies its raw Markdown to the
clipboard — exactly the format you want to paste into ChatGPT, Claude, or Cursor. You can
also "View as Markdown" directly.

> Because every projection comes from the same source, what a human sees and what an agent
> gets are always consistent — never out of sync.
