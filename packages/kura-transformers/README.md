# @kurajs/transformers

Local embedder for [Kura](https://kura.build), backed by
[Transformers.js](https://github.com/huggingface/transformers.js) — runs the model in
JS via ONNX Runtime, **no Python, no cloud API**. Default model **bge-m3 (1024-dim)**,
for parity with Cloudflare Workers AI's `@cf/baai/bge-m3`.

This is a separate package on purpose: it pulls a heavy native dependency
(`@huggingface/transformers` → onnxruntime), which must never enter the zero-dependency
`@kurajs/core` core or a Cloudflare Workers bundle.

## Install

```sh
npm i @kurajs/core @kurajs/transformers @huggingface/transformers
```

> On Intel macOS, pin `@huggingface/transformers@3.8.1` (newer ONNX Runtime drops the
> darwin-x64 binary). Apple Silicon / Linux are fine on current versions.

## Usage

```ts
import { Kb } from "@kurajs/core";
import { transformers } from "@kurajs/transformers";

const kb = new Kb({ embedder: transformers() }); // dim inferred from the embedder

await kb.addText([
  { id: "deploy", text: "Run `june deploy` to ship your site to Cloudflare Workers." },
  { id: "search", text: "Vector search uses bge-m3, with strong multilingual (incl. CJK) support." },
]);

const hits = await kb.searchText("how do I deploy to Cloudflare?", { topK: 3 });
```

## In `kura.config.ts`

```ts
import { defineConfig } from "@kurajs/core";
import { transformers } from "@kurajs/transformers";

export default defineConfig({
  embedder: transformers({ model: "Xenova/bge-m3" }),
});
```

Switch engines by swapping the adapter (e.g. `workersAI()` on Cloudflare). All adapters
implement the same `Embedder` interface, so the rest of Kura is unchanged. Keep the
**same model on both sides** (`Xenova/bge-m3` ↔ `@cf/baai/bge-m3`) so a build-time index
stays compatible with runtime queries.

## Options

`transformers({ model?, dim?, dtype?, pooling? })` — defaults: `Xenova/bge-m3`, `1024`,
`q8`, `cls`. Model loads lazily on first embed and is cached. On CPU it embeds one text
at a time (batching pads to the longest sequence and is slower for variable-length text).

## License

MIT
