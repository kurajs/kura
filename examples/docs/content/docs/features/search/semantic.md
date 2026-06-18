---
title: Semantic search
description: Meaning-based ranking over a frozen vector index — fast, local, no server.
---

# Semantic search

Kura embeds each page with a small multilingual model (bge-m3 by default) and stores
the vectors in a frozen index. A query is embedded once and ranked by cosine
similarity — so "how do I get paid" finds the billing page even if it never uses those
words.

The index ships with your bundle. On Cloudflare Workers you can swap the local
embedder for Workers AI without changing any content.
