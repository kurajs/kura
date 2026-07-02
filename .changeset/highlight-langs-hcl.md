---
"@kurajs/docs": patch
"@kurajs/cli": patch
---

Highlight `hcl` fences, and make the shiki language list extensible via `highlight.langs`

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
