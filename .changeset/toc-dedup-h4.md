---
"@kurajs/docs": patch
---

TOC: include h4 and de-duplicate repeated heading anchors

`processHtml` now injects ids into and lists `h4` headings (previously only h2/h3), and de-duplicates
repeated heading slugs github-slugger style — the first use keeps the bare slug, later ones get `-1`,
`-2`, …. Before this, two headings with the same text produced the same `id`, so in-page anchor links
and scroll-spy collided on the first one. The right-hand TOC indents h4 one level deeper than h3.
