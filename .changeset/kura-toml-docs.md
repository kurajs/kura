---
"@kurajs/docs": patch
---

Add `fromKuraToml()` — normalize a parsed `kura.toml` into a `KuraConfig`. This lets a project be configured with a declarative `kura.toml` (idiomatic for non-JS repos) instead of `kura.config.ts`. Renames the snake_case keys, defaults the `<title>` template to `"{page} - {site name}"`, and default-mounts the repo's `./docs` at the site root when no `[[content.sources]]` are declared.
