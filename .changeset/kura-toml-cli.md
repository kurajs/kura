---
"@kurajs/cli": patch
---

Native `kura.toml` support. A project can now commit ONLY `kura.toml` (+ its `docs/`): the CLI parses it with `smol-toml` (works under node or bun), unifies both config formats through one `loadCliConfig()`, materializes the config to `.june/kura.gen.ts` for the generated shims (normalized via `fromKuraToml()`), and fills in the boilerplate `create-kura` would scaffold — `app/global.css`, `tsconfig.json`, a landing page, and the `./docs` mount. `kura.config.ts` projects are unchanged. Requires `@kurajs/docs >=0.0.41`.
