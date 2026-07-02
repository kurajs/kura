---
"@kurajs/search": patch
"@kurajs/docs": patch
---

Better keyword typeahead — prefix matching + navigation boost.

- **Prefix (`@kurajs/search`)**: `Bm25.search` gains `prefixLast` (+ `minPrefix`/`maxExpand` guards) — the last query token matches every indexed term starting with it, so a partially-typed word ("feis") finds the full term ("feishu"). BM25 matched whole tokens only, so non-English proper nouns returned nothing until fully typed. Earlier tokens stay exact.
- **Nav boost (`@kurajs/docs`)**: a SINGLE-word query whose prefix names a page/section (title/slug tier > heading tier) lifts it above docs that merely mention the term — turning search into fast go-to-page navigation. Gated to single-word queries, so multi-word content search is unchanged (benchmarked: navigation S@1 28%→70%, content queries byte-identical).

Exposed via `SearchOptions.prefix` / `navBoost`; enabled for static client-side search (which also drops its debounce 120→30 ms, since each keystroke is an in-memory query). Hybrid/submit search is unaffected (exact terms).
