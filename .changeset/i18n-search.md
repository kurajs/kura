---
"@kurajs/docs": patch
---

Locale-scoped search on every path. Each locale's static search.json now carries its own MERGED corpus (its translations plus untranslated defaults — the same pages the reader browses), the server keyword index is per-locale (memoized, bounded by the declared tags), and the hybrid vector side filters to the locale's view with an over-fetch floor so scoped recall can't collapse. MCP search_docs gains an optional `locale`. Also fixes a latent bug: a CJK-default-locale site's corpus and queries now tokenize by the default locale instead of latin. No-i18n sites are byte-identical (proven by an envelope byte-parity test).
