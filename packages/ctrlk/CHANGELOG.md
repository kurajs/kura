# @kurajs/ctrlk

## 0.0.3

### Patch Changes

- [#53](https://github.com/kurajs/kura/pull/53) [`047db53`](https://github.com/kurajs/kura/commit/047db53c3ffa2ce6e60bbea819d51137bb0459ed) Thanks [@linyiru](https://github.com/linyiru)! - Rich HTML search previews. Previews showed raw markdown (`|table|`, code fences, `**bold**`) — now the search index is built from the rendered HTML: clean text for BM25 (`htmlToText`) and each section's HTML for a formatted preview (tables, code, lists, links render instead of markdown syntax). The static corpus ships HTML only (client derives index text with a cheap regex, no parser; ~360 KB gz, +6%), per-query payload unchanged. `@kurajs/ctrlk` items gain `excerptHtml` (rendered via innerHTML after a DOM-based sanitize that drops scripts, event handlers, and `javascript:` URLs). Relevance is unchanged.
