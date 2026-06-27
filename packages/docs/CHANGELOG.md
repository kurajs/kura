# @kurajs/docs

## 0.0.36

### Patch Changes

- [#28](https://github.com/kurajs/kura/pull/28) [`f251e41`](https://github.com/kurajs/kura/commit/f251e4192937cb9780da85e538bf83c3a651ca1b) Thanks [@linyiru](https://github.com/linyiru)! - Bump @momiji-rs/sparkdown to ^0.0.6

  Picks up sparkdown's wasm input-decode perf work (str::from_utf8 fast-path, TextEncoder.encodeInto
  straight into wasm memory) on the shared entry the CommonMark (`markdown: "commonmark"` / `--commonmark`)
  render path uses. v0.0.6's headline `/mdast` subpath is not used by Kura. Verified the `/gfm` `toHtmlSync`
  HTML output is byte-for-byte identical to 0.0.4 across a headings/lists/tasklists/tables/code-fence/
  autolink/escaping corpus, so rendered docs are unchanged.

- [#29](https://github.com/kurajs/kura/pull/29) [`caecbcf`](https://github.com/kurajs/kura/commit/caecbcf1ccb0a39357478e24c0cf55398858fc72) Thanks [@linyiru](https://github.com/linyiru)! - TOC: include h4 and de-duplicate repeated heading anchors

  `processHtml` now injects ids into and lists `h4` headings (previously only h2/h3), and de-duplicates
  repeated heading slugs github-slugger style — the first use keeps the bare slug, later ones get `-1`,
  `-2`, …. Before this, two headings with the same text produced the same `id`, so in-page anchor links
  and scroll-spy collided on the first one. A heading that slugifies to empty (emoji/punctuation only)
  now falls back to `section` instead of `id=""`. The right-hand TOC indents h4 one level deeper than h3.

  The id logic is extracted into a shared `createSlugger()` used by both the renderer (`processHtml`) and
  the search indexer (`splitByHeadings`), which now also splits on h4 — so search deep-links resolve to
  the exact rendered anchor, including for repeated headings and h4 sections.

## 0.0.35

### Patch Changes

- [#26](https://github.com/kurajs/kura/pull/26) [`2cdaa76`](https://github.com/kurajs/kura/commit/2cdaa762d65ebee030977d17dc4cf3d6efdef308) Thanks [@linyiru](https://github.com/linyiru)! - Fix OG images for nested doc pages, the home card, and emit canonical links

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

## 0.0.34

### Patch Changes

- [#24](https://github.com/kurajs/kura/pull/24) [`2cfd435`](https://github.com/kurajs/kura/commit/2cfd4351ef8316f03ebbfcf7c3b60f95e5eb5c1f) Thanks [@linyiru](https://github.com/linyiru)! - Honor `basePath` when generating the docs route, not just the links

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

## 0.0.33

### Patch Changes

- [#22](https://github.com/kurajs/kura/pull/22) [`6950cea`](https://github.com/kurajs/kura/commit/6950cea8c0fb65fa53b1e8f3b5cb65d39c909bf3) Thanks [@linyiru](https://github.com/linyiru)! - Render `--commonmark` mode with sparkdown-gfm (wasm) + shiki

  CommonMark mode (`markdown: "commonmark"` / `kura build --commonmark`) now renders via the
  `@momiji-rs/sparkdown/gfm` WebAssembly parser instead of `@mdx-js` `format:"md"`, then highlights code
  blocks with the same shiki highlighter the MDX path uses — so both modes get identical build-time,
  dual-theme highlighting. CommonMark-strict by construction: a literal `{…}` stays text (no MDX
  expression footgun, and zero compile failures → no silent page drops), GFM (tables/strikethrough/
  task-lists/autolinks) renders, headings stay bare (Kura's anchor post-processor depends on this), and
  an unknown code language falls back to plain text instead of throwing. MDX mode is unchanged.

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
