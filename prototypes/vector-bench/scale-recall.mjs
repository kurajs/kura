// Does binary+rerank recall hold as the corpus grows? Scale test.
// We only have 2.4k real bge-m3 vectors; augment to 50k-500k via SMOTE-style
// spherical interpolation between real anchors (preserves the real manifold
// structure that governs binary-quant behaviour). Queries = held-out REAL vectors.
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import fs from "node:fs";
import { performance } from "node:perf_hooks";

const { N: RN, DIM } = JSON.parse(fs.readFileSync("corpus.meta.json", "utf8"));
const buf = fs.readFileSync("corpus.f32");
const real = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const reals = [];
for (let i = 0; i < RN; i++) reals.push(real.subarray(i * DIM, (i + 1) * DIM));

const K = 10;
const NQ = 50;
const SIZES = process.argv.slice(2).map(Number).filter((n) => n > 0);
const sizes = SIZES.length ? SIZES : [50000, 100000, 200000];

let s = 7;
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let i = reals.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [reals[i], reals[j]] = [reals[j], reals[i]]; }
const queries = reals.slice(0, NQ);
const anchors = reals.slice(NQ);
const A = anchors.length;

function genCorpus(n) {
  const c = new Float32Array(n * DIM);
  for (let i = 0; i < n; i++) {
    const a = anchors[(rnd() * A) | 0], b = anchors[(rnd() * A) | 0];
    const t = rnd();
    let ss = 0;
    const off = i * DIM;
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
function recall(got, t) { const s = new Set(t); let h = 0; for (const g of got) if (s.has(g)) h++; return h / t.length; }
const p50 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const N of sizes) {
  console.log(`\n========== N=${N.toLocaleString()} (real-augmented, queries=${NQ}, k=${K}) ==========`);
  const c = genCorpus(N);

  // ground truth + f32 brute-force latency
  const truth = [], bf = [];
  for (let qi = 0; qi < NQ; qi++) { const t0 = performance.now(); truth.push(exactTopK(c, N, queries[qi])); bf.push(performance.now() - t0); }

  // binary index
  const db = new Database(":memory:");
  sqliteVec.load(db);
  db.exec(`CREATE VIRTUAL TABLE vb USING vec0(embedding bit[${DIM}])`);
  const ins = db.prepare("INSERT INTO vb(rowid, embedding) VALUES (?, vec_quantize_binary(?))");
  const tb = performance.now();
  db.transaction(() => { for (let i = 0; i < N; i++) ins.run(BigInt(i), Buffer.from(c.buffer, i * DIM * 4, DIM * 4)); })();
  const buildMs = performance.now() - tb;
  const sel = db.prepare("SELECT rowid FROM vb WHERE embedding MATCH vec_quantize_binary(?) AND k = ? ORDER BY distance");

  console.log(`f32 brute-force p50: ${p50(bf).toFixed(1)}ms | binary index build: ${buildMs.toFixed(0)}ms`);
  console.log("strategy                       recall@10   q p50");
  console.log("-".repeat(52));
  for (const CAND of [K, 100, 200, 500, 1000]) {
    const rec = [], lat = [];
    for (let qi = 0; qi < NQ; qi++) {
      const q = queries[qi];
      const t0 = performance.now();
      const cand = sel.all(Buffer.from(q.buffer, q.byteOffset, DIM * 4), CAND).map((x) => Number(x.rowid));
      let res;
      if (CAND === K) res = cand.slice(0, K);
      else { const sc = cand.map((id) => [id, dotAt(c, id, q)]); sc.sort((a, b) => b[1] - a[1]); res = sc.slice(0, K).map((x) => x[0]); }
      lat.push(performance.now() - t0);
      rec.push(recall(res, truth[qi]));
    }
    const r = (rec.reduce((a, b) => a + b, 0) / NQ * 100).toFixed(1);
    const label = CAND === K ? "binary only" : `binary + rerank/${CAND}`;
    console.log(label.padEnd(31) + `${r}%`.padEnd(12) + `${p50(lat).toFixed(2)}ms`);
  }
  db.close();
}
console.log("\ndone.");
