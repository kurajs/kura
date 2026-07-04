---
"@kurajs/cli": patch
---

`kura index` freezes app/_assets.ts — the content-image manifest behind @kurajs/docs' pipeline: per-doc content-tree-relative paths (git-independent, mount-aware) and a corpus-filtered set of referenced image files (extraction reuses the docs package's markdown scanner, existence-checked against the content trees, image-extension allowlist). Static builds copy the manifest's files to dist/static/assets/ after `kura build`/`preview`/`deploy`; a generated assets route serves them from disk in dev (computed fs import — worker bundles stay clean, other targets 404 harmlessly). Warns when doc slugs sit under the reserved /assets/ namespace. Requires @kurajs/docs >=0.0.52.
