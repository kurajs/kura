---
title: Introduction
description: What Kura is, and why it is built for humans and AI agents alike.
section: Get started
order: 1
---

# Introduction

**Kura is the knowledgebase for humans and agents**, built on
[June](https://june.build). One source of content: humans read a polished website, while
AI agents query and call it in a structured, machine-readable way — single source, never
out of sync.

## Why Kura

The audience for docs is changing: more and more traffic comes from AI agents. Traditional
docs tools treat "for agents" as a bolt-on; Kura makes it the foundation.

> One source → HTML (for people), Markdown and JSON (for machines), MCP tools (for agents
> to call), with zero duplication.

<Callout type="tip" title="MDX components">
This tip box is written with the MDX `<Callout>` component — people see a styled card,
while the agent-facing `.md` is clean plain text.
</Callout>

## A shared knowledgebase

- **Humans**: sidebar, table of contents, search, copy-as-Markdown browsing.
- **Agents**: every page has a `.md` source, a `/llms.txt` index, and a callable `/mcp`
  search tool.

## Design principles

1. **A zero-dependency retrieval engine** that runs the same code on Node / Bun / Deno /
   Cloudflare Workers.
2. **Multilingual by default**, with bge-m3 as the default embedding model.
3. **Convention over configuration** — what Mintlify makes you bolt on, Kura ships built in.
