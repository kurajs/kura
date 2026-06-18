---
title: Lexical fallback
description: Keyword search that runs anywhere, with no model or index required.
---

# Lexical fallback

Not every deploy has an embedder. Build with `--no-embed` and Kura skips the vector
index entirely; search degrades to a lexical scan over titles and bodies.

It is less clever than semantic ranking, but it has zero runtime dependencies and
works on any platform — a sensible floor for small sites.
