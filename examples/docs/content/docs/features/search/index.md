---
title: Search
description: How Kura search works — semantic vectors with a lexical fallback.
---

# Search

Search is built in. At build time Kura embeds every page into a compact vector index
and freezes it next to your content, so the running site never touches a database.

- **[Semantic search](/docs/features/search/semantic)** — meaning-based ranking over
  the frozen index.
- **[Lexical fallback](/docs/features/search/lexical)** — keyword scan for deploys with
  no embedder.
