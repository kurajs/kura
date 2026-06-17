---
title: Semantic search
description: How Kura's vector retrieval engine works, and why it is both fast and lean.
section: Concepts
order: 1
---

# Semantic search

Kura's retrieval engine is pure JavaScript with zero dependencies — the same code runs on
Node, Bun, Deno, and Cloudflare Workers.

## How it works

At index time, documents are embedded into 1024-dim vectors with the bge-m3 model; at query
time the question is embedded too, compared by similarity, and the most relevant passages
are returned.

```ts
import { Kb } from "@kurajs/core";
import { transformers } from "@kurajs/transformers";

const kb = new Kb({ embedder: transformers() });
await kb.addText([{ id: "intro", text: "..." }]);
const hits = await kb.searchText("How do I get started?", { topK: 5 });
```

## Tiered strategy

- **Small corpora (≤ 10k)**: exact f32 brute force, 100% recall.
- **Large corpora**: a binary prefilter + f32 rerank — 1/32 the memory, with recall still
  near perfect.

## Performance

Query latency is roughly 0.1 ms per 1k vectors; on a real 200k-embedding corpus, binary +
rerank still holds 100% recall.
