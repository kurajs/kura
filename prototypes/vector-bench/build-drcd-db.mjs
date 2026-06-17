// Build a real SQLite database from DRCD (Taiwan Wikipedia paragraphs) + their
// cached bge-m3 embeddings, for the June example app to query.
import Database from "better-sqlite3";
import fs from "node:fs";

const DIM = 1024;
const OUT = "../../examples/search/kura.db";

const drcd = JSON.parse(fs.readFileSync("drcd/DRCD_test.json", "utf8"));
const paras = [];
let pi = 0;
for (const art of drcd.data) for (const p of art.paragraphs) paras.push({ id: `p${pi++}`, title: art.title, text: p.context });

const buf = fs.readFileSync("drcd/para.f32");
const emb = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
if (emb.length !== paras.length * DIM) throw new Error(`embedding mismatch: ${emb.length} vs ${paras.length * DIM} (run drcd-eval.mjs first to cache para.f32)`);

fs.rmSync(OUT, { force: true });
const db = new Database(OUT);
db.exec("CREATE TABLE docs (id TEXT PRIMARY KEY, title TEXT, text TEXT, embedding BLOB)");
const ins = db.prepare("INSERT INTO docs (id, title, text, embedding) VALUES (?, ?, ?, ?)");
const tx = db.transaction(() => {
  for (let i = 0; i < paras.length; i++) {
    const e = emb.subarray(i * DIM, (i + 1) * DIM);
    ins.run(paras[i].id, paras[i].title, paras[i].text, Buffer.from(e.buffer, e.byteOffset, DIM * 4));
  }
});
tx();
const n = db.prepare("SELECT count(*) AS n FROM docs").get().n;
db.close();
console.log(`wrote ${n} docs (with ${DIM}-dim embeddings) -> ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)}MB)`);
