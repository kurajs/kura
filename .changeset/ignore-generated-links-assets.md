---
"create-kura": patch
---

Scaffold's `.gitignore` now ignores `app/_links.ts` and `app/_assets.ts`

`kura index` freezes two more generated modules — `app/_links.ts` (the link-resolution data, since `@kurajs/cli` 0.0.27) and `app/_assets.ts` (the content-image manifest, since 0.0.28) — but the scaffolded `.gitignore` still only listed the older `app/_*.ts` artifacts. A project created before this and built with a current CLI ended up committing (or seeing as untracked) two machine-generated files. The template now ignores both, alongside the existing `_content`/`_mdx`/`_meta`/`_dates`/`_islands.gen` entries.
