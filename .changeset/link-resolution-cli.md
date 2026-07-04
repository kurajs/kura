---
"@kurajs/cli": patch
"@kurajs/docs": patch
---

`kura index` freezes app/_links.ts — the LinkData behind the 3-tier link resolver: per-doc repo-relative source paths (default tree + locale mirrors, KURA_REPO_ROOT/KURA_SOURCE_MAP for copied-tree builds), the detected repo URL (config `repo` > GITHUB_REPOSITORY > the GitHub origin remote) with the exact CI sha as the ref, and a corpus-filtered git-tracked oracle (only targets authored links reach). The generated _kura.ts passes `links` into createDocs, and every `kura index` prints a one-line status (repo, coverage X/Y, target count). @kurajs/docs adds the lean `@kurajs/docs/links` subpath export and `resolveRepoPath` so the CLI's corpus scan shares the resolver's exact path semantics.
