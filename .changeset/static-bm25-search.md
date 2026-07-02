---
"@kurajs/docs": patch
---

Client-side BM25 search on static builds. On a static/github-pages target there's no server to answer `/search.json?q=…`, so search was non-functional on SSG. The search route now ships the doc corpus in `/search.json`, and the ⌘K palette builds the pure-JS `Bm25` index in-browser and queries it locally — no server, no model, with term highlighting and heading-anchored deep links. The engine is a dynamic import (a lazy ~4 KB-gzipped chunk loaded on first search), so server targets that query per request never bundle it.
