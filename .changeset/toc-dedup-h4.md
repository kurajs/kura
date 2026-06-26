---
"@kurajs/docs": patch
---

TOC: include h4 and de-duplicate repeated heading anchors

`processHtml` now injects ids into and lists `h4` headings (previously only h2/h3), and de-duplicates
repeated heading slugs github-slugger style — the first use keeps the bare slug, later ones get `-1`,
`-2`, …. Before this, two headings with the same text produced the same `id`, so in-page anchor links
and scroll-spy collided on the first one. A heading that slugifies to empty (emoji/punctuation only)
now falls back to `section` instead of `id=""`. The right-hand TOC indents h4 one level deeper than h3.

The id logic is extracted into a shared `createSlugger()` used by both the renderer (`processHtml`) and
the search indexer (`splitByHeadings`), which now also splits on h4 — so search deep-links resolve to
the exact rendered anchor, including for repeated headings and h4 sections.
