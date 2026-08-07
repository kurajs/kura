---
"@kurajs/docs": minor
"@kurajs/cli": minor
---

Add an MDX rendering extension point: a user components map that merges over the curated defaults.

Point `mdxComponents` at a module whose default export is a components map (or drop an
`app/mdx-components.ts` — Next.js-style — and it's auto-detected). The CLI merges its exports over
Kura's curated components (Callout, Card, Cards, Steps, Step, Tabs, Tab) for every render, so the
override reaches `kura build`, `kura dev`, and the runtime fallback alike (all read the same frozen
`app/_mdx.ts`). The common case is an `img` override — resolve a CDN URL + `width`/`height` + a blur
placeholder from a manifest at build, so the pixels never need to exist in git.

- Declarative by design: the value is a module **path** (string), so `kura index` keeps reading your
  config as text and never executes it; the module itself is dynamically imported at precompile time.
  Works from `kura.config.ts` (`mdxComponents: "./app/mdx-components.ts"`) or `kura.toml`
  (`mdx_components = "..."`).
- Editing the components module invalidates the content hash, so `kura dev` picks it up on restart.
- **MDX mode only** — `markdown: "commonmark"` has no JSX/component layer, so components are ignored
  there (use a rehype-level transform for HTML rewrites).
- Internally, the `mdxToHtml` cache is now keyed on the components-map identity, so a custom map
  caches correctly across a build instead of bypassing the cache.
