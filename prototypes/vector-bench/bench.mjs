// Kura vector-store benchmark
// libsql native vectors (DiskANN ANN + exact) vs sqlite-vec (f32 + binary) vs JS brute-force.
// Dim = 1024 (bge-m3). Clustered synthetic vectors (mixture of gaussians) to mimic
// real embedding distributions better than uniform random.
//
// Usage: node bench.mjs [size1 size2 ...]   (default 1000 10000 50000)

import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DIM = 1024;
const K = 10;
const NQ = 100; // number of query vectors
const NCLUSTERS = 50;
const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0);
const SIZES = sizes.length ? sizes : [1000, 10000, 50000];

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kura-vbench-"));

// ---------- rng + data gen ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}
function genVectors(n, r) {
  const centroids = [];
  for (let c = 0; c < NCLUSTERS; c++) {
    const v = new Float32Array(DIM);
    for (let i = 0; i < DIM; i++) v[i] = randn(r);
    centroids.push(normalize(v));
  }
  const data = new Array(n);
  for (let i = 0; i < n; i++) {
    const base = centroids[(r() * NCLUSTERS) | 0];
    const v = new Float32Array(DIM);
    for (let d = 0; d < DIM; d++) v[d] = base[d] + 0.35 * randn(r);
    data[i] = normalize(v);
  }
  return data;
}

// ---------- stats ----------
function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
function recall(got, truth) {
  const t = new Set(truth);
  let hit = 0;
  for (const g of got) if (t.has(g)) hit++;
  return hit / truth.length;
}
function fileSize(p) {
  try { return fs.statSync(p).size; } catch { return 0; }
}
const mb = (b) => (b / 1024 / 1024).toFixed(1) + "MB";
const ms = (x) => x.toFixed(2);

// ---------- JS brute-force (baseline + ground truth) ----------
function topKDot(data, q, k) {
  // data: Float32Array[], q: Float32Array, normalized -> cosine == dot
  const ids = new Array(k).fill(-1);
  const sc = new Array(k).fill(-Infinity);
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    let dot = 0;
    for (let d = 0; d < DIM; d++) dot += v[d] * q[d];
    if (dot > sc[k - 1]) {
      let j = k - 1;
      while (j > 0 && sc[j - 1] < dot) { sc[j] = sc[j - 1]; ids[j] = ids[j - 1]; j--; }
      sc[j] = dot; ids[j] = i;
    }
  }
  return ids;
}

// ---------- run one size ----------
async function runSize(n) {
  const r = mulberry32(1234 + n);
  console.log(`\n========== N=${n.toLocaleString()} (dim=${DIM}, k=${K}, queries=${NQ}) ==========`);
  const data = genVectors(n, r);
  const queries = genVectors(NQ, mulberry32(99));

  const out = [];

  // ---- JS brute-force + ground truth ----
  const truth = [];
  {
    const lat = [];
    for (let qi = 0; qi < NQ; qi++) {
      const t0 = performance.now();
      const ids = topKDot(data, queries[qi], K);
      lat.push(performance.now() - t0);
      truth.push(ids);
    }
    out.push({ engine: "JS brute-force", build: 0, size: 0, p50: pct(lat, 50), p95: pct(lat, 95), recall: 1 });
  }

  // ---- sqlite-vec float32 (cosine) ----
  try {
    const f = path.join(TMP, `sv-f32-${n}.db`);
    const db = new Database(f);
    sqliteVec.load(db);
    db.exec(`CREATE VIRTUAL TABLE v USING vec0(embedding float[${DIM}] distance_metric=cosine)`);
    const ins = db.prepare("INSERT INTO v(rowid, embedding) VALUES (?, ?)");
    const tb = performance.now();
    const tx = db.transaction((rows) => { for (const [id, buf] of rows) ins.run(id, buf); });
    const rows = data.map((v, i) => [BigInt(i), Buffer.from(v.buffer)]);
    tx(rows);
    const build = performance.now() - tb;
    const sel = db.prepare("SELECT rowid FROM v WHERE embedding MATCH ? AND k = ? ORDER BY distance");
    const lat = [], rec = [];
    for (let qi = 0; qi < NQ; qi++) {
      const qb = Buffer.from(queries[qi].buffer);
      const t0 = performance.now();
      const res = sel.all(qb, K).map((x) => x.rowid);
      lat.push(performance.now() - t0);
      rec.push(recall(res, truth[qi]));
    }
    db.close();
    out.push({ engine: "sqlite-vec f32", build, size: fileSize(f), p50: pct(lat, 50), p95: pct(lat, 95), recall: rec.reduce((a, b) => a + b, 0) / NQ });
  } catch (e) { out.push({ engine: "sqlite-vec f32", error: String(e.message || e) }); }

  // ---- sqlite-vec binary quantization ----
  try {
    const f = path.join(TMP, `sv-bin-${n}.db`);
    const db = new Database(f);
    sqliteVec.load(db);
    db.exec(`CREATE VIRTUAL TABLE vb USING vec0(embedding bit[${DIM}])`);
    const ins = db.prepare("INSERT INTO vb(rowid, embedding) VALUES (?, vec_quantize_binary(?))");
    const tb = performance.now();
    const tx = db.transaction((rows) => { for (const [id, buf] of rows) ins.run(id, buf); });
    tx(data.map((v, i) => [BigInt(i), Buffer.from(v.buffer)]));
    const build = performance.now() - tb;
    // over-fetch then we still measure recall vs true top-k
    const sel = db.prepare("SELECT rowid FROM vb WHERE embedding MATCH vec_quantize_binary(?) AND k = ? ORDER BY distance");
    const lat = [], rec = [];
    for (let qi = 0; qi < NQ; qi++) {
      const qb = Buffer.from(queries[qi].buffer);
      const t0 = performance.now();
      const res = sel.all(qb, K).map((x) => x.rowid);
      lat.push(performance.now() - t0);
      rec.push(recall(res, truth[qi]));
    }
    db.close();
    out.push({ engine: "sqlite-vec binary", build, size: fileSize(f), p50: pct(lat, 50), p95: pct(lat, 95), recall: rec.reduce((a, b) => a + b, 0) / NQ });
  } catch (e) { out.push({ engine: "sqlite-vec binary", error: String(e.message || e) }); }

  // ---- sqlite-vec binary prefilter + f32 rerank (f32 kept in RAM, as a frozen corpus would be) ----
  try {
    const f = path.join(TMP, `sv-rr-${n}.db`);
    const db = new Database(f);
    sqliteVec.load(db);
    db.exec(`CREATE VIRTUAL TABLE vb USING vec0(embedding bit[${DIM}])`);
    const ins = db.prepare("INSERT INTO vb(rowid, embedding) VALUES (?, vec_quantize_binary(?))");
    const tb = performance.now();
    const tx = db.transaction((rows) => { for (const [id, buf] of rows) ins.run(id, buf); });
    tx(data.map((v, i) => [BigInt(i), Buffer.from(v.buffer)]));
    const build = performance.now() - tb;
    const CAND = 200;
    const sel = db.prepare("SELECT rowid FROM vb WHERE embedding MATCH vec_quantize_binary(?) AND k = ? ORDER BY distance");
    const lat = [], rec = [];
    for (let qi = 0; qi < NQ; qi++) {
      const q = queries[qi], qb = Buffer.from(q.buffer);
      const t0 = performance.now();
      const cand = sel.all(qb, CAND).map((x) => Number(x.rowid));
      const scored = cand.map((id) => { const v = data[id]; let dot = 0; for (let d = 0; d < DIM; d++) dot += v[d] * q[d]; return [id, dot]; });
      scored.sort((a, b) => b[1] - a[1]);
      const res = scored.slice(0, K).map((x) => x[0]);
      lat.push(performance.now() - t0);
      rec.push(recall(res, truth[qi]));
    }
    db.close();
    out.push({ engine: `sqlite-vec bin+rerank/${CAND}`, build, size: fileSize(f), p50: pct(lat, 50), p95: pct(lat, 95), recall: rec.reduce((a, b) => a + b, 0) / NQ });
  } catch (e) { out.push({ engine: "sqlite-vec bin+rerank", error: String(e.message || e) }); }

  // ---- libsql: detect insert mode (raw blob vs vector32 text) ----
  const lf = path.join(TMP, `libsql-${n}.db`);
  const client = createClient({ url: `file:${lf}` });
  let rawBlobOk = false;
  try {
    await client.execute(`CREATE TABLE probe(id INTEGER PRIMARY KEY, e F32_BLOB(${DIM}))`);
    const v0 = data[0];
    await client.execute({ sql: "INSERT INTO probe(id, e) VALUES (1, ?)", args: [new Uint8Array(v0.buffer.slice(0))] });
    const chk = await client.execute({ sql: "SELECT vector_distance_cos(e, ?) AS d FROM probe WHERE id=1", args: [new Uint8Array(v0.buffer.slice(0))] });
    const d = chk.rows[0]?.d;
    rawBlobOk = typeof d === "number" && Number.isFinite(d) && d < 1e-3;
    await client.execute("DROP TABLE probe");
  } catch { rawBlobOk = false; }

  const toArg = (v) => rawBlobOk ? new Uint8Array(v.buffer.slice(0)) : JSON.stringify(Array.from(v));
  const colExpr = rawBlobOk ? "?" : "vector32(?)";

  // ---- libsql exact (brute force, no index) ----
  try {
    await client.execute(`CREATE TABLE docs(id INTEGER PRIMARY KEY, embedding F32_BLOB(${DIM}))`);
    const tb = performance.now();
    const CHUNK = 1000;
    for (let i = 0; i < n; i += CHUNK) {
      const stmts = [];
      for (let j = i; j < Math.min(i + CHUNK, n); j++) {
        stmts.push({ sql: `INSERT INTO docs(id, embedding) VALUES (?, ${colExpr})`, args: [j, toArg(data[j])] });
      }
      await client.batch(stmts, "write");
    }
    const build = performance.now() - tb;
    const lat = [], rec = [];
    for (let qi = 0; qi < NQ; qi++) {
      const a = toArg(queries[qi]);
      const t0 = performance.now();
      const res = await client.execute({ sql: `SELECT id FROM docs ORDER BY vector_distance_cos(embedding, ${colExpr}) LIMIT ${K}`, args: [a] });
      lat.push(performance.now() - t0);
      rec.push(recall(res.rows.map((x) => Number(x.id)), truth[qi]));
    }
    out.push({ engine: `libsql exact${rawBlobOk ? "" : " (text)"}`, build, size: fileSize(lf), p50: pct(lat, 50), p95: pct(lat, 95), recall: rec.reduce((a, b) => a + b, 0) / NQ });
  } catch (e) { out.push({ engine: "libsql exact", error: String(e.message || e) }); }

  // ---- libsql ANN (DiskANN index) ----
  if (!process.env.SKIP_ANN) try {
    const tb = performance.now();
    await client.execute(`CREATE INDEX docs_idx ON docs(libsql_vector_idx(embedding, 'metric=cosine', 'compress_neighbors=float8', 'max_neighbors=20'))`);
    const build = performance.now() - tb;
    const lat = [], rec = [];
    for (let qi = 0; qi < NQ; qi++) {
      const a = toArg(queries[qi]);
      const t0 = performance.now();
      const res = await client.execute({ sql: `SELECT id FROM vector_top_k('docs_idx', ${colExpr}, ${K})`, args: [a] });
      lat.push(performance.now() - t0);
      rec.push(recall(res.rows.map((x) => Number(x.id)), truth[qi]));
    }
    out.push({ engine: "libsql ANN (DiskANN)", build, size: fileSize(lf), p50: pct(lat, 50), p95: pct(lat, 95), recall: rec.reduce((a, b) => a + b, 0) / NQ });
  } catch (e) { out.push({ engine: "libsql ANN (DiskANN)", error: String(e.message || e) }); }

  client.close();

  // ---- print ----
  console.log(`insert mode (libsql): ${rawBlobOk ? "raw F32 blob" : "vector32(text)"}`);
  const pad = (s, w) => String(s).padEnd(w);
  console.log(pad("engine", 24) + pad("build", 12) + pad("size", 10) + pad("q p50", 11) + pad("q p95", 11) + "recall@10");
  console.log("-".repeat(80));
  for (const o of out) {
    if (o.error) { console.log(pad(o.engine, 24) + "ERROR: " + o.error); continue; }
    console.log(
      pad(o.engine, 24) +
      pad(o.build ? ms(o.build) + "ms" : "-", 12) +
      pad(o.size ? mb(o.size) : "-", 10) +
      pad(ms(o.p50) + "ms", 11) +
      pad(ms(o.p95) + "ms", 11) +
      (o.recall * 100).toFixed(1) + "%"
    );
  }
  return out;
}

(async () => {
  console.log(`Versions: @libsql/client, better-sqlite3, sqlite-vec | Node ${process.version} | ${os.arch()}`);
  for (const n of SIZES) await runSize(n);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("\ndone.");
})();
