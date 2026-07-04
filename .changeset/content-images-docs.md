---
"@kurajs/docs": patch
---

Content-image groundwork (docs side, inert until the CLI freezes an asset manifest): `<img src>` in rendered pages and the static search corpus rewrites to `/assets/<content-relative-path>` when the referenced file is in the frozen manifest; markdown image targets rewrite on the agent surfaces via the shared scanner's new opt-in `resolveImage`; and an `<a href>` pointing at an on-site-copied asset goes to the site copy instead of the repo blob. Resolution is content-tree-relative (works in isolated builds where repo paths are absent) with two-step variant fallback (locale mirrors share the default tree's files). Asset URLs are language-less and never carry a locale prefix. Sites without a manifest are byte-identical.
