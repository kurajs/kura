---
"create-kura": patch
---

Scaffolded apps now depend on the current Kura packages (`@kurajs/docs` ^0.1.0, `@kurajs/cli` ^0.1.0) — the template still pointed at the pre-0.1.0 ranges after the Kura 0.1.0 release, so `create-kura` produced apps on the stale majors. A new test asserts the template's caret ranges cover the workspace versions, so the template can no longer silently fall behind a release.
