// usearch (source-built) benchmark: f32 HNSW + b1 binary HNSW.
// Multithreaded batch build via typed arrays. Same real-augmented corpus.
import { Index, MetricKind, ScalarKind } from "usearch";
import fs from "node:fs";
import { performance } from "node:perf_hooks";

const { N: RN, DIM } = JSON.parse(fs.readFileSync("corpus.meta.json", "utf8"));
const fbuf = fs.readFileSync("corpus.f32");
const real = new Float32Array(fbuf.buffer, fbuf.byteOffset, fbuf.length / 4);
const reals = [];
for (let i = 0; i < RN; i++) reals.push(real.subarray(i * DIM, (i + 1) * DIM));

const K = 10, NQ = 50;
const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0);
const SIZES = sizes.length ? sizes : [50000, 100000, 200000];

let s = 7;
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let i = reals.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [reals[i], reals[j]] = [reals[j], reals[i]]; }
const queries = reals.slice(0, NQ), anchors = reals.slice(NQ), A = anchors.length;
function genCorpus(n) {
  const c = new Float32Array(n * DIM);
  for (let i = 0; i < n; i++) { const a = anchors[(rnd() * A) | 0], b = anchors[(rnd() * A) | 0], t = rnd(), off = i * DIM; let ss = 0; for (let d = 0; d < DIM; d++) { const x = a[d] * (1 - t) + b[d] * t + 0.02 * (rnd() - 0.5); c[off + d] = x; ss += x * x; } const inv = 1 / (Math.sqrt(ss) || 1); for (let d = 0; d < DIM; d++) c[off + d] *= inv; }
  return c;
}
const dotAt = (c, i, q) => { let s = 0; const off = i * DIM; for (let d = 0; d < DIM; d++) s += c[off + d] * q[d]; return s; };
function exactTopK(c, n, q) { const ids = Array(K).fill(-1), sc = Array(K).fill(-Infinity); for (let i = 0; i < n; i++) { const d = dotAt(c, i, q); if (d > sc[K - 1]) { let p = K - 1; while (p > 0 && sc[p - 1] < d) { sc[p] = sc[p - 1]; ids[p] = ids[p - 1]; p--; } sc[p] = d; ids[p] = i; } } return ids; }
const recall = (got, t) => { const set = new Set(t); let h = 0; for (const g of got) if (set.has(g)) h++; return h / t.length; };
const p50 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const N of SIZES) {
  console.log(`\n========== N=${N.toLocaleString()} (real-augmented, queries=${NQ}, k=${K}) ==========`);
  const c = genCorpus(N);
  const truth = [], bf = [];
  for (let qi = 0; qi < NQ; qi++) { const t0 = performance.now(); truth.push(exactTopK(c, N, queries[qi])); bf.push(performance.now() - t0); }
  const keys = new BigUint64Array(N);
  for (let i = 0; i < N; i++) keys[i] = BigInt(i);
  const rows = [{ engine: "f32 brute-force", build: 0, p50: p50(bf), recall: 1 }];

  for (const [name, quant] of [["usearch f32", ScalarKind.F32], ["usearch b1(binary)", ScalarKind.B1]]) {
    try {
      const idx = new Index({ dimensions: DIM, metric: MetricKind.Cos, quantization: quant, connectivity: 16, expansion_add: 128, expansion_search: 128 });
      const tb = performance.now();
      idx.add(keys, c); // batch, multithreaded
      const buildMs = performance.now() - tb;
      const lat = [], rec = [];
      for (let qi = 0; qi < NQ; qi++) {
        const q = queries[qi];
        const t0 = performance.now();
        const m = idx.search(q, K);
        lat.push(performance.now() - t0);
        rec.push(recall(Array.from(m.keys, (x) => Number(x)), truth[qi]));
      }
      rows.push({ engine: name, build: buildMs, p50: p50(lat), recall: rec.reduce((a, b) => a + b, 0) / NQ });
    } catch (e) { rows.push({ engine: name, error: String(e.message || e) }); }
  }

  const pad = (x, w) => String(x).padEnd(w);
  console.log(`f32 brute-force p50: ${p50(bf).toFixed(1)}ms`);
  console.log(pad("engine", 22) + pad("build", 12) + pad("q p50", 12) + "recall@10");
  console.log("-".repeat(58));
  for (const o of rows) {
    if (o.error) { console.log(pad(o.engine, 22) + "ERROR: " + o.error); continue; }
    console.log(pad(o.engine, 22) + pad(o.build ? (o.build / 1000).toFixed(2) + "s" : "-", 12) + pad(o.p50.toFixed(2) + "ms", 12) + (o.recall * 100).toFixed(1) + "%");
  }
}
console.log("\ndone.");
