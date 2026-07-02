---
"create-kura": patch
---

Template tsconfig: drop the redundant `jsxImportSource` override

`@kurajs/docs/tsconfig.kura.json` (the template's `extends` base) already declares
`jsxImportSource: "@junejs/core"`; repeating it in the app tsconfig was duplication that
also tripped rolldown's `CONFIGURATION_FIELD_CONFLICT` warning on `kura build` with June
< 0.0.52. June ≥ 0.0.52 no longer warns either way — this just removes the drift surface.
