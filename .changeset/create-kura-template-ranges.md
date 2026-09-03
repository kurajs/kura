---
"create-kura": patch
---

The scaffolded project now depends on `@kurajs/docs ^0.2.0` and `@kurajs/cli ^0.2.0`. The 0.2.0 release bumped both packages but left the template on `^0.1.0`, which a 0.x caret does not extend to — a fresh `create-kura` app installed the previous minor, and the template guard test has been failing on `main` since.
