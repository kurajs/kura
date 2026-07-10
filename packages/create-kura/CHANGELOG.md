# create-kura

## 0.0.17

### Patch Changes

- [`9ae33a2`](https://github.com/kurajs/kura/commit/9ae33a26e506a710dd82b3dcd5458249937568fa) Thanks [@linyiru](https://github.com/linyiru)! - Scaffold's `.gitignore` now ignores `app/_links.ts` and `app/_assets.ts`

  `kura index` freezes two more generated modules — `app/_links.ts` (the link-resolution data, since `@kurajs/cli` 0.0.27) and `app/_assets.ts` (the content-image manifest, since 0.0.28) — but the scaffolded `.gitignore` still only listed the older `app/_*.ts` artifacts. A project created before this and built with a current CLI ended up committing (or seeing as untracked) two machine-generated files. The template now ignores both, alongside the existing `_content`/`_mdx`/`_meta`/`_dates`/`_islands.gen` entries.

## 0.0.16

### Patch Changes

- [#35](https://github.com/kurajs/kura/pull/35) [`a8d1df2`](https://github.com/kurajs/kura/commit/a8d1df25d30109b0432a1b6e1b2d5ee5e1109fc3) Thanks [@linyiru](https://github.com/linyiru)! - Template tsconfig: drop the redundant `jsxImportSource` override

  `@kurajs/docs/tsconfig.kura.json` (the template's `extends` base) already declares
  `jsxImportSource: "@junejs/core"`; repeating it in the app tsconfig was duplication that
  also tripped rolldown's `CONFIGURATION_FIELD_CONFLICT` warning on `kura build` with June
  < 0.0.52. June ≥ 0.0.52 no longer warns either way — this just removes the drift surface.

## 0.0.15

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

## 0.0.14

### Patch Changes

- [#22](https://github.com/kurajs/kura/pull/22) [`5a5675e`](https://github.com/kurajs/kura/commit/5a5675ec41c2fdfa5621e43802656420806458a4) Thanks [@linyiru](https://github.com/linyiru)! - Ignore the generated `app/_dates.ts` in scaffolded apps

  `kura index` always writes `app/_dates.ts` (the last-updated map, empty when the feature is off), but the
  scaffold's `.gitignore` didn't list it, so it showed up as an untracked file after every build. Added it
  alongside the other generated `app/_*` artifacts.
