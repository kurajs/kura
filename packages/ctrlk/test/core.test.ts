import assert from "node:assert/strict";
import { test } from "node:test";
import { createCtrlk, defaultFilter } from "../src/core.ts";
import { highlight } from "../src/highlight.ts";
import type { CtrlkItem } from "../src/types.ts";

const items: CtrlkItem[] = [
  { id: "a", title: "Getting started", group: "Guides" },
  { id: "b", title: "Deploy to Cloudflare", group: "Guides", keywords: ["workers"] },
  { id: "c", title: "Search configuration", group: "Reference" },
];

test("static mode filters, ranks, and buckets by group", () => {
  const ck = createCtrlk({ items });
  ck.open();
  ck.setQuery("config");
  const s = ck.getState();
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0]!.id, "c");
  assert.equal(s.groups.length, 1);
  assert.equal(s.groups[0]!.label, "Reference");
});

test("empty query shows the configured suggestions", () => {
  const empty: CtrlkItem[] = [{ id: "z", title: "Recent" }];
  const ck = createCtrlk({ items, empty });
  ck.open();
  assert.deepEqual(ck.getState().items.map((i) => i.id), ["z"]);
});

test("move wraps and clamps; activeIndex resets to 0 on new results", () => {
  const ck = createCtrlk({ items });
  ck.open();
  ck.setQuery(""); // all three, ungrouped suggestions default to full pool
  assert.equal(ck.getState().activeIndex, 0);
  ck.move(-1);
  assert.equal(ck.getState().activeIndex, ck.getState().items.length - 1); // wrap up from top
  ck.move(1);
  assert.equal(ck.getState().activeIndex, 0); // wrap back to top
  ck.setQuery("e"); // new results → reset to 0
  assert.equal(ck.getState().activeIndex, 0);
});

test("select fires onSelect with the active item", () => {
  let chosen: string | null = null;
  const ck = createCtrlk({ items, onSelect: (it) => { chosen = it.id; } });
  ck.open();
  ck.setQuery("deploy");
  ck.select();
  assert.equal(chosen, "b");
});

test("async mode: only the latest resolve applies (stale results ignored)", async () => {
  const resolvers: Array<(v: CtrlkItem[]) => void> = [];
  const ck = createCtrlk({
    debounce: 0,
    search: (q) => new Promise<CtrlkItem[]>((res) => { resolvers.push(() => res([{ id: q, title: q }])); }),
  });
  ck.open();
  ck.setQuery("first");
  await tick();
  ck.setQuery("second");
  await tick();
  // Resolve the FIRST (stale) request last — it must be discarded in favor of "second".
  resolvers[1]!(); // second
  resolvers[0]!(); // first (stale)
  await tick();
  assert.deepEqual(ck.getState().items.map((i) => i.id), ["second"]);
});

test("defaultFilter: substring beats subsequence", () => {
  const sub = defaultFilter({ id: "1", title: "search config" }, "config");
  const seq = defaultFilter({ id: "2", title: "code of งคน fig" }, "config");
  assert.ok(sub > seq);
  assert.equal(defaultFilter({ id: "3", title: "nope" }, "zzz"), 0);
});

test("highlight merges overlapping token ranges and preserves case", () => {
  const segs = highlight("Deploy to Cloudflare", ["deploy", "cloud"]);
  assert.deepEqual(segs, [
    { text: "Deploy", match: true },
    { text: " to ", match: false },
    { text: "Cloud", match: true },
    { text: "flare", match: false },
  ]);
  assert.deepEqual(highlight("plain", []), [{ text: "plain", match: false }]);
});

test("async mode: a rejected search surfaces the error and clears loading", async () => {
  const ck = createCtrlk({ debounce: 0, search: () => Promise.reject(new Error("boom")) });
  ck.open();
  ck.setQuery("x");
  await tick();
  const s = ck.getState();
  assert.equal(s.loading, false);
  assert.equal(s.error?.message, "boom");
  assert.deepEqual(s.items, []);
});

test("async mode: closing aborts the in-flight request (its late resolve is dropped)", async () => {
  let sawAbort = false;
  let resolve!: (v: CtrlkItem[]) => void;
  const ck = createCtrlk({
    debounce: 0,
    search: (q, signal) => {
      signal.addEventListener("abort", () => { sawAbort = true; });
      return new Promise<CtrlkItem[]>((r) => { resolve = r; });
    },
  });
  ck.open();
  ck.setQuery("q");
  await tick();
  ck.close();
  assert.equal(sawAbort, true);
  resolve([{ id: "late", title: "late" }]); // resolves after abort → must not apply
  await tick();
  assert.deepEqual(ck.getState().items, []);
});

test("setActive clamps into range and no-ops on an empty list", () => {
  const ck = createCtrlk({ items });
  ck.open();
  ck.setQuery("");
  ck.setActive(99);
  assert.equal(ck.getState().activeIndex, items.length - 1);
  ck.setActive(-5);
  assert.equal(ck.getState().activeIndex, 0);
  ck.setQuery("zzz-nothing"); // empty result set
  ck.setActive(0); // no-op (no items)
  assert.equal(ck.getState().activeIndex, -1);
});

test("move and select no-op on an empty result set", () => {
  let called = false;
  const ck = createCtrlk({ items, onSelect: () => { called = true; } });
  ck.open();
  ck.setQuery("zzz-nothing");
  ck.move(1); // no throw, no change
  assert.equal(ck.getState().activeIndex, -1);
  ck.select(); // nothing active → onSelect not called
  assert.equal(called, false);
});

test("open/close/toggle drive the open flag and notify subscribers", () => {
  const seen: boolean[] = [];
  const ck = createCtrlk({ items });
  // The open flag may emit more than once per transition (e.g. open + the items-applied emit);
  // assert the sequence of DISTINCT transitions, which is the contract that matters.
  ck.subscribe((s) => { if (seen[seen.length - 1] !== s.open) seen.push(s.open); });
  ck.open();
  ck.open(); // idempotent — no transition
  ck.toggle(); // → close
  ck.toggle(); // → open
  ck.close();
  assert.deepEqual(seen, [false, true, false, true, false]);
});

test("setQuery with an unchanged value does not re-run", () => {
  let runs = 0;
  const ck = createCtrlk({ items, filter: (it, q) => { runs++; return it.title.includes(q) ? 1 : 0; } });
  ck.open(); // runs once for the initial (empty) schedule — empty short-circuits, no filter calls
  ck.setQuery("a");
  const after = runs;
  ck.setQuery("a"); // identical → ignored
  assert.equal(runs, after);
});

test("destroy clears subscribers", () => {
  let hits = 0;
  const ck = createCtrlk({ items });
  ck.subscribe(() => { hits++; });
  const baseline = hits;
  ck.destroy();
  ck.open(); // no subscribers left → no notifications
  assert.equal(hits, baseline);
});

test("defaultFilter: a non-substring subsequence still matches (weakly)", () => {
  assert.ok(defaultFilter({ id: "1", title: "configuration" }, "cfg") > 0);
});

test("highlight: overlapping ranges merge; a non-occurring token yields one plain segment", () => {
  assert.deepEqual(highlight("deploy", ["dep", "ploy"]), [{ text: "deploy", match: true }]);
  assert.deepEqual(highlight("hello", ["zzz"]), [{ text: "hello", match: false }]);
});

// --- cmdk-parity options (B value/onValueChange, C onOpenChange, D loop, F shouldFilter) ---

test("loop:false clamps arrow navigation at the ends instead of wrapping", () => {
  const ck = createCtrlk({ items, loop: false });
  ck.open();
  ck.setQuery("");
  ck.move(-1); // already at 0 → clamp, stays
  assert.equal(ck.getState().activeIndex, 0);
  ck.move(99); // → last, clamped
  assert.equal(ck.getState().activeIndex, items.length - 1);
  ck.move(1); // at end → clamp, stays
  assert.equal(ck.getState().activeIndex, items.length - 1);
});

test("onOpenChange fires on each open/close transition", () => {
  const opens: boolean[] = [];
  const ck = createCtrlk({ items, onOpenChange: (o) => opens.push(o) });
  ck.open();
  ck.open(); // idempotent
  ck.toggle(); // close
  ck.close(); // idempotent
  assert.deepEqual(opens, [true, false]);
});

test("state.value mirrors the active item id and onValueChange fires on change", () => {
  const values: (string | null)[] = [];
  const ck = createCtrlk({ items, onValueChange: (v) => values.push(v) });
  ck.open();
  ck.setQuery(""); // all items, active → first ("a")
  assert.equal(ck.getState().value, "a");
  ck.move(1);
  assert.equal(ck.getState().value, ck.getState().items[1]!.id);
  assert.ok(values.includes("a"));
});

test("initial `value` option highlights that row on the first results", () => {
  const ck = createCtrlk({ items, value: "c" });
  ck.open();
  ck.setQuery("");
  assert.equal(ck.getState().value, "c");
  assert.equal(ck.getState().items[ck.getState().activeIndex]!.id, "c");
});

test("setValue highlights by id; null clears it", () => {
  const ck = createCtrlk({ items });
  ck.open();
  ck.setQuery("");
  ck.setValue("b");
  assert.equal(ck.getState().value, "b");
  ck.setValue("does-not-exist"); // no-op
  assert.equal(ck.getState().value, "b");
  ck.setValue(null);
  assert.equal(ck.getState().value, null);
  assert.equal(ck.getState().activeIndex, -1);
});

test("shouldFilter:false shows the pool as-is; setItems swaps it and keeps the active row", () => {
  const ck = createCtrlk({ items, shouldFilter: false });
  ck.open();
  ck.setQuery("config"); // ignored — no filtering
  assert.equal(ck.getState().items.length, items.length);
  ck.setValue("b");
  ck.setItems([{ id: "b", title: "B kept" }, { id: "x", title: "X new" }]); // "b" survives → stays active
  assert.deepEqual(ck.getState().items.map((i) => i.id), ["b", "x"]);
  assert.equal(ck.getState().value, "b");
});

const tick = () => new Promise((r) => setTimeout(r, 5));
