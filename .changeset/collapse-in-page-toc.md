---
"@kurajs/docs": patch
---

Fold a hand-written in-page "Table of Contents" into a collapsed `<details>` (closed by default), drop its now-duplicate entry from the right-rail "On this page", and strip the `---` rules that fenced it. Only a list that is mostly in-page anchor links is wrapped, so ordinary lists are left untouched. Pure HTML/CSS, no JS.
