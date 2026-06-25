---
"@kurajs/docs": patch
---

Render `--commonmark` mode with sparkdown-gfm (wasm) + shiki

CommonMark mode (`markdown: "commonmark"` / `kura build --commonmark`) now renders via the
`@momiji-rs/sparkdown/gfm` WebAssembly parser instead of `@mdx-js` `format:"md"`, then highlights code
blocks with the same shiki highlighter the MDX path uses — so both modes get identical build-time,
dual-theme highlighting. CommonMark-strict by construction: a literal `{…}` stays text (no MDX
expression footgun, and zero compile failures → no silent page drops), GFM (tables/strikethrough/
task-lists/autolinks) renders, headings stay bare (Kura's anchor post-processor depends on this), and
an unknown code language falls back to plain text instead of throwing. MDX mode is unchanged.
