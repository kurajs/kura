---
"@kurajs/docs": patch
---

A link whose TEXT is a code span (`[`file.toml`](../file.toml)`, everywhere in real docs) now rewrites: the code-span guard skips a link only when its TARGET sits inside a span (a quoted example), instead of splitting the line around spans — which stranded the `](target)` from its `[text` and made both the markdown surfaces and the CLI's corpus scan blind to such links.
