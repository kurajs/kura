# @kurajs/docs

## 0.0.32

### Patch Changes

- [#20](https://github.com/kurajs/kura/pull/20) [`7843732`](https://github.com/kurajs/kura/commit/7843732def49f6b814912be3d19acd881e99eb9f) Thanks [@linyiru](https://github.com/linyiru)! - Add an optional "Last updated on" date per doc page

  Opt in with `lastUpdated: true` in `kura.config.ts` (**default off**). `kura index` then captures each
  doc's last git commit date and freezes it to `app/_dates.ts`; `DocBody` renders a localized
  `Last updated on <date>` line (a frontmatter `lastUpdated:` overrides the git date per page). The date
  is formatted with `Intl.DateTimeFormat` pinned to UTC, so it's stable across build/viewer timezones.

  Notes: the build must run inside a git repo with history — in CI set the checkout to `fetch-depth: 0`
  (a shallow clone has no dates, so the line is simply omitted; it never fails the build). `app/_dates.ts`
  is always generated (empty `{}` when off) so the wiring imports it unconditionally.

## 0.0.31

### Patch Changes

- [#18](https://github.com/kurajs/kura/pull/18) [`8db26da`](https://github.com/kurajs/kura/commit/8db26da29b912db91d16a799ea324b239926c7c2) Thanks [@linyiru](https://github.com/linyiru)! - Fix `kura build --no-embed` on a semantic-search app

  `--no-embed` deleted `app/_index.ts`, but a semantic-search app's `kura.config.ts` still
  `import { INDEX_B64 } from "./app/_index"` — so the build failed with `Cannot find module './app/_index'`.
  `--no-embed` now writes an empty stub (`INDEX_B64 = ""`) instead of deleting, the config decodes `""`
  to `undefined` (no index), and the search treats empty index bytes as no-index — running keyword-only,
  or building the index lazily at runtime if an embedder is configured.

## 0.0.30

### Patch Changes

- [#14](https://github.com/kurajs/kura/pull/14) [`fb697ce`](https://github.com/kurajs/kura/commit/fb697cebc76b4f7db5774b42a39c265b1d90013c) Thanks [@linyiru](https://github.com/linyiru)! - Add a CommonMark content mode and a strict build flag for MDX

  - `markdown: "commonmark"` (kura.config.ts) or `kura build --commonmark` renders content as plain CommonMark — no MDX/JSX parsing, so a literal `{…}` is text rather than an MDX expression that silently drops the whole page (a literal `<tag>` is still raw HTML — escape it). Opt in for prose-only docs that don't use the curated components.
  - `kura build --strict` fails the build when any page falls back from MDX to plain markdown, so CI catches the silent drop instead of the author discovering it in production.
