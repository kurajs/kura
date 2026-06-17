// Real Traditional-Chinese retrieval eval for @junejs/kura on DRCD.
// Corpus = DRCD paragraphs; queries = DRCD questions (known relevant paragraph).
// Embeds with the real local adapter (bge-m3), caches vectors, measures recall@k + MRR.
import { Kb } from "../../packages/kura/dist/index.js";
import { transformers } from "../../packages/kura-transformers/dist/index.js";
import fs from "node:fs";
import { performance } from "node:perf_hooks";

const DIM = 1024;
const NQ = 500; // sampled questions
const dir = "drcd";

// ---- parse DRCD ----
const drcd = JSON.parse(fs.readFileSync(`${dir}/DRCD_test.json`, "utf8"));
const paras = []; // { id, text, title }
const qas = [];   // { q, paraId }
let pi = 0;
for (const art of drcd.data) {
  for (const p of art.paragraphs) {
    const id = `p${pi++}`;
    paras.push({ id, text: p.context, title: art.title });
    for (const qa of p.qas) qas.push({ q: qa.question, paraId: id });
  }
}
console.log(`paragraphs: ${paras.length}, questions: ${qas.length}`);

// deterministic sample of questions
let s = 42;
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffled = [...qas];
for (let i = shuffled.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
const sample = shuffled.slice(0, NQ);

// ---- embed (cached) ----
const embedder = transformers(); // bge-m3, local
async function embedCached(texts, cacheFile) {
  if (fs.existsSync(cacheFile)) {
    const b = fs.readFileSync(cacheFile);
    const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    if (f.length === texts.length * DIM) { console.log(`  loaded ${texts.length} from ${cacheFile}`); return f; }
  }
  console.log(`  embedding ${texts.length} (bge-m3, CPU)...`);
  const t0 = performance.now();
  const vecs = await embedder.embed(texts);
  console.log(`  done in ${((performance.now() - t0) / 1000).toFixed(1)}s (${((performance.now() - t0) / texts.length).toFixed(0)}ms/text)`);
  const flat = new Float32Array(texts.length * DIM);
  for (let i = 0; i < vecs.length; i++) flat.set(vecs[i], i * DIM);
  fs.writeFileSync(cacheFile, Buffer.from(flat.buffer));
  return flat;
}

console.log("\nembedding corpus:");
const pFlat = await embedCached(paras.map((p) => p.text), `${dir}/para.f32`);
console.log("embedding queries:");
const qFlat = await embedCached(sample.map((x) => x.q), `${dir}/q${NQ}.f32`);

// ---- build Kb and evaluate ----
function buildKb(exactThreshold) {
  const kb = new Kb({ dim: DIM, exactThreshold });
  kb.add(paras.map((p, i) => ({ id: p.id, vector: pFlat.subarray(i * DIM, (i + 1) * DIM), data: { title: p.title } })));
  return kb;
}
function evaluate(kb) {
  let r1 = 0, r5 = 0, r10 = 0, mrr = 0;
  const lat = [];
  for (let i = 0; i < sample.length; i++) {
    const q = qFlat.subarray(i * DIM, (i + 1) * DIM);
    const t0 = performance.now();
    const hits = kb.search(q, { topK: 10 });
    lat.push(performance.now() - t0);
    const rank = hits.findIndex((h) => h.id === sample[i].paraId) + 1; // 0 if absent
    if (rank === 1) r1++;
    if (rank >= 1 && rank <= 5) r5++;
    if (rank >= 1 && rank <= 10) r10++;
    if (rank >= 1) mrr += 1 / rank;
  }
  const n = sample.length;
  const p50 = [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)];
  return { r1: r1 / n, r5: r5 / n, r10: r10 / n, mrr: mrr / n, p50 };
}

console.log(`\n=== @kurajs/core retrieval on DRCD (${paras.length} paras, ${sample.length} questions, bge-m3) ===`);
console.log("path".padEnd(20) + "R@1".padEnd(9) + "R@5".padEnd(9) + "R@10".padEnd(9) + "MRR".padEnd(9) + "q p50");
console.log("-".repeat(64));
for (const [name, thr] of [["exact f32", 100000], ["binary+rerank", 0]]) {
  const e = evaluate(buildKb(thr));
  const pct = (x) => (x * 100).toFixed(1) + "%";
  console.log(name.padEnd(20) + pct(e.r1).padEnd(9) + pct(e.r5).padEnd(9) + pct(e.r10).padEnd(9) + e.mrr.toFixed(3).padEnd(9) + e.p50.toFixed(2) + "ms");
}
console.log("\ndone.");
