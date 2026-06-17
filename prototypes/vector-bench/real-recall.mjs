// Binary-quant recall on REAL bge-m3 embeddings.
// Holds out queries, computes exact top-10 (ground truth), then measures
// recall@10 for: binary-only, and binary prefilter + f32 rerank at several depths.
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import fs from "node:fs";
import { performance } from "node:perf_hooks";

const { N, DIM } = JSON.parse(fs.readFileSync("corpus.meta.json", "utf8"));
const buf = fs.readFileSync("corpus.f32");
const raw = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const vecs = [];
for (let i = 0; i < N; i++) vecs.push(raw.subarray(i * DIM, (i + 1) * DIM));

const K = 10;
const NQ = Math.min(100, Math.floor(N * 0.2));
const queries = vecs.slice(0, NQ);
const data = vecs.slice(NQ);
const M = data.length;
console.log(`corpus=${N} -> data=${M}, queries=${NQ}, dim=${DIM}, k=${K}`);

const blob = (v) => Buffer.from(v.buffer, v.byteOffset, DIM * 4);
function dot(a, b) { let s = 0; for (let j = 0; j < DIM; j++) s += a[j] * b[j]; return s; }
function exactTopK(q) {
  const ids = Array(K).fill(-1), sc = Array(K).fill(-Infinity);
  for (let i = 0; i < M; i++) {
    const d = dot(data[i], q);
    if (d > sc[K - 1]) { let p = K - 1; while (p > 0 && sc[p - 1] < d) { sc[p] = sc[p - 1]; ids[p] = ids[p - 1]; p--; } sc[p] = d; ids[p] = i; }
  }
  return ids;
}
function recall(got, t) { const s = new Set(t); let h = 0; for (const g of got) if (s.has(g)) h++; return h / t.length; }

const truth = queries.map(exactTopK);

const db = new Database(":memory:");
sqliteVec.load(db);
db.exec(`CREATE VIRTUAL TABLE vb USING vec0(embedding bit[${DIM}])`);
const ins = db.prepare("INSERT INTO vb(rowid, embedding) VALUES (?, vec_quantize_binary(?))");
db.transaction(() => { for (let i = 0; i < M; i++) ins.run(BigInt(i), blob(data[i])); })();
const sel = db.prepare("SELECT rowid FROM vb WHERE embedding MATCH vec_quantize_binary(?) AND k = ? ORDER BY distance");

console.log("\nstrategy                     recall@10   q p50");
console.log("-".repeat(52));
for (const CAND of [K, 50, 100, 200, 500]) {
  const rec = [], lat = [];
  for (let qi = 0; qi < NQ; qi++) {
    const q = queries[qi];
    const t0 = performance.now();
    const cand = sel.all(blob(q), CAND).map((x) => Number(x.rowid));
    let res;
    if (CAND === K) res = cand.slice(0, K);
    else { const sc = cand.map((id) => [id, dot(data[id], q)]); sc.sort((a, b) => b[1] - a[1]); res = sc.slice(0, K).map((x) => x[0]); }
    lat.push(performance.now() - t0);
    rec.push(recall(res, truth[qi]));
  }
  const r = (rec.reduce((a, b) => a + b, 0) / NQ * 100).toFixed(1);
  const p50 = [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)].toFixed(2);
  const label = CAND === K ? "binary only" : `binary prefilter→rerank/${CAND}`;
  console.log(label.padEnd(29) + `${r}%`.padEnd(12) + `${p50}ms`);
}
db.close();
