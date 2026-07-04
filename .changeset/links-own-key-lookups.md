---
"@kurajs/docs": patch
---

Own-key lookups for the frozen link maps: a slug named like an Object.prototype member ("toString", "constructor") now misses cleanly instead of resolving an inherited function.
