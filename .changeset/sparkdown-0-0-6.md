---
"@kurajs/docs": patch
---

Bump @momiji-rs/sparkdown to ^0.0.6

Picks up sparkdown's wasm input-decode perf work (str::from_utf8 fast-path, TextEncoder.encodeInto
straight into wasm memory) on the shared entry the CommonMark (`markdown: "commonmark"` / `--commonmark`)
render path uses. v0.0.6's headline `/mdast` subpath is not used by Kura. Verified the `/gfm` `toHtmlSync`
HTML output is byte-for-byte identical to 0.0.4 across a headings/lists/tasklists/tables/code-fence/
autolink/escaping corpus, so rendered docs are unchanged.
