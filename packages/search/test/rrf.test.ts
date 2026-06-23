import { test } from "node:test";
import assert from "node:assert/strict";
import { rrf, rrfScored } from "../src/rrf.ts";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test("agreement across lists wins over a single-list top rank", () => {
  const keyword = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const semantic = [{ id: "b" }, { id: "d" }, { id: "a" }];
  // b is #2 and #1 → ranked above a (#1 and #3) and the singletons.
  const fused = rrf([{ hits: keyword }, { hits: semantic }], (h) => h.id);
  assert.equal(fused[0]?.id, "b");
});

test("an item in only one list still appears", () => {
  const fused = rrf([{ hits: [{ id: "a" }] }, { hits: [{ id: "z" }] }], (h) => h.id);
  assert.deepEqual(ids(fused).sort(), ["a", "z"]);
});

test("representative is the first-seen payload (list order matters)", () => {
  const kw = [{ id: "a", from: "keyword" }];
  const sem = [{ id: "a", from: "semantic" }];
  assert.equal(rrf([{ hits: kw }, { hits: sem }], (h) => h.id)[0]?.from, "keyword");
  assert.equal(rrf([{ hits: sem }, { hits: kw }], (h) => h.id)[0]?.from, "semantic");
});

test("weight biases the fusion", () => {
  const a = [{ id: "a" }];
  const b = [{ id: "b" }];
  const fused = rrf([{ hits: a, weight: 3 }, { hits: b, weight: 1 }], (h) => h.id);
  assert.equal(fused[0]?.id, "a");
});

test("topK truncates the fused result", () => {
  const l = [{ hits: [{ id: "a" }, { id: "b" }, { id: "c" }] }];
  assert.equal(rrf(l, (h) => h.id, { topK: 2 }).length, 2);
});

test("empty input is safe", () => {
  assert.deepEqual(rrf([], (h: { id: string }) => h.id), []);
  assert.deepEqual(rrf([{ hits: [] }], (h: { id: string }) => h.id), []);
  assert.deepEqual(rrfScored([], (h: { id: string }) => h.id), []);
});

test("rrfScored returns fused scores in descending order, matching rrf's items", () => {
  const kw = [{ id: "a" }, { id: "b" }];
  const sem = [{ id: "b" }, { id: "c" }];
  const lists = [{ hits: kw }, { hits: sem }];
  const scored = rrfScored(lists, (h) => h.id);
  // monotonically non-increasing scores
  for (let i = 1; i < scored.length; i++) assert.ok(scored[i - 1]!.score >= scored[i]!.score);
  // b appears in both lists → top fused score; exact RRF value (k=60)
  assert.equal(scored[0]!.item.id, "b");
  assert.ok(Math.abs(scored[0]!.score - (1 / (60 + 2) + 1 / (60 + 1))) < 1e-12);
  // rrf() is rrfScored() without the scores, same order
  assert.deepEqual(rrf(lists, (h) => h.id), scored.map((r) => r.item));
});
