---
"@kurajs/search": patch
"@kurajs/docs": patch
---

Prefix typeahead for keyword search. BM25 matched whole tokens only, so a partially-typed word ("feis") returned nothing until complete ("feishu") — poor for typeahead, especially non-English proper nouns. `Bm25.search` gains `prefixLast` (with `minPrefix`/`maxExpand` guards): the last query token matches every indexed term starting with it (OR-fused, best expansion per doc), earlier tokens stay exact. Exposed via `SearchOptions.prefix` and enabled for static client-side search (which also drops its debounce 120→30 ms, since each keystroke is an in-memory query with no server to protect). Hybrid/submit search is unchanged (exact terms).
