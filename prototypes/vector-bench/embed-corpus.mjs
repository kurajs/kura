// Embed a real text corpus (all .md across the monorepos) with bge-m3, save to disk.
import { pipeline } from "@huggingface/transformers";
import fs from "node:fs";
import path from "node:path";

const ROOTS = [
  "/Users/linyiru/Projects/labs/june/june-monorepo",
  "/Users/linyiru/Projects/labs/june/kura-monorepo",
];
const SKIP = new Set(["node_modules", ".git", "dist", ".vercel", ".next", "build", ".turbo"]);
const EXT = /\.(md|ts|tsx|js|mjs)$/;
const CAP = 2500; // cap chunks to keep CPU embedding time bounded
const DIM = 1024;

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (EXT.test(e.name)) acc.push(p);
  }
  return acc;
}
function chunk(text, size = 600, overlap = 100) {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
  const out = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, Math.min(i + size, clean.length)).trim());
    i += size - overlap;
  }
  return out.filter((c) => c.length > 40);
}

const files = [];
for (const r of ROOTS) if (fs.existsSync(r)) walk(r, files);
let texts = [];
for (const f of files) for (const c of chunk(fs.readFileSync(f, "utf8"))) texts.push(c);
// deterministic shuffle (mulberry32) then cap
let s = 12345;
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let i = texts.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [texts[i], texts[j]] = [texts[j], texts[i]]; }
if (texts.length > CAP) texts = texts.slice(0, CAP);
console.log(`files: ${files.length}, chunks (capped): ${texts.length}`);

const ex = await pipeline("feature-extraction", "Xenova/bge-m3", { dtype: "q8" });
const N = texts.length;
const emb = new Float32Array(N * DIM);
const B = 32;
const t0 = Date.now();
for (let i = 0; i < N; i += B) {
  const out = await ex(texts.slice(i, i + B), { pooling: "cls", normalize: true });
  emb.set(out.data, i * DIM);
  process.stdout.write(`\rembedded ${Math.min(i + B, N)}/${N}`);
}
console.log(`\nembed time: ${((Date.now() - t0) / 1000).toFixed(1)}s (${((Date.now() - t0) / N).toFixed(1)}ms/chunk)`);

fs.writeFileSync("corpus.f32", Buffer.from(emb.buffer));
fs.writeFileSync("corpus.meta.json", JSON.stringify({ N, DIM }));
console.log(`saved corpus.f32 (${N} x ${DIM})`);
