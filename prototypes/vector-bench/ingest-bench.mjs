// Ingestion ("建檔") benchmark:
//   Part A — @junejs/kura kb.add() + serialize() throughput (the store side)
//   Part B — bge-m3 embedding throughput by batch size, incl. individual (B=1)
//   Part C — end-to-end projection (embedding dominates)
import { Kb } from "../../packages/kura/dist/index.js";
import { pipeline } from "@huggingface/transformers";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DIM = 1024;

// ---------- Part A: store ingestion ----------
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randVec(r) { const v = new Float32Array(DIM); let ss = 0; for (let d = 0; d < DIM; d++) { const x = r() * 2 - 1; v[d] = x; ss += x * x; } const inv = 1 / (Math.sqrt(ss) || 1); for (let d = 0; d < DIM; d++) v[d] *= inv; return v; }

console.log("=== Part A: kb.add() + serialize() throughput (store side) ===");
console.log("N".padEnd(12) + "add".padEnd(14) + "add/1k".padEnd(12) + "serialize".padEnd(12) + "size");
console.log("-".repeat(58));
for (const N of [10000, 100000, 200000]) {
  const r = mulberry32(N);
  const kb = new Kb({ dim: DIM });
  const BATCH = 10000;
  const tAdd0 = performance.now();
  for (let i = 0; i < N; i += BATCH) {
    const recs = [];
    for (let j = i; j < Math.min(i + BATCH, N); j++) recs.push({ id: "d" + j, vector: randVec(r), data: { j } });
    kb.add(recs);
  }
  const addMs = performance.now() - tAdd0;
  const tSer0 = performance.now();
  const bytes = kb.serialize();
  const serMs = performance.now() - tSer0;
  console.log(
    String(N.toLocaleString()).padEnd(12) +
    (addMs / 1000).toFixed(2).concat("s").padEnd(14) +
    (addMs / N * 1000).toFixed(2).concat("ms").padEnd(12) +
    (serMs / 1000).toFixed(2).concat("s").padEnd(12) +
    (bytes.byteLength / 1048576).toFixed(0) + "MB",
  );
}

// ---------- Part B: embedding throughput by batch size ----------
const SKIP = new Set(["node_modules", ".git", "dist", ".vercel", ".turbo"]);
function walk(dir, acc) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, acc); else if (/\.(md|ts|js)$/.test(e.name)) acc.push(p); } return acc; }
function chunk(t, size = 600, overlap = 100) { const c = t.replace(/\r/g, ""); const out = []; let i = 0; while (i < c.length) { out.push(c.slice(i, Math.min(i + size, c.length)).trim()); i += size - overlap; } return out.filter((x) => x.length > 40); }

const files = walk("/Users/linyiru/Projects/labs/june/june-monorepo", []);
let texts = [];
for (const f of files) { for (const ch of chunk(fs.readFileSync(f, "utf8"))) { texts.push(ch); if (texts.length >= 128) break; } if (texts.length >= 128) break; }
console.log(`\n=== Part B: bge-m3 embedding throughput (${texts.length} real chunks, q8 CPU) ===`);

const ex = await pipeline("feature-extraction", "Xenova/bge-m3", { dtype: "q8" });
async function run(B) {
  await ex(texts.slice(0, Math.min(B, texts.length)), { pooling: "cls", normalize: true }); // warmup
  const t0 = performance.now();
  for (let i = 0; i < texts.length; i += B) await ex(texts.slice(i, i + B), { pooling: "cls", normalize: true });
  const ms = performance.now() - t0;
  return { msPerChunk: ms / texts.length, perSec: texts.length / (ms / 1000) };
}
console.log("batch".padEnd(10) + "ms/chunk".padEnd(14) + "chunks/sec");
console.log("-".repeat(40));
let best = Infinity;
for (const B of [1, 8, 16, 32, 64]) {
  const { msPerChunk, perSec } = await run(B);
  best = Math.min(best, msPerChunk);
  console.log((B === 1 ? "1 (indiv)" : String(B)).padEnd(10) + msPerChunk.toFixed(1).concat("ms").padEnd(14) + perSec.toFixed(1));
}

// ---------- Part C: end-to-end projection ----------
console.log(`\n=== Part C: projected total build time (best ${best.toFixed(0)}ms/chunk embedding + store) ===`);
console.log("chunks".padEnd(12) + "embedding".padEnd(16) + "store(add+ser, est)".padEnd(22) + "total");
console.log("-".repeat(60));
for (const N of [1000, 10000, 100000, 1000000]) {
  const emb = best * N / 1000; // seconds
  const store = N / 200000 * 1.2; // ~1.2s per 200k from Part A, rough
  const fmt = (s) => s >= 60 ? (s / 60).toFixed(1) + "min" : s.toFixed(1) + "s";
  console.log(String(N.toLocaleString()).padEnd(12) + fmt(emb).padEnd(16) + fmt(store).padEnd(22) + fmt(emb + store));
}
console.log("\ndone.");
