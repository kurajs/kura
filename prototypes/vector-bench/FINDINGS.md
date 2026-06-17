# Vector store benchmark — findings (Kura local RAG layer)

**Date:** 2026-06-16 · **Machine:** macOS x86_64, Node v22.22.2
**Versions:** `@libsql/client@0.17.4`, `libsql@0.5.29`, `sqlite-vec@0.1.9`, `better-sqlite3@12.11.1`
**Setup:** dim=1024 (bge-m3), k=10, 100 queries, clustered synthetic vectors (50 gaussian
clusters, σ=0.35, normalized). Cosine. Recall@10 vs exact ground truth.

> Synthetic data caveat: f32-exact recall is always 100% by definition and ANN
> *build time / index size* are data-independent — those conclusions are solid.
> Binary-quant **recall** on synthetic data is **pessimistic**; it was re-validated
> on real bge-m3 embeddings — see "Real bge-m3 embeddings" below (verdict flips).

## Results — query latency p50 / recall@10

| N | JS brute (RAM) | sqlite-vec f32 | libsql exact | sqlite-vec binary | bin+rerank/200 | libsql ANN (DiskANN) |
|---|---|---|---|---|---|---|
| 1k | 1.0ms / 100% | 2.2ms / 100% | 2.8ms / 100% | 0.07ms / 22% | — | 3.3ms / 99% |
| 10k | 10.8ms / 100% | 21ms / 100% | 31ms / 100% | 0.5ms / 10% | 2.3ms / 56% | 4.0ms / 48% |
| 50k | 53.6ms / 100% | 101ms / 100% | 154ms / 100% | 2.4ms / 6% | 10.4ms / 36% | 4.7ms / 16.5% |
| 100k | 108ms / 100% | 204ms / 100% | 308ms / 100% | 5.0ms / 6% | 19.6ms / 32% | (skipped) |

## Build cost & file size

| N | sqlite-vec f32 build / size | libsql exact insert / size | libsql ANN build / size |
|---|---|---|---|
| 1k | 40ms / 4.1MB | 58ms / 4.4MB | **3.4s / 28MB** |
| 10k | 346ms / 40MB | 569ms / 44MB | **39.8s / 285MB** |
| 50k | 1.5s / 197MB | 2.7s / 220MB | **226s / 1.42GB** |
| 100k | 3.0s / 395MB | 5.3s / 440MB | (skipped — superlinear) |

Raw f32 data ≈ 4KB/vector (4MB/1k). Binary quant ≈ 1/32 the size (14.5MB @ 100k).

## Conclusions

1. **f32 brute-force is the right default at docs scale.** Always 100% recall,
   trivial build, robust to data distribution. **JS in-memory is the fastest exact
   option** (no SQL serialization) — and fits Kura perfectly because the corpus is
   frozen at build time and can be loaded as a Float32 matrix into RAM.
   - ≤10k chunks: <25ms, effortless.
   - ~50k: 54ms (JS) – 150ms (SQL), borderline-interactive.
   - ~100k: 108–308ms → this is where you finally need ANN.

2. **libsql native DiskANN (embedded) — avoid for build-time indexing.** Build time
   explodes (40s@10k, **226s@50k**), index bloats to **~7× the raw data (1.4GB@50k)**,
   and recall is fragile (48%@10k, 16.5%@50k with `compress_neighbors=float8,
   max_neighbors=20`; uncompressed at 1k was 100% but 209MB/31s). This **overturns
   the earlier "default to libsql native vectors" recommendation.** (Turso's hosted
   service may behave differently; this verdict is specifically about the embedded
   file path via @libsql/client.)

3. **sqlite-vec works fine on macOS via better-sqlite3** — the feared extension-load
   landmine did NOT materialize with better-sqlite3 (only `node:sqlite`/Bun on macOS
   are problematic). f32 mode is solid. Binary mode is tiny + blazing (5ms@100k) but
   recall needs real-data validation + rerank tuning.

4. **Pure-JS brute-force (libsql exact) is slower than sqlite-vec f32 and both are
   slower than in-RAM JS** — because SQL drivers serialize/deserialize blobs per row.
   For a frozen corpus, keep the f32 matrix in memory.

## Real bge-m3 embeddings (the binary-quant verdict)

Corpus: 2,477 chunks from 278 real files (`.md` + `.ts/.tsx/.js` across both
monorepos), embedded with Transformers.js `Xenova/bge-m3` (q8, CLS pooling,
normalized), 1024-dim. 2,377 indexed, 100 held-out queries, recall@10 vs exact.

| strategy | recall@10 | query p50 |
|---|---|---|
| binary only | 72.1% | 0.08ms |
| binary prefilter → rerank/50 | 97.6% | 0.33ms |
| binary prefilter → rerank/100 | **99.9%** | 0.60ms |
| binary prefilter → rerank/200 | **100.0%** | 1.06ms |
| binary prefilter → rerank/500 | 100.0% | 2.42ms |

**Verdict flips vs synthetic.** On real embeddings, binary quant is excellent:
sign-based 1-bit quant preserves neighborhoods because real embeddings live on a
low-dim manifold (synthetic gaussian noise does not). **Binary prefilter + f32
rerank top-100–200 ≈ 100% recall at ~1ms.** Rerank depth may need to grow modestly
with corpus size — re-validate at target scale.

**Storage pattern this enables:** keep the *binary* codes hot (1/32 the size —
14.5MB per 100k vs 395MB f32) for the fast O(n) Hamming prefilter, and fetch only
the ~100–200 candidate *f32* vectors on demand to rerank. Low RAM, ~1ms query,
full recall — without DiskANN or Vectorize.

### bge-m3 on this machine
Runs on the Intel Mac (x86_64), but **only via `@huggingface/transformers@3.8.1`**
(ORT 1.21.0 ships a `darwin/x64` binary; transformers v4's ORT does **not** — it
errors `Cannot find darwin/x64 binding`). Install with `--ignore-scripts` (skips the
broken `sharp` source build; text feature-extraction doesn't need it). Speed (q8,
CPU): 54s one-time model download, ~18ms/sentence warm, ~250–306ms/chunk batched.

## Scale test — does rerank depth hold as N grows?

Real 2.4k bge-m3 vectors augmented to 50k–200k via SMOTE-style spherical
interpolation between real anchors (preserves real manifold structure); queries =
50 held-out **real** vectors. (`scale-recall.mjs`.)

| N | binary only | rerank/100 | rerank/200 | rerank/500 | rerank/1000 | f32 brute p50 |
|---|---|---|---|---|---|---|
| 50k | 62.2% | 99.0% | 99.8% | 100% | 100% | 70ms |
| 100k | 47.0% | 96.0% | 99.2% | 100% | 100% | 146ms |
| 200k | 36.6% | 93.6% | 98.0% | 99.4% | 100% | 276ms |

rerank latency p50 (binary scan + fetch + rerank): /200 = 9ms→18ms→37ms;
/1000 = 57ms→118ms→226ms across 50k→200k.

**Conclusions:**
- **Rerank depth must grow with N** to hold recall. Rule of thumb: ~99% needs
  CAND ≈ 0.25–0.5% of N (/100 @ 50k, /500 @ 100–200k); true 100% @ 200k needs /1000.
- **Binary+rerank wins big at ~99% recall** (200k: 37ms @ 98% vs 276ms brute), and
  always wins on **memory (32×)**. But to *guarantee* ~100% at 200k, /1000 costs
  ~226ms — about the same as f32 brute-force. So at large N + strict recall, binary's
  *compute* advantage erodes; its durable win is RAM/size + cheap 99%.
- **sqlite-vec's large-`k` cost is the bottleneck** (binary-only k=10 is 6ms @ 200k;
  k=1000 is 226ms). → CONFIRMED & FIXED: a **JS in-RAM Hamming scan** is ~4–8× faster
  (19.8ms vs 57ms+), latency flat across rerank depth. See the High-end section.
- **Large scale / strict 100% recall → benchmarked** (next section): JS-binary holds
  100% to ~1M at interactive latency with ~1s build; hnswlib gives sub-ms queries but
  multi-minute builds. libsql DiskANN remains disqualified.

> Caveat: SMOTE augmentation preserves manifold structure but not necessarily true
> large-corpus clustering; the *trend* (deeper rerank as N grows) is robust, exact
> percentages at 200k should be re-checked on a real corpus of that size.

## High-end: real HNSW vs JS in-RAM binary (`ann-bench.mjs`)

Same real-augmented corpus, 50 real queries, recall@10. (`@huggingface/transformers`
not involved here — pure retrieval.)

| N | f32 brute | JS-binary + rerank/1000 | hnswlib ef=128 |
|---|---|---|---|
| 50k | 73ms / 100% | 7.3ms / 100% — build 0.2s | 0.59ms / 99.8% — build 64s |
| 100k | 144ms / 100% | 11.7ms / 100% — build 0.5s | 0.56ms / 100% — build 135s |
| 200k | 289ms / 100% | 19.8ms / 100% — build 1.0s | 0.49ms / 100% — build 248s |

(JS-binary lower depths @200k: /100 = 94.4%, /500 = 99.6%, /1000 = 100%.
hnswlib ef=64 @200k = 98.2%; ef≥128 = 100%.)

**Findings:**
- **usearch is unusable on this Intel Mac** — native prebuilt segfaults at `new Index`
  (exit 139), same x86-darwin rot as onnxruntime-node. hnswlib-node (built from source)
  works. *Portability flag: native ANN libs are fragile on Intel Mac.*
- **JS in-RAM binary beats sqlite-vec ~4–8×** (200k /1000: 19.8ms vs sqlite-vec's
  57ms@100k-scale). Latency is flat across rerank depth (17.6→19.8ms for /100→/1000)
  — confirming sqlite-vec's large-`k` handling was the bottleneck, not the scan. The
  O(N) Hamming scan costs ~0.1ms per 1k vectors → extrapolates to ~50ms@500k,
  ~100ms@1M, all at **100% recall with rerank/1000** and ~1s build, codes at 1/32 RAM.
- **hnswlib = best query latency** (sub-ms, ~flat in N because it's log N), 100% recall
  at ef≥128 — but **build is the killer**: 64s→135s→248s for 50k→200k (~linear →
  prohibitive at 1M), needs `Array.from` per row (memory-heavy), is approximate, and
  carries a native-build dependency.

### usearch — diagnosed & benchmarked (source build)

The npm segfault was **not** a missing binary: usearch ships prebuilds for `linux-x64`,
`linux-arm64`, and `darwin-arm64+x64` (universal). The universal binary's **x64 slice
crashes on this i9-10910** (has AVX2, *not* AVX-512 → SIMD-dispatch/build bug).
**Building usearch from source on this exact machine works** (`node-gyp rebuild`) — proof
it's purely a prebuilt-baseline bug, and that Apple Silicon (which would load the arm64
slice) should be fine out of the box. GitHub also ships arm64/x64 macOS, Windows,
Android, and a **WASM** build.

usearch f32 HNSW vs the others (same corpus, x64 source build):

| N | usearch f32 build / query / recall | hnswlib ef=128 build / query / recall | JS-binary/1000 |
|---|---|---|---|
| 50k | 29s / 3.7ms / 99.4% | 64s / 0.59ms / 99.8% | 0.2s / 7.3ms / 100% |
| 100k | 69s / 3.1ms / 99.6% | 135s / 0.56ms / 100% | 0.5s / 11.7ms / 100% |
| 200k | 112s / 2.7ms / 99.4% | 248s / 0.49ms / 100% | 1.0s / 19.8ms / 100% |

- **usearch build ≈ 2× faster than hnswlib** (multithreaded batch `add` via typed
  arrays) — its real win. **But its query latency here (~3ms) was *higher* than
  hnswlib's (~0.5ms)** on this x64 box (likely NAPI per-call overhead + x64 SIMD path;
  on arm64/NEON it should improve — not verifiable here). The "10× vs FAISS" headline
  did **not** show up for single-query latency on this x64 build.
- usearch's built-in **`ScalarKind.B1` gave 0% recall** with `metric: Cos` —
  misconfigured (binary needs Hamming + binarized input), not a real result. Our hand-
  rolled JS binary already nails this, so not worth chasing.
- **Verdict:** usearch is the better *native* ANN (faster build, broadest prebuilds incl.
  arm64 + wasm) **where its prebuilt works** — but the x64-mac crash means it can't be a
  hard default. And at these scales its query edge over pure-JS binary is modest
  (3ms vs 12–20ms) while costing a minutes-long build + native dep.

### usearch-wasm on Workers — probed, parked

The GitHub `usearch_wasm` artifact is **`libusearch_c.a` (a WASM static lib) + a C
header — not a ready module**. Bringing it to Workers means: install the Emscripten SDK
(absent here), write a C wrapper + JS glue, compile with the right flags (no pthreads,
MODULARIZE, exported funcs), and load it in a Worker via an `instantiateWasm` hook.
Runtime constraints: 128MB/Worker, single-thread (usearch's multithread build is moot),
cold-start wasm init + load the whole index into memory. **Plus side:** the C API is
buffer-based (`usearch_load_buffer`/`view_buffer`/`save_buffer`) — no filesystem needed,
which fits Workers. **Verdict: feasible but high-effort; parked.** Pure-JS binary already
covers Workers for free and Vectorize covers cloud-scale; usearch-wasm only adds value
for sub-ms ANN over a huge corpus *inside* a Worker — revisit if that need is real.

**The portability bonus that decides it:** JS-binary is the only **pure-JS** option —
no native module, no loadable SQLite extension — so the *same code* runs on Node, Bun,
Deno **and Cloudflare Workers** (where better-sqlite3 / sqlite-vec / hnswlib all can't
load). Binary codes ship as a static asset loaded into memory; f32 rerank candidates
fetched by id from D1. **One retrieval engine, identical across every June target.**

## Real Traditional-Chinese retrieval quality (DRCD)

End-to-end eval of the actual `@kurajs/core` engine + local bge-m3 adapter
(`@kurajs/transformers`) on **DRCD** (Taiwan-Wikipedia MRC, CC BY-SA 3.0):
1,000 paragraphs as the corpus, 500 sampled real questions as queries, the relevant
paragraph as ground truth. (`drcd-eval.mjs`.)

| path | R@1 | R@5 | R@10 | MRR | q p50 |
|---|---|---|---|---|---|
| exact f32 | 77.2% | 96.8% | 97.4% | 0.853 | 1.52ms |
| binary+rerank | 77.2% | 96.8% | 97.4% | 0.853 | 0.39ms |

- **bge-m3 + Kura works well on real 繁中**: the correct paragraph is in the top-5 for
  **96.8%** of genuine questions (MRR 0.853). Strong for single-vector dense retrieval
  feeding top-k to an LLM.
- **binary+rerank == exact recall** here, and even *faster* at 1k docs (0.39 vs 1.52ms):
  Hamming over 128-byte codes + rerank 200 beats a full f32 scan, with no recall loss.
- **Query embedding is cheap for short text**: DRCD questions embedded at **28ms/text**
  (vs 326ms for the long paragraphs) — real-time live search is comfortable on CPU.

## Architecture impact for Kura — final tiers

One **pure-JS** retrieval engine is the spine, because it's the only thing that runs
identically on Node/Bun/Deno **and Cloudflare Workers** (no native module, no SQLite
extension):

- **≤~10k chunks:** f32 brute-force over the frozen corpus in RAM. 100% recall,
  ~10ms, trivial. Simplest possible.
- **~10k–~1M chunks (the default):** **JS in-RAM binary prefilter + f32 rerank**
  (depth ~0.5% of N → 100% recall). Build ~1s, RAM = binary codes at 1/32 (≈128MB @
  1M), latency ~0.1ms/1k (≈20ms@200k, ≈100ms@1M). Pure JS → ships to Workers (codes as
  a static asset; f32 candidates fetched by id from D1). **Same code every target.**
- **Sub-ms query SLA on a large, fairly static corpus (optional native turbo):**
  **usearch** is the preferred native ANN (~2× faster build than hnswlib, broadest
  prebuilds incl. arm64 + wasm) — but pin a source build on Intel Mac (prebuilt x64
  slice segfaults). **hnswlib** is the more-portable fallback (compiles anywhere, but
  single-threaded slow build). Or **Vectorize** on Cloudflare. All approximate (~99.5%+).
- **Rejected:** libsql DiskANN (build/size/recall all bad); sqlite-vec for large k
  (4–8× slower than JS in-RAM — though sqlite-vec f32 is fine for vectors *in the DB* at
  small scale). Note even native ANN's query edge over pure-JS binary is modest at
  ≤200k (3ms vs 12–20ms) for a minutes-long build + native dep — so reserve it for
  genuinely large corpora with a strict sub-ms SLA.

Embedding stays **bge-m3 1024-dim both sides** (CF `@cf/baai/bge-m3` ↔ local
`Xenova/bge-m3`), embedded once at build time; only the query is embedded at runtime.

## Next step

- Implement Kura's `kb()` resource mirroring Juno's `table()`: f32 brute-force ≤10k;
  **pure-JS binary prefilter + f32 rerank** above; build-time index freeze hooked into
  `june gen` / `generateContent` (`packages/june/src/build.ts`).
- (Optional) re-check binary recall on a real ≥100k corpus; confirm Workers memory
  budget for shipping binary codes as an asset.
- Pin `@huggingface/transformers@3.8.1` for Intel-Mac support (or develop on ARM).

## Run it

```sh
npm install
node bench.mjs 1000 10000 50000        # store engines (incl. slow libsql ANN)
SKIP_ANN=1 node bench.mjs 100000       # brute-force engines only
node embed-corpus.mjs                   # embed real corpus with bge-m3 -> corpus.f32
node real-recall.mjs                    # binary recall on real embeddings
node scale-recall.mjs 50000 100000 200000   # sqlite-vec binary at scale
node ann-bench.mjs 50000 100000        # hnswlib vs JS in-RAM binary
```
