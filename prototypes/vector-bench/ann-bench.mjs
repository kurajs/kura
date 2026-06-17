// High-end: real HNSW (usearch, hnswlib-node) + JS in-RAM binary Hamming.
// Same real-augmented corpus as scale-recall. Queries = held-out real vectors.
import pkg from "hnswlib-node";
const { HierarchicalNSW } = pkg;
import fs from "node:fs";
import { performance } from "node:perf_hooks";

const { N: RN, DIM } = JSON.parse(fs.readFileSync("corpus.meta.json", "utf8"));
const fbuf = fs.readFileSync("corpus.f32");
const real = new Float32Array(fbuf.buffer, fbuf.byteOffset, fbuf.length / 4);
const reals = [];
for (let i = 0; i < RN; i++) reals.push(real.subarray(i * DIM, (i + 1) * DIM));

const K = 10;
const NQ = 50;
const sizes = (process.argv.slice(2).map(Number).filter((n) => n > 0));
const SIZES = sizes.length ? sizes : [50000, 100000, 200000];

let s = 7;
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let i = reals.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [reals[i], reals[j]] = [reals[j], reals[i]]; }
const queries = reals.slice(0, NQ);
const anchors = reals.slice(NQ);
const A = anchors.length;

function genCorpus(n) {
  const c = new Float32Array(n * DIM);
  for (let i = 0; i < n; i++) {
    const a = anchors[(rnd() * A) | 0], b = anchors[(rnd() * A) | 0], t = rnd(), off = i * DIM;
    let ss = 0;
    for (let d = 0; d < DIM; d++) { const x = a[d] * (1 - t) + b[d] * t + 0.02 * (rnd() - 0.5); c[off + d] = x; ss += x * x; }
    const inv = 1 / (Math.sqrt(ss) || 1);
    for (let d = 0; d < DIM; d++) c[off + d] *= inv;
  }
  return c;
}
const dotAt = (c, i, q) => { let s = 0; const off = i * DIM; for (let d = 0; d < DIM; d++) s += c[off + d] * q[d]; return s; };
function exactTopK(c, n, q) {
  const ids = Array(K).fill(-1), sc = Array(K).fill(-Infinity);
  for (let i = 0; i < n; i++) { const d = dotAt(c, i, q); if (d > sc[K - 1]) { let p = K - 1; while (p > 0 && sc[p - 1] < d) { sc[p] = sc[p - 1]; ids[p] = ids[p - 1]; p--; } sc[p] = d; ids[p] = i; } }
  return ids;
}
const recall = (got, t) => { const set = new Set(t); let h = 0; for (const g of got) if (set.has(g)) h++; return h / t.length; };
const p50 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const WORDS = DIM >> 5; // 32 bits/word
function popcount(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); x = (x + (x >>> 4)) & 0x0f0f0f0f; return (x * 0x01010101) >>> 24; }
function packBits(c, n) {
  const codes = new Uint32Array(n * WORDS);
  for (let i = 0; i < n; i++) {
    const off = i * DIM, co = i * WORDS;
    for (let w = 0; w < WORDS; w++) { let bits = 0; const base = off + (w << 5); for (let b = 0; b < 32; b++) if (c[base + b] > 0) bits |= (1 << b); codes[co + w] = bits >>> 0; }
  }
  return codes;
}

for (const N of SIZES) {
  console.log(`\n========== N=${N.toLocaleString()} (real-augmented, queries=${NQ}, k=${K}) ==========`);
  const c = genCorpus(N);
  const truth = [], bf = [];
  for (let qi = 0; qi < NQ; qi++) { const t0 = performance.now(); truth.push(exactTopK(c, N, queries[qi])); bf.push(performance.now() - t0); }
  const rows = [];
  rows.push({ engine: "f32 brute-force", build: 0, p50: p50(bf), recall: 1 });

  // ---- JS in-RAM binary: popcount + bucket-select top-CAND + f32 rerank ----
  {
    const tb = performance.now();
    const codes = packBits(c, N);
    const buildMs = performance.now() - tb;
    const dists = new Int32Array(N);
    const counts = new Int32Array(DIM + 1);
    const order = new Int32Array(N);
    for (const CAND of [100, 500, 1000]) {
      const lat = [], rec = [];
      for (let qi = 0; qi < NQ; qi++) {
        const q = queries[qi];
        const t0 = performance.now();
        // pack query
        const qc = new Uint32Array(WORDS);
        for (let w = 0; w < WORDS; w++) { let bits = 0; const base = (w << 5); for (let b = 0; b < 32; b++) if (q[base + b] > 0) bits |= (1 << b); qc[w] = bits >>> 0; }
        counts.fill(0);
        for (let i = 0; i < N; i++) { let h = 0, co = i * WORDS; for (let w = 0; w < WORDS; w++) h += popcount((codes[co + w] ^ qc[w]) >>> 0); dists[i] = h; counts[h]++; }
        // prefix offsets, place ids in distance order
        let acc = 0; for (let d = 0; d <= DIM; d++) { const cc = counts[d]; counts[d] = acc; acc += cc; }
        for (let i = 0; i < N; i++) { const d = dists[i]; order[counts[d]++] = i; }
        // rerank top-CAND by f32
        const m = Math.min(CAND, N);
        const sc = new Array(m);
        for (let j = 0; j < m; j++) { const id = order[j]; sc[j] = [id, dotAt(c, id, q)]; }
        sc.sort((a, b) => b[1] - a[1]);
        const res = sc.slice(0, K).map((x) => x[0]);
        lat.push(performance.now() - t0);
        rec.push(recall(res, truth[qi]));
      }
      rows.push({ engine: `JS-binary+rerank/${CAND}`, build: buildMs, p50: p50(lat), recall: rec.reduce((a, b) => a + b, 0) / NQ });
    }
  }

  // ---- hnswlib-node (HNSW), build once, sweep ef at query time ----
  try {
    const idx = new HierarchicalNSW("ip", DIM); // normalized vectors -> inner product == cosine
    idx.initIndex(N, 16, 200, 100); // maxElements, M, efConstruction, seed
    const tb = performance.now();
    for (let i = 0; i < N; i++) idx.addPoint(Array.from(c.subarray(i * DIM, (i + 1) * DIM)), i);
    const buildMs = performance.now() - tb;
    for (const ef of [64, 128, 256]) {
      idx.setEf(ef);
      const lat = [], rec = [];
      for (let qi = 0; qi < NQ; qi++) {
        const qa = Array.from(queries[qi]);
        const t0 = performance.now();
        const r = idx.searchKnn(qa, K);
        lat.push(performance.now() - t0);
        rec.push(recall(r.neighbors, truth[qi]));
      }
      rows.push({ engine: `hnswlib ef=${ef}`, build: buildMs, p50: p50(lat), recall: rec.reduce((a, b) => a + b, 0) / NQ });
    }
  } catch (e) { rows.push({ engine: "hnswlib", error: String(e.message || e) }); }

  // print
  const pad = (x, w) => String(x).padEnd(w);
  console.log(`f32 brute-force p50: ${p50(bf).toFixed(1)}ms`);
  console.log(pad("engine", 26) + pad("build", 12) + pad("q p50", 12) + "recall@10");
  console.log("-".repeat(62));
  for (const o of rows) {
    if (o.error) { console.log(pad(o.engine, 26) + "ERROR: " + o.error); continue; }
    console.log(pad(o.engine, 26) + pad(o.build ? (o.build / 1000).toFixed(1) + "s" : "-", 12) + pad(o.p50.toFixed(2) + "ms", 12) + (o.recall * 100).toFixed(1) + "%");
  }
}
console.log("\ndone.");
