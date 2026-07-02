---
"@kurajs/docs": patch
---

Rewrite in-content Markdown cross-links to the target doc's real URL.

Authors write repo-relative `[x](other.md)` links between docs; previously these rendered
verbatim and resolved against the current page URL (→ 404). Now each `.md` link is matched to
a doc (by slug, else basename) and rewritten to that doc's URL — carrying the docs mount, locale
prefix, and deploy subpath, with any `#anchor` preserved. External / non-`.md` / unresolved links
are left untouched.
