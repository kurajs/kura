# @kurajs/docs

## 0.0.45

### Patch Changes

- [#55](https://github.com/kurajs/kura/pull/55) [`bed43b5`](https://github.com/kurajs/kura/commit/bed43b569d10f3abcb7e8e6989114f5e776a43f9) Thanks [@linyiru](https://github.com/linyiru)! - Fix footer deploy-root links. The `llms.txt` link was hardcoded `/llms.txt`, so on a site deployed under a subpath (e.g. GitHub Pages `/openab`) it 404'd instead of resolving to `/openab/llms.txt` — llms.txt lives at the deploy root, not under the docs basePath or a locale, so it now gets the deploy prefix. The `MCP` link (a server route that a static build never emits) is now hidden on static targets instead of pointing at a dead `/mcp`.

## 0.0.44

### Patch Changes

- [#53](https://github.com/kurajs/kura/pull/53) [`047db53`](https://github.com/kurajs/kura/commit/047db53c3ffa2ce6e60bbea819d51137bb0459ed) Thanks [@linyiru](https://github.com/linyiru)! - Rich HTML search previews. Previews showed raw markdown (`|table|`, code fences, `**bold**`) — now the search index is built from the rendered HTML: clean text for BM25 (`htmlToText`) and each section's HTML for a formatted preview (tables, code, lists, links render instead of markdown syntax). The static corpus ships HTML only (client derives index text with a cheap regex, no parser; ~360 KB gz, +6%), per-query payload unchanged. `@kurajs/ctrlk` items gain `excerptHtml` (rendered via innerHTML after a DOM-based sanitize that drops scripts, event handlers, and `javascript:` URLs). Relevance is unchanged.

- Updated dependencies [[`047db53`](https://github.com/kurajs/kura/commit/047db53c3ffa2ce6e60bbea819d51137bb0459ed)]:
  - @kurajs/ctrlk@0.0.3

## 0.0.43

### Patch Changes

- [#51](https://github.com/kurajs/kura/pull/51) [`918d857`](https://github.com/kurajs/kura/commit/918d85764d4f307253ac7cee96ecd341dfaa421c) Thanks [@linyiru](https://github.com/linyiru)! - Better keyword typeahead — prefix matching + navigation boost.

  - **Prefix (`@kurajs/search`)**: `Bm25.search` gains `prefixLast` (+ `minPrefix`/`maxExpand` guards) — the last query token matches every indexed term starting with it, so a partially-typed word ("feis") finds the full term ("feishu"). BM25 matched whole tokens only, so non-English proper nouns returned nothing until fully typed. Earlier tokens stay exact.
  - **Nav boost (`@kurajs/docs`)**: a SINGLE-word query whose prefix names a page/section (title/slug tier > heading tier) lifts it above docs that merely mention the term — turning search into fast go-to-page navigation. Gated to single-word queries, so multi-word content search is unchanged (benchmarked: navigation S@1 28%→70%, content queries byte-identical).

  Exposed via `SearchOptions.prefix` / `navBoost`; enabled for static client-side search (which also drops its debounce 120→30 ms, since each keystroke is an in-memory query). Hybrid/submit search is unaffected (exact terms).

- Updated dependencies [[`918d857`](https://github.com/kurajs/kura/commit/918d85764d4f307253ac7cee96ecd341dfaa421c)]:
  - @kurajs/search@0.0.2

## 0.0.42

### Patch Changes

- [#49](https://github.com/kurajs/kura/pull/49) [`41de369`](https://github.com/kurajs/kura/commit/41de3698d6fb85e40f5c638a9833097d841c69a4) Thanks [@linyiru](https://github.com/linyiru)! - Client-side BM25 search on static builds. On a static/github-pages target there's no server to answer `/search.json?q=…`, so search was non-functional on SSG. The search route now ships the doc corpus in `/search.json`, and the ⌘K palette builds the pure-JS `Bm25` index in-browser and queries it locally — no server, no model, with term highlighting and heading-anchored deep links. The engine is a dynamic import (a lazy ~4 KB-gzipped chunk loaded on first search), so server targets that query per request never bundle it.

## 0.0.41

### Patch Changes

- [#48](https://github.com/kurajs/kura/pull/48) [`3453c25`](https://github.com/kurajs/kura/commit/3453c251e01437220b7916502d9ee13bfa16856f) Thanks [@linyiru](https://github.com/linyiru)! - Add `fromKuraToml()` — normalize a parsed `kura.toml` into a `KuraConfig`. This lets a project be configured with a declarative `kura.toml` (idiomatic for non-JS repos) instead of `kura.config.ts`. Renames the snake_case keys, defaults the `<title>` template to `"{page} - {site name}"`, and default-mounts the repo's `./docs` at the site root when no `[[content.sources]]` are declared.

## 0.0.40

### Patch Changes

- [`c25b8d8`](https://github.com/kurajs/kura/commit/c25b8d84c69b7d7fb1b124eeaa2d8c5499813b97) Thanks [@linyiru](https://github.com/linyiru)! - Virtual navigation (`config.nav`): group FLAT doc slugs into on-screen tabs + sidebar groups
  purely by config — no folders, no slug prefixes, files never moved.

  Declare `nav.tabs` (the tab bar) and `nav.groups` (each an ordered list of doc slugs); a page is
  a bare slug (label = its H1) or `{ slug, title }` for a shorter sidebar label. A group with no
  `pages` auto-fills from the docs subfolder of the same name. URLs stay flat (`/discord`), so
  repo-relative `.md` cross-links resolve by exact slug — no basename ambiguity from grouping. Title
  overrides flow to the sidebar, pager, and page `<title>` from one source (no front-matter injected).

## 0.0.39

### Patch Changes

- [`9f24a5c`](https://github.com/kurajs/kura/commit/9f24a5cd2113a37c965b00b9a8c8e8fa0c190cf0) Thanks [@linyiru](https://github.com/linyiru)! - Rewrite in-content Markdown cross-links to the target doc's real URL.

  Authors write repo-relative `[x](other.md)` links between docs; previously these rendered
  verbatim and resolved against the current page URL (→ 404). Now each `.md` link is matched to
  a doc (by slug, else basename) and rewritten to that doc's URL — carrying the docs mount, locale
  prefix, and deploy subpath, with any `#anchor` preserved. External / non-`.md` / unresolved links
  are left untouched.

## 0.0.38

### Patch Changes

- [#39](https://github.com/kurajs/kura/pull/39) [`fb3f5a6`](https://github.com/kurajs/kura/commit/fb3f5a650ad954954ffee98a1d2cb81d9048e740) Thanks [@linyiru](https://github.com/linyiru)! - Add a GitHub Pages (static) deploy target.

  Set `deploy: { target: "github-pages", basePath: "/<project>" }` in `kura.config.ts`
  to build a fully prerendered static site into `dist/static/` — no server, deployable
  to GitHub Pages or any file host.

  - Maps to June's built-in static target; the deploy subpath becomes June's `basePath`
    so assets + links resolve under a project subpath.
  - `docRoute.staticPaths` enumerates every doc page (× locale) so the dynamic docs
    route prerenders to one HTML file each; sidebar/pager/tab/search links carry the
    deploy subpath.
  - On a static target the dynamic OG image route is omitted and `og:image` is dropped
    (no server to render it). Requires `@junejs/core` ≥ 0.0.49 / `@junejs/server` ≥ 0.0.54.

## 0.0.37

### Patch Changes

- [#33](https://github.com/kurajs/kura/pull/33) [`7027dbc`](https://github.com/kurajs/kura/commit/7027dbcd2c3aa0d374b7d832256438224ec5ffc7) Thanks [@linyiru](https://github.com/linyiru)! - Docs-as-code: `content.sources` in kura.config.ts

  Docs no longer have to live under `content/docs/`. Point Kura at the repo's existing
  directories — `docs/`, `schema/`, `examples/` — and they feed the site directly, no copy and
  no sync step:

  ```ts
  export default defineKura({
    content: {
      sources: [
        { dir: "../docs" }, // merges into the docs collection
        { dir: "../schema", mount: "schema" }, // pages at /docs/schema/…
      ],
    },
  });
  ```

  - Sources are forwarded to June's `content.sources` (requires @junejs/server ≥0.0.51 /
    @junejs/cli ≥0.0.50 — dependency ranges bumped), which merges their entries into
    `app/_content.ts` at `june gen`, with the same `<dir>/<locale>/` mirror layout per source.
  - `kura index` extends its own walks over the same trees: meta.json nav (mounted keys
    prefixed; the root meta's tabs may reference a mount), lastUpdated git dates
    (mount-prefixed slugs; a source's README dates the mount page), and locale discovery
    (a translated external docs/ lights up its locale in the search index + MDX buckets).
  - Sources participate in the content hash, so changing them forces a rebuild.
  - Keep `sources` a flat array/object literal — `kura index` reads the config as text (it
    never executes user config).

- [#32](https://github.com/kurajs/kura/pull/32) [`8aa27f3`](https://github.com/kurajs/kura/commit/8aa27f3be09e107c329ff8e60350cb2b20028075) Thanks [@linyiru](https://github.com/linyiru)! - Highlight `hcl` fences, and make the shiki language list extensible via `highlight.langs`

  `hcl` (Terraform / HashiCorp config) is now in the curated syntax-highlighting set, so those
  fences get real dual-theme highlighting instead of falling back to plain text.

  Projects can also extend the set from `kura.config.ts`:

  ```ts
  export default defineConfig({
    highlight: { langs: ["hcl", "dockerfile", "kotlin"] }, // any shiki-bundled grammar name
  });
  ```

  `kura index` reads `highlight.langs` as text (config is never executed at build), merges it onto the
  curated base list, and loads the extra grammars lazily via shiki's `loadLanguage`. A langs change
  participates in the content hash, so switching it forces a rebuild. An unknown grammar name makes the
  build fail loudly.

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
