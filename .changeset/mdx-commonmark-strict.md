---
"@kurajs/docs": patch
"@kurajs/cli": patch
---

Add a CommonMark content mode and a strict build flag for MDX

- `markdown: "commonmark"` (kura.config.ts) or `kura build --commonmark` renders content as plain CommonMark, so a literal `{…}`/`<…>` is text rather than an MDX expression that silently drops the whole page. Opt in for prose-only docs that don't use the curated components.
- `kura build --strict` fails the build when any page falls back from MDX to plain markdown, so CI catches the silent drop instead of the author discovering it in production.
