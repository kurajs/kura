---
"@kurajs/docs": patch
---

Add the lean `@kurajs/docs/links` subpath export (June-free entry to the link resolver) and export `resolveRepoPath` — the CLI's corpus scan shares the resolver's exact path semantics (per-segment escape decoding, repo-root escape rejection).
