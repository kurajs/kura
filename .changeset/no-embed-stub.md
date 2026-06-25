---
"@kurajs/cli": patch
"@kurajs/docs": patch
---

Fix `kura build --no-embed` on a semantic-search app

`--no-embed` deleted `app/_index.ts`, but a semantic-search app's `kura.config.ts` still
`import { INDEX_B64 } from "./app/_index"` — so the build failed with `Cannot find module './app/_index'`.
`--no-embed` now writes an empty stub (`INDEX_B64 = ""`) instead of deleting, the config decodes `""`
to `undefined` (no index), and the search treats empty index bytes as no-index — running keyword-only,
or building the index lazily at runtime if an embedder is configured.
