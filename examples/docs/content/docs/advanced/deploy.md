---
title: Deploy
description: Ship a Kura site to Cloudflare Workers — filesystem-free at runtime.
---

# Deploy

`kura build` freezes your content, search index, and precompiled MDX into importable
modules, so the worker bundle never reads the filesystem at request time.

```bash
kura deploy --prod
```

On Cloudflare, swap the local embedder for `workersAI()` and build with the frozen
index — the running site stays database-free and starts cold in milliseconds.
