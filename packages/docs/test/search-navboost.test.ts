import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearch } from "../src/search.ts";

// Navigation nav-boost (keyword typeahead): a SINGLE-word query whose prefix matches a page/section
// NAME lifts that page over docs that merely mention the term a lot. Gated to single-word queries so
// multi-word content queries are pure BM25 (no regression). See search.ts keywordSearch.
const entries = [
  // Mentions "feishu" many times but is NOT named feishu → high BM25, no name match.
  { slug: "adapters", locale: undefined, html: "", data: { title: "Adapters" },
    body: "# Adapters\n\nThe feishu adapter and feishu gateway. Configure feishu here with feishu tokens. feishu feishu." },
  // The actual Feishu page: its TITLE/slug name-matches.
  { slug: "feishu", locale: undefined, html: "", data: { title: "Feishu Lark" },
    body: "# Feishu Lark\n\nMessaging via Lark. Configure the app id and secret." },
  // Only a HEADING name-matches (weaker tier than title/slug).
  { slug: "config", locale: undefined, html: "", data: { title: "Configuration" },
    body: "# Feishu Section\n\nSome feishu config details live here." },
] as never[];

const s = createSearch({ entries });
const kw = (q: string, navBoost: boolean) => s.search(q, { mode: "keyword", prefix: true, navBoost, topK: 10 });

test("navBoost: a single-word name prefix lifts the named page over a body-heavy mention", async () => {
  // Without the boost, the doc that mentions "feishu" most wins on raw BM25.
  const off = await kw("feishu", false);
  assert.equal(off[0]?.slug, "adapters");
  // With the boost, the page NAMED feishu (title/slug match) jumps to #1.
  const on = await kw("feishu", true);
  assert.equal(on[0]?.slug, "feishu");
});

test("navBoost: partial single-word prefix (typeahead) still names the page", async () => {
  for (const q of ["fei", "feis", "feish"]) {
    assert.equal((await kw(q, true))[0]?.slug, "feishu", `"${q}" should name feishu first`);
  }
});

test("navBoost: title/slug tier ranks above a heading-only match", async () => {
  const on = await kw("feishu", true);
  const rank = (slug: string) => on.findIndex((h) => h.slug === slug);
  assert.ok(rank("feishu") < rank("config"), "title match (feishu) beats heading-only match (config)");
});

test("navBoost: a MULTI-word query does not boost — content search is unchanged", async () => {
  // "feishu adapter" is a content query; the boost must NOT fire, so results equal navBoost:false.
  const off = (await kw("feishu adapter", false)).map((h) => h.slug);
  const on = (await kw("feishu adapter", true)).map((h) => h.slug);
  assert.deepEqual(on, off);
  assert.equal(on[0], "adapters"); // the doc actually about the feishu adapter still wins
});
