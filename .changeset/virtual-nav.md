---
"@kurajs/docs": patch
---

Virtual navigation (`config.nav`): group FLAT doc slugs into on-screen tabs + sidebar groups
purely by config — no folders, no slug prefixes, files never moved.

Declare `nav.tabs` (the tab bar) and `nav.groups` (each an ordered list of doc slugs); a page is
a bare slug (label = its H1) or `{ slug, title }` for a shorter sidebar label. A group with no
`pages` auto-fills from the docs subfolder of the same name. URLs stay flat (`/discord`), so
repo-relative `.md` cross-links resolve by exact slug — no basename ambiguity from grouping. Title
overrides flow to the sidebar, pager, and page `<title>` from one source (no front-matter injected).
