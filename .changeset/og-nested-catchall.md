---
"@kurajs/docs": patch
"@kurajs/cli": patch
---

Fix OG images for nested doc pages, the home card, and emit canonical links

The OG route was generated as single-segment `og/[slug]`, so `/og/sdk.png` worked but the nested URLs
that doc meta tags actually emit — `/og/getting-started/sdk.png` — 404'd (most real docs are nested).
The home page emitted a broken `/og/.png`, and no `<link rel="canonical">` was output at all.

- The CLI now generates the OG route as a catch-all `og/[[...slug]]/route.ts`, and the handler reads
  the joined slug via `normalizeOgSlug` (e.g. `"getting-started/sdk.png"` → `"getting-started/sdk"`).
  June delivers a `[[...slug]]` param joined by `/`, so nested OG URLs resolve. The stale single-segment
  `og/[slug]` from a prior version is removed on `kura dev`/`build`.
- The home page's OG URL is now `/og/index.png` (a sentinel the handler maps back to the root doc),
  never `/og/.png`.
- `metadata` now emits `canonical` (June renders `<link rel="canonical">`) — `siteUrl` + the page's
  `basePath`-aware path, trailing slash trimmed. Requires `siteUrl` to be set, like `og:image`.

The OG URL/slug and canonical logic is extracted to pure helpers in `nav.ts` (`ogImageUrl`,
`normalizeOgSlug`, `canonicalUrl`) and unit-tested, including the contract that the meta URL
round-trips back to the doc slug through the route handler.
