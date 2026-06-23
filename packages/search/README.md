# @kurajs/search

Portable, zero-dependency retrieval primitives for Kura: **BM25 keyword search**,
**Reciprocal Rank Fusion** (to blend keyword + semantic), and a pluggable, per-locale
**tokenizer** layer. Runs identically on Node, Bun, Deno, Cloudflare Workers, and the
browser.

## BM25

```ts
import { Bm25 } from "@kurajs/search";

const bm = Bm25.from([
  { id: "a", text: "vector search engine", data: { url: "/a" } },
  { id: "b", text: "database indexing and query planning", data: { url: "/b" } },
]);

bm.search("search", { topK: 5 }); // → [{ id, score, data }, ...]
```

## Hybrid (RRF)

`rrf` / `rrfScored` fuse several ranked lists by rank, so a BM25 score and a cosine
similarity don't need to be comparable:

```ts
import { rrfScored } from "@kurajs/search";

const fused = rrfScored(
  [{ hits: keywordHits }, { hits: semanticHits }],
  (h) => h.slug,
  { topK: 8 },
); // → [{ item, score }, ...] in fused order
```

## Per-locale tokenizers

`Bm25` accepts a single `tokenize` function or a `resolveTokenizer` that picks one by
language, so one index can tokenize each document by its own locale (and each query by
the query locale). `byLocale()` builds the resolver (case-insensitive, with primary-subtag
fallback). CJK tokenizers live in [`@kurajs/tokenizers`](../tokenizers):

```ts
import { Bm25, byLocale, latinTokenizer } from "@kurajs/search";
import { cjkSegmenter } from "@kurajs/tokenizers";

const bm = Bm25.from(records, {
  resolveTokenizer: byLocale({
    default: latinTokenizer,
    zh: cjkSegmenter("zh"),
    ja: cjkSegmenter("ja"),
  }),
});
```

## Analyzer pipeline + 繁/簡 normalization

`pipeline()` composes char filters → a segmenter → token filters into a `Tokenizer`.
Char filters are just `(text) => string`, so anything of that shape drops in — including
**OpenCC's converter**, which already has that signature. That's all you need to fold
Traditional/Simplified Chinese (script *and* regional vocabulary, e.g. 软件↔軟體) so a
keyword query matches across variants — no extra Kura package required:

```ts
import * as OpenCC from "opencc-js"; // npm i opencc-js  (Apache-2.0)
import { pipeline } from "@kurajs/search";
import { cjkSegmenter } from "@kurajs/tokenizers";

// Fold everything to Traditional-Taiwan (idempotent on text already in that variant),
// then segment. Run the SAME pipeline at index and query time so terms line up.
const zhTW = pipeline({
  pre: [OpenCC.Converter({ from: "cn", to: "twp" })],
  segment: cjkSegmenter("zh-TW"),
});

// In a Kura docs app: defineKura({ tokenizer: byLocale({ "zh-TW": zhTW }) })
```

OpenCC ships ~5 MB of dictionaries, so only sites that need cross-variant **keyword**
matching pull it in. Most sites don't: a single-variant corpus is already consistent, and
the hybrid vector half bridges 繁/簡 semantically on its own.

## Exports

- `Bm25`, `rrf`, `rrfScored`
- Tokenizer toolkit: `latinTokenizer`, `byLocale`, `pipeline`, `lowercase`, `minLength`, `stopwords`
- Types: `Tokenizer`, `TokenizerResolver`, `CharFilter`, `TokenFilter`, `Bm25Record`, `Bm25Hit`, …
