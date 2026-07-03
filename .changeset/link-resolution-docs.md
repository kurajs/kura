---
"@kurajs/docs": patch
---

3-tier in-content link resolution (docs side, inert until the CLI freezes LinkData): with `app/_links.ts` each page resolves authored links from its own source path — on-site targets become site URLs (path-exact, with index/README folder-page aliases), repo files not on the site become repo web URLs (blob/tree, anchors kept), unknowns stay authored. Adds the top-level `repo` config field ("owner/name" | url | false, kura.toml parity), agent-surface rewriting (.md/.json projections via a fence-aware markdown rewriter, per-entry locale binding for the static search corpus, `source.path` on MCP get_page), and keeps the legacy slug/basename matcher as the rescue net — without LinkData every output is byte-identical to before.
