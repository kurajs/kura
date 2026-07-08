---
"@kurajs/docs": patch
---

Widen the `@junejs/og` dependency from `^0.0.4` to `>=0.0.5 <0.1.0`

`^0.0.4` is an exact pin (npm caret on a `0.0.z` version allows only that z), so `@kurajs/docs`
dragged in `@junejs/og@0.0.4`, whose edge backend STATICALLY re-exports `@vercel/og` — its
top-level `./yoga.wasm?module` import can't be bundled, breaking Vercel/serverless builds that
carry the OG route. `@junejs/og@0.0.5` lazy-loads `@vercel/og` and fixes this. Widening to a
range lets consumers resolve `0.0.5+` (the lazy backend) transitively, so they no longer need a
`pnpm.overrides` pin to escape the broken `0.0.4`.
