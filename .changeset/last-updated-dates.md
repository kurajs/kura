---
"@kurajs/docs": patch
"@kurajs/cli": patch
---

Add an optional "Last updated on" date per doc page

Opt in with `lastUpdated: true` in `kura.config.ts` (**default off**). `kura index` then captures each
doc's last git commit date and freezes it to `app/_dates.ts`; `DocBody` renders a localized
`Last updated on <date>` line (a frontmatter `lastUpdated:` overrides the git date per page). The date
is formatted with `Intl.DateTimeFormat` pinned to UTC, so it's stable across build/viewer timezones.

Notes: the build must run inside a git repo with history — in CI set the checkout to `fetch-depth: 0`
(a shallow clone has no dates, so the line is simply omitted; it never fails the build). `app/_dates.ts`
is always generated (empty `{}` when off) so the wiring imports it unconditionally.
