---
"@kurajs/cli": patch
"@kurajs/docs": patch
"create-kura": patch
---

Honor `basePath` when generating the docs route, not just the links

`basePath` drove the generated links (sidebar, pager, tabs, search, `.md`) but the CLI hardcoded the
docs route at `.june/routes/docs/[[...slug]]`, so any non-default `basePath` produced links that
pointed nowhere. Setting `basePath: ""` made every sidebar link resolve to `/getting-started` while
the page still lived at `/docs/getting-started` — a 404 on every internal link.

`kura dev`/`build` now read `basePath` from `kura.config.ts` (as text — your config is never executed)
and emit the catch-all route at the matching subtree: `""` → `.june/routes/[[...slug]]` (site root),
`"/docs"` → `.june/routes/docs/[[...slug]]` (unchanged default), `"/guide"` →
`.june/routes/guide/[[...slug]]`, nested prefixes too. A docs route left behind by a previous
`basePath` is pruned so the old URLs stop resolving. June ties URLs to disk layout (it has no
route-prefix config), so this is the level the fix belongs at. The misleading "affects links only"
note in the `basePath` doc and the scaffold's `kura.config.ts` comment are corrected.
