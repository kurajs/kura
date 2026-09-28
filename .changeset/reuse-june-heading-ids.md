---
"@kurajs/docs": patch
"@kurajs/cli": patch
---

Reuse June's heading ids instead of recomputing them. June now renders every content heading with a GitHub-compatible `id`, which is the single source of truth. `processHtml` (the right-rail ToC), the keyword index, and the semantic index now all read the `id` already on the heading, so every deep link lands on the anchor that is actually on the page. That matters where Kura's own `slugify` differs from GitHub's; for example, it drops `_`.

- `processHtml` matches headings with attributes, reuses an existing `id`, and keeps a heading's other attributes. It adds an `id` only to a bare heading from an older June, and never reuses one already on the page. A folded "Table of Contents" keeps June's `id` too.
- The semantic index builds its sections from the rendered HTML, like the keyword index, so both carry June's ids. The markdown split stays the fallback for an entry without HTML.
- Search indexes the HTML each page actually renders: the precompiled MDX when there is one, else the entry's own HTML. That covers the server keyword index, the semantic index (`kura index` now precompiles MDX before embedding), and the static-site corpus. The MDX precompile emits bare headings, so an MDX page is anchored by Kura's slug, and its search hits now point at that anchor instead of at a June id the page doesn't carry.

Backward compatible: output from an older June, with bare headings, is anchored exactly as before.
