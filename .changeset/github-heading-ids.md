---
"@kurajs/docs": patch
---

Anchor every heading with June's GitHub-compatible id, whichever path rendered the page. `slugify` and `createSlugger` are now June's algorithm (github-slugger's: `_` and letters of every script are kept, each space becomes a `-`, a heading that slugs to nothing gets `section`), and a new `headingIds(html)` pass copies June's: every heading h1–h6 gets an id, one de-dup across the whole document, entities decoded before slugging, an existing id kept, an empty `id=""` dropped. `processHtml` and the search indexer both run it, so MDX pages (whose precompiled headings are bare) and pages from an older June now carry the same anchors June gives its own html, and search deep links land on them.

Some anchors change: a heading with `_`, `&`, runs of spaces, or an entity (e.g. `API_KEY vs. api key` was `#apikey-vs-api-key`, now `#api_key-vs-api-key`), a heading whose text repeats the page's h1 (h1 now counts in the de-dup), and h5/h6, which now carry an id. In-page links written against the old anchors need updating.

The algorithm is copied from `@junejs/core/slug` rather than imported, because the stable June 0.1.0 that the peer range still admits doesn't export it.
