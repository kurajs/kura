# @kurajs/cli

## 0.0.27

### Patch Changes

- [#61](https://github.com/kurajs/kura/pull/61) [`e2dbc15`](https://github.com/kurajs/kura/commit/e2dbc15c1ed9641998575a5850df871ad44e6ae6) Thanks [@linyiru](https://github.com/linyiru)! - `kura index` freezes app/\_links.ts — the LinkData behind the 3-tier link resolver: per-doc repo-relative source paths (default tree + locale mirrors; KURA_REPO_ROOT/KURA_SOURCE_MAP for copied-tree builds), the detected repo URL (config `repo` > GITHUB_REPOSITORY > the GitHub origin remote, read at the repo root) with the exact CI sha as the ref, and a corpus-filtered git-tracked oracle (only targets authored links reach). The generated \_kura.ts passes `links` into createDocs, and every `kura index` prints a one-line status (repo, coverage X/Y, target count). Requires @kurajs/docs >=0.0.48 (the ./links subpath).

- Updated dependencies [[`27b1e0a`](https://github.com/kurajs/kura/commit/27b1e0a9e449579355712b3514e995154969e465)]:
  - @kurajs/docs@0.0.49

## 0.0.26

### Patch Changes

- [#48](https://github.com/kurajs/kura/pull/48) [`3453c25`](https://github.com/kurajs/kura/commit/3453c251e01437220b7916502d9ee13bfa16856f) Thanks [@linyiru](https://github.com/linyiru)! - Native `kura.toml` support. A project can now commit ONLY `kura.toml` (+ its `docs/`): the CLI parses it with `smol-toml` (works under node or bun), unifies both config formats through one `loadCliConfig()`, materializes the config to `.june/kura.gen.ts` for the generated shims (normalized via `fromKuraToml()`), and fills in the boilerplate `create-kura` would scaffold — `app/global.css`, `tsconfig.json`, a landing page, and the `./docs` mount. `kura.config.ts` projects are unchanged. Requires `@kurajs/docs >=0.0.41`.

- Updated dependencies [[`3453c25`](https://github.com/kurajs/kura/commit/3453c251e01437220b7916502d9ee13bfa16856f)]:
  - @kurajs/docs@0.0.41

## 0.0.25

### Patch Changes

- [#41](https://github.com/kurajs/kura/pull/41) [`dee9573`](https://github.com/kurajs/kura/commit/dee957382c649b48fdbab7f120ae546a0290c49b) Thanks [@linyiru](https://github.com/linyiru)! - Fix: `deploy.basePath` (the GitHub Pages project subpath) no longer moves the docs route.

  The CLI reads `kura.config.ts` as text to place the docs catch-all route from the
  docs-mount `basePath`. With `deploy: { target: "github-pages", basePath: "/proj" }`
  and no top-level `basePath`, that reader mistook the deploy subpath for the docs mount
  and generated the route at `/proj/[[...slug]]` — so `docRoute.staticPaths` (which uses
  the real docs-mount `basePath`) pointed elsewhere and every prerendered page 404'd. The
  reader now strips the `deploy` block before matching `basePath`.

## 0.0.24

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

- Updated dependencies [[`fb3f5a6`](https://github.com/kurajs/kura/commit/fb3f5a650ad954954ffee98a1d2cb81d9048e740)]:
  - @kurajs/docs@0.0.38

## 0.0.23

### Patch Changes

- [#37](https://github.com/kurajs/kura/pull/37) [`886671a`](https://github.com/kurajs/kura/commit/886671ac088612eecab7d9b7894755a369ec1059) Thanks [@linyiru](https://github.com/linyiru)! - Locale dirs are DECLARED, not guessed — `content/docs/cli/` is a section, not a locale

  `kura index`'s walks (meta.json nav, lastUpdated dates, locale discovery) detected locale
  mirrors by folder shape (a BCP-47-ish regex), so ANY 2–3-letter top-level folder — `cli/`,
  `sdk/`, `api/`, `faq/`, `dev/` … — was silently treated as a locale and dropped.

  The locale set now comes from kura.config.ts `i18n` (defaultLocale + `locales` keys), parsed
  as text like every other setting. No `i18n` config ⇒ nothing is a locale. The declared set
  joins the content hash, so changing it forces a rebuild.

  Pair with @junejs/server ≥ 0.0.53 — June's `june gen` applies the same declared-only rule to
  the entries themselves (older June still drops such folders from `app/_content.ts`).

## 0.0.22

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

- Updated dependencies [[`7027dbc`](https://github.com/kurajs/kura/commit/7027dbcd2c3aa0d374b7d832256438224ec5ffc7), [`8aa27f3`](https://github.com/kurajs/kura/commit/8aa27f3be09e107c329ff8e60350cb2b20028075)]:
  - @kurajs/docs@0.0.37

## 0.0.21

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

- Updated dependencies [[`2cdaa76`](https://github.com/kurajs/kura/commit/2cdaa762d65ebee030977d17dc4cf3d6efdef308)]:
  - @kurajs/docs@0.0.35

## 0.0.20

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

- Updated dependencies [[`2cfd435`](https://github.com/kurajs/kura/commit/2cfd4351ef8316f03ebbfcf7c3b60f95e5eb5c1f)]:
  - @kurajs/docs@0.0.34

## 0.0.19

### Patch Changes

- [#20](https://github.com/kurajs/kura/pull/20) [`7843732`](https://github.com/kurajs/kura/commit/7843732def49f6b814912be3d19acd881e99eb9f) Thanks [@linyiru](https://github.com/linyiru)! - Add an optional "Last updated on" date per doc page

  Opt in with `lastUpdated: true` in `kura.config.ts` (**default off**). `kura index` then captures each
  doc's last git commit date and freezes it to `app/_dates.ts`; `DocBody` renders a localized
  `Last updated on <date>` line (a frontmatter `lastUpdated:` overrides the git date per page). The date
  is formatted with `Intl.DateTimeFormat` pinned to UTC, so it's stable across build/viewer timezones.

  Notes: the build must run inside a git repo with history — in CI set the checkout to `fetch-depth: 0`
  (a shallow clone has no dates, so the line is simply omitted; it never fails the build). `app/_dates.ts`
  is always generated (empty `{}` when off) so the wiring imports it unconditionally.

- Updated dependencies [[`7843732`](https://github.com/kurajs/kura/commit/7843732def49f6b814912be3d19acd881e99eb9f)]:
  - @kurajs/docs@0.0.32

## 0.0.18

### Patch Changes

- [#18](https://github.com/kurajs/kura/pull/18) [`8db26da`](https://github.com/kurajs/kura/commit/8db26da29b912db91d16a799ea324b239926c7c2) Thanks [@linyiru](https://github.com/linyiru)! - Fix `kura build --no-embed` on a semantic-search app

  `--no-embed` deleted `app/_index.ts`, but a semantic-search app's `kura.config.ts` still
  `import { INDEX_B64 } from "./app/_index"` — so the build failed with `Cannot find module './app/_index'`.
  `--no-embed` now writes an empty stub (`INDEX_B64 = ""`) instead of deleting, the config decodes `""`
  to `undefined` (no index), and the search treats empty index bytes as no-index — running keyword-only,
  or building the index lazily at runtime if an embedder is configured.

- Updated dependencies [[`8db26da`](https://github.com/kurajs/kura/commit/8db26da29b912db91d16a799ea324b239926c7c2)]:
  - @kurajs/docs@0.0.31

## 0.0.17

### Patch Changes

- [#14](https://github.com/kurajs/kura/pull/14) [`fb697ce`](https://github.com/kurajs/kura/commit/fb697cebc76b4f7db5774b42a39c265b1d90013c) Thanks [@linyiru](https://github.com/linyiru)! - Add a CommonMark content mode and a strict build flag for MDX

  - `markdown: "commonmark"` (kura.config.ts) or `kura build --commonmark` renders content as plain CommonMark — no MDX/JSX parsing, so a literal `{…}` is text rather than an MDX expression that silently drops the whole page (a literal `<tag>` is still raw HTML — escape it). Opt in for prose-only docs that don't use the curated components.
  - `kura build --strict` fails the build when any page falls back from MDX to plain markdown, so CI catches the silent drop instead of the author discovering it in production.

- Updated dependencies [[`fb697ce`](https://github.com/kurajs/kura/commit/fb697cebc76b4f7db5774b42a39c265b1d90013c)]:
  - @kurajs/docs@0.0.30
