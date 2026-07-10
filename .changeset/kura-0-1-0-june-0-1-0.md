---
"@kurajs/core": minor
"@kurajs/search": minor
"@kurajs/tokenizers": minor
"@kurajs/ctrlk": minor
"@kurajs/transformers": minor
"@kurajs/docs": minor
"@kurajs/cli": minor
---

Kura 0.1.0 — adopt the June 0.1.0 line

June released `@junejs/core` and `@junejs/server` 0.1.0 (the `@junejs/cli` orchestrator stays 0.0.51 but now depends on `>=0.1.0`, so the whole runtime resolves to the 0.1.0 line). `@kurajs/docs` now peers `@junejs/core` at `>=0.1.0 <0.2.0` (was `<0.1.0`) — a required, consumer-visible move, since a project on June 0.0.x must upgrade. June 0.1.0 is additive at Kura's import surface (every subpath Kura uses — `route`, `config`, `agent`, `i18n`, `outlet`, `islands-client` — still exists), and the full suite is green on it: all package builds, 302 tests, `examples/docs` build, and a running dev server serving HTML / `.md` / i18n / `/search` / `/mcp`. The whole `@kurajs/*` set moves to 0.1.0 together so the Kura version line tracks June's.
