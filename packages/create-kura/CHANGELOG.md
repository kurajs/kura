# create-kura

## 0.0.14

### Patch Changes

- [#22](https://github.com/kurajs/kura/pull/22) [`5a5675e`](https://github.com/kurajs/kura/commit/5a5675ec41c2fdfa5621e43802656420806458a4) Thanks [@linyiru](https://github.com/linyiru)! - Ignore the generated `app/_dates.ts` in scaffolded apps

  `kura index` always writes `app/_dates.ts` (the last-updated map, empty when the feature is off), but the
  scaffold's `.gitignore` didn't list it, so it showed up as an untracked file after every build. Added it
  alongside the other generated `app/_*` artifacts.
