# @kurajs/core

**Kura — the knowledgebase for humans and agents.**

The retrieval engine: a portable, pure-JS, zero-dependency vector index. The *same
code* runs on Node, Bun, Deno, and Cloudflare Workers (no native module, no SQLite
extension), which is what lets a Kura knowledgebase deploy anywhere June does.

Strategy (validated in `prototypes/vector-bench`):

- **Small corpus (≤ `exactThreshold`, default 10k):** exact f32 brute-force — 100% recall.
- **Larger corpus:** binary (sign-bit) Hamming **prefilter** → f32 **rerank**. ~100%
  recall at rerank depth ≈ 0.5% of N, 32× less memory than f32, ~0.1ms/1k vectors.

Embeddings are pluggable; default model is **bge-m3 (1024-dim)**, identical on local
(`Xenova/bge-m3`) and Cloudflare (`@cf/baai/bge-m3`) for vector-space parity.

## Usage

```ts
import { Kb } from "@kurajs/core";

const kb = Kb.from(
  [
    { id: "intro",  vector: embed("..."), data: { url: "/docs/intro" } },
    { id: "deploy", vector: embed("..."), data: { url: "/docs/deploy" } },
  ],
  { dim: 1024 },
);

const hits = kb.search(queryVector, { topK: 8 });
// -> [{ id, score, data }, ...]  (score = cosine similarity)
```

With an embedder adapter wired in, ingest and query by text directly:

```ts
import { transformers } from "@kurajs/transformers"; // local bge-m3

const kb = new Kb({ embedder: transformers() }); // dim inferred from the embedder
await kb.addText([{ id: "deploy", text: "..." }]);
const hits = await kb.searchText("how do I deploy to Workers?", { topK: 8 });
```

Embedders are **function-first adapters** selected in `kura.config.ts`, the same shape as
June's deploy targets:

```ts
import { defineConfig } from "@kurajs/core";
import { transformers } from "@kurajs/transformers"; // local
// import { workersAI } from "@kurajs/core-workers-ai";   // cloud

export default defineConfig({ embedder: transformers({ model: "Xenova/bge-m3" }) });
```

Any adapter implementing the `Embedder` interface (`{ id, dim, embed(texts) }`) works.
Keep the same model on both sides (`Xenova/bge-m3` ↔ `@cf/baai/bge-m3`) for index parity.

## Build-time freeze → load anywhere (incl. Workers)

Embed the corpus once at build time, serialize, ship the bytes as a static asset.
At runtime only the *query* is embedded.

```ts
// build step
await Bun.write("kb.bin", kb.serialize());

// runtime (Node / Bun / Deno / Worker)
import index from "./kb.bin"; // Worker: a wasm/binary asset binding; Node: readFile
const kb = Kb.load(new Uint8Array(index), { embed });
```

On Cloudflare Workers: ship the binary codes + f32 in the asset, load into memory at
startup, search in-process — zero extra service, zero network hop.

## Dynamic ingestion (live write / update / delete)

Because there is **no ANN graph to rebuild**, writes are searchable on the very next
query — no reindex. Store-side ops are effectively free (the embedding is the only real
cost):

| corpus | `upsert` | `delete` | search after write |
|---|---|---|---|
| 10k | 0.05ms | 0.002ms | 1.5ms (exact) |
| 100k | 0.02ms | 0.001ms | 8ms (binary) |

```ts
kb.upsert({ id: "doc-42", vector: await embed(text), data: { url } }); // insert or update in place
kb.has("doc-42");   // true
kb.delete("doc-42"); // O(1) swap-remove
// the change is reflected in the next kb.search() — nothing to rebuild
```

A live write end-to-end = `embed(text)` (the bottleneck: ~188ms local CPU q8, ~tens of ms
via Workers AI) + `upsert` (~0.02ms). On CPU, embed **one item at a time** — batching is
slower (it pads every sequence to the batch's longest).

## API

- `Kb.from(records, options)` / `new Kb(options)`
- `kb.add(records)` / `kb.upsert(record)` — insert or update by id
- `kb.delete(id)` → `boolean` · `kb.has(id)` → `boolean`
- `kb.search(vector, { topK?, rerankDepth? })` → `KbHit[]`
- `kb.searchText(text, opts)` → `Promise<KbHit[]>` (requires `embed`)
- `kb.serialize()` → `Uint8Array` · `Kb.load(bytes, { embed? })`
- `kb.size`

`options`: `{ dim, exactThreshold?, embed? }`.

## Scale guidance

| Corpus | Engine | Notes |
|---|---|---|
| ≤10k | exact f32 brute-force (automatic) | 100% recall, ~10ms |
| 10k–~1M | binary prefilter + rerank (automatic) | ~100% recall, ~0.1ms/1k, 1/32 RAM |
| huge + strict sub-ms SLA | optional native ANN (usearch) or Vectorize | outside this package |

## License

MIT
