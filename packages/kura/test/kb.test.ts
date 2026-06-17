import { test } from "node:test";
import assert from "node:assert/strict";
import { Kb, type KbRecord } from "../src/kb.ts";

const DIM = 256;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function randn(r: () => number) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function norm(v: Float32Array) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; s = Math.sqrt(s) || 1; for (let i = 0; i < v.length; i++) v[i] /= s; return v; }

function makeRecords(n: number, sigma: number, seed = 1): KbRecord<{ k: number }>[] {
  const r = mulberry32(seed);
  const C = 20;
  const centroids = Array.from({ length: C }, () => norm(Float32Array.from({ length: DIM }, () => randn(r))));
  const recs: KbRecord<{ k: number }>[] = [];
  for (let i = 0; i < n; i++) {
    const k = (r() * C) | 0;
    const c = centroids[k];
    const v = new Float32Array(DIM);
    for (let d = 0; d < DIM; d++) v[d] = c[d] + sigma * randn(r);
    recs.push({ id: `doc-${i}`, vector: norm(v), data: { k } });
  }
  return recs;
}

function referenceTopK(recs: KbRecord<{ k: number }>[], q: Float32Array, k: number): string[] {
  const scored = recs.map((rec) => {
    let dot = 0;
    for (let d = 0; d < DIM; d++) dot += (rec.vector as Float32Array)[d] * q[d];
    return [rec.id, dot] as [string, number];
  });
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, k).map((x) => x[0]);
}

test("exact path returns the true top-k", () => {
  const recs = makeRecords(500, 0.3, 7);
  const kb = Kb.from(recs, { dim: DIM, exactThreshold: 10000 });
  const q = recs[42].vector as Float32Array;
  const hits = kb.search(q, { topK: 10 });
  assert.equal(hits.length, 10);
  assert.equal(hits[0].id, "doc-42"); // a vector is its own nearest neighbor
  assert.deepEqual(hits.map((h) => h.id), referenceTopK(recs, q, 10));
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].score >= hits[i].score, "scores descending");
  assert.equal(hits[0].data.k, recs[42].data!.k);
});

test("ann path with full rerank depth == exact result", () => {
  const recs = makeRecords(2000, 0.3, 11);
  const ann = Kb.from(recs, { dim: DIM, exactThreshold: 0 }); // force ANN path
  const exact = Kb.from(recs, { dim: DIM, exactThreshold: 10_000 });
  for (const qi of [0, 123, 999, 1500]) {
    const q = recs[qi].vector as Float32Array;
    const a = ann.search(q, { topK: 10, rerankDepth: recs.length });
    const e = exact.search(q, { topK: 10 });
    assert.deepEqual(a.map((h) => h.id), e.map((h) => h.id), `qi=${qi}`);
  }
});

test("ann path with default depth has high recall on clustered data", () => {
  const recs = makeRecords(5000, 0.1, 13); // tight clusters
  const kb = Kb.from(recs, { dim: DIM, exactThreshold: 0 });
  let hit = 0, total = 0;
  for (let qi = 0; qi < 50; qi++) {
    const q = recs[qi * 73 % recs.length].vector as Float32Array;
    const got = new Set(kb.search(q, { topK: 10 }).map((h) => h.id));
    const truth = referenceTopK(recs, q, 10);
    for (const t of truth) if (got.has(t)) hit++;
    total += truth.length;
  }
  const recall = hit / total;
  assert.ok(recall >= 0.9, `recall ${recall} should be >= 0.9`);
});

test("serialize / load round-trips and preserves search", () => {
  const recs = makeRecords(1500, 0.2, 17);
  const kb = Kb.from(recs, { dim: DIM, exactThreshold: 500 });
  const bytes = kb.serialize();
  const loaded = Kb.load<{ k: number }>(bytes);
  assert.equal(loaded.size, kb.size);
  for (const qi of [5, 500, 1234]) {
    const q = recs[qi].vector as Float32Array;
    assert.deepEqual(
      loaded.search(q, { topK: 8 }).map((h) => [h.id, h.data.k]),
      kb.search(q, { topK: 8 }).map((h) => [h.id, h.data.k]),
    );
  }
});

test("searchText uses the configured embedder", async () => {
  const recs = makeRecords(300, 0.3, 19);
  const fakeEmbed = (text: string) => (recs[Number(text)].vector as Float32Array);
  const kb = Kb.from(recs, { dim: DIM, embed: fakeEmbed });
  const hits = await kb.searchText("42", { topK: 5 });
  assert.equal(hits[0].id, "doc-42");
});

test("dynamic: upsert updates in place and is searchable immediately", () => {
  const recs = makeRecords(300, 0.3, 29);
  const kb = Kb.from(recs, { dim: DIM, exactThreshold: 0 }); // ANN path
  // a brand-new doc, embedded as a near-duplicate of doc-100
  const near = Float32Array.from(recs[100].vector as Float32Array);
  near[0] += 0.01;
  kb.upsert({ id: "live", vector: norm(near), data: { k: -1 } });
  assert.equal(kb.size, 301);
  assert.ok(kb.has("live"));
  // immediately retrievable as a top neighbor of doc-100
  const hits = kb.search(recs[100].vector as Float32Array, { topK: 5 });
  assert.ok(hits.some((h) => h.id === "live"), "new doc searchable with no rebuild");

  // update its embedding to point elsewhere; in place, still 301
  kb.upsert({ id: "live", vector: recs[200].vector as Float32Array, data: { k: -2 } });
  assert.equal(kb.size, 301);
  const h2 = kb.search(recs[200].vector as Float32Array, { topK: 3 });
  assert.equal(h2.find((h) => h.id === "live")?.data.k, -2, "updated vector + data reflected");
});

test("dynamic: delete swap-removes and keeps others searchable", () => {
  const recs = makeRecords(200, 0.2, 31);
  const kb = Kb.from(recs, { dim: DIM, exactThreshold: 1000 }); // exact path
  assert.equal(kb.delete("doc-50"), true);
  assert.equal(kb.delete("doc-50"), false); // already gone
  assert.equal(kb.size, 199);
  assert.ok(!kb.has("doc-50"));
  // deleted doc no longer returned even when querying its own old vector
  const hits = kb.search(recs[50].vector as Float32Array, { topK: 10 });
  assert.ok(!hits.some((h) => h.id === "doc-50"));
  // a moved record (the former last one) is still correct
  const lastId = "doc-199";
  const lh = kb.search(recs[199].vector as Float32Array, { topK: 1 });
  assert.equal(lh[0].id, lastId);
  // serialize after mutations round-trips
  const loaded = Kb.load<{ k: number }>(kb.serialize());
  assert.equal(loaded.size, 199);
  assert.ok(!loaded.has("doc-50"));
});

test("guards: dim mismatch throws, topK clamps, empty returns []", () => {
  const kb = Kb.from(makeRecords(50, 0.3, 23), { dim: DIM });
  assert.throws(() => kb.search(new Float32Array(10)), /query length/);
  assert.equal(kb.search(makeRecords(1, 0.3, 1)[0].vector as Float32Array, { topK: 999 }).length, 50);
  assert.equal(new Kb({ dim: DIM }).search(new Float32Array(DIM)).length, 0);
});
