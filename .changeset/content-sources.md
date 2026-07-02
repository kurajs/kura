---
"@kurajs/docs": patch
"@kurajs/cli": patch
---

Docs-as-code: `content.sources` in kura.config.ts

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
