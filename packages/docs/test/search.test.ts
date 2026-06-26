import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearch, splitByHeadings } from "../src/search.ts";
import { processHtml } from "../src/nav.ts";
import type { DocLike } from "../src/nav.ts";
import type { Embedder } from "@kurajs/core";

// Deterministic fake embedder: a text's vector marks which keyword "markers" it contains,
// plus a baseline dim so a marker-free text is never an all-zero (NaN-on-normalize) vector.
function fakeEmbedder(markers: string[]): Embedder {
  const dim = markers.length + 1;
  return {
    id: "fake",
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((t) => {
        const lc = t.toLowerCase();
        const v = new Float32Array(dim);
        v[markers.length] = 0.1; // baseline
        markers.forEach((m, i) => { if (lc.includes(m)) v[i] = 1; });
        const norm = Math.hypot(...v) || 1;
        for (let i = 0; i < dim; i++) v[i] /= norm;
        return v;
      });
    },
  };
}

const entries: DocLike[] = [
  { slug: "vec", locale: "zh-TW", data: { title: "向量搜尋", section: "概念" }, body: "本文介紹向量搜尋引擎如何運作與索引建立。" },
  { slug: "db", locale: "zh-TW", data: { title: "資料庫", section: "概念" }, body: "資料庫索引、查詢最佳化與儲存結構。" },
  { slug: "tok", locale: "ja", data: { title: "トークナイザ", section: "概念" }, body: "日本語の単語分割と全文検索の仕組みを説明します。" },
  { slug: "intro", locale: "en", data: { title: "Introduction", section: "Guide" }, body: "A quick introduction to the search engine and indexing." },
] as unknown as DocLike[];

test("keyword search (no embedder) segments CJK per locale via the default tokenizer", async () => {
  const search = createSearch({ entries });
  const top = async (q: string, locale?: string) => (await search.search(q, { topK: 3, locale }))[0]?.slug;

  assert.equal(await top("向量搜尋", "zh-TW"), "vec"); // Chinese, word-segmented
  assert.equal(await top("資料庫", "zh-TW"), "db");
  assert.equal(await top("単語分割", "ja"), "tok"); // Japanese, word-segmented
  assert.equal(await top("indexing", "en"), "intro"); // Latin still works
});

test("a custom per-locale tokenizer override is honored", async () => {
  let called = false;
  const search = createSearch({
    entries,
    tokenizer: () => (text: string) => { called = true; return text.toLowerCase().split(/\s+/).filter(Boolean); },
  });
  await search.search("introduction", { locale: "en" });
  assert.ok(called, "the provided tokenizer resolver should be used");
});

test("empty indexBytes (the --no-embed stub) builds from entries, not Kb.load(empty)", async () => {
  // `kura build --no-embed` writes INDEX_B64 = "" → a 0-length Uint8Array. It must be treated as
  // "no index" (build the KB from entries), NOT passed to Kb.load — which throws on empty bytes and
  // was the original --no-embed failure mode (empty behaving differently than undefined).
  const search = createSearch({ entries, indexBytes: new Uint8Array(0), embedder: fakeEmbedder(["索引"]) });
  const kb = await search.getKb(); // resolves (built from entries) instead of throwing on empty bytes
  assert.ok(kb, "getKb should build from entries when index bytes are empty");
  assert.deepEqual(
    await createSearch({ entries, indexBytes: undefined, embedder: fakeEmbedder(["索引"]) }).getKb() !== null,
    kb !== null,
    "empty index bytes behave the same as undefined",
  );
});

test("keyword snippet aligns with BM25 tokenization for punctuated queries", async () => {
  // Body padded so a naive (start-of-doc) snippet would miss the match. BM25 tokenizes
  // "react/redux" → ["react","redux"]; the snippet must use the same tokenization (not a
  // whitespace split, which would look for the literal "react/redux" and not find it).
  const body =
    "Introductory filler text padding the very start of this document so that a naive snippet " +
    "would begin here and never reach the relevant part of the page at all, truly. " +
    "Later on the guide explains how to wire React and Redux together for predictable state.";
  const doc = [{ slug: "d", data: { title: "Guide", section: "" }, body }] as unknown as DocLike[];

  const hits = await createSearch({ entries: doc }).search("react/redux");
  assert.equal(hits[0]?.slug, "d");
  assert.ok(/redux/i.test(hits[0]!.text), "snippet should land on the matched term, not the doc start");
});

test("keyword search ranks the doc with the rare query term first", async () => {
  const docs = [
    { slug: "a", data: { title: "Intro", section: "" }, body: "general overview and getting started" },
    { slug: "b", data: { title: "Kubernetes", section: "" }, body: "deploying to a kubernetes cluster with helm" },
  ] as unknown as DocLike[];
  const hits = await createSearch({ entries: docs }).search("kubernetes deployment");
  assert.equal(hits[0]?.slug, "b");
});

test("keyword-only search breaks same-slug locale ties toward the reader's locale", async () => {
  // Identical bodies → identical BM25 scores → tie; the reader's locale variant should win.
  const docs = [
    { slug: "p", locale: "en", data: { title: "P", section: "" }, body: "alpha alpha alpha beta gamma" },
    { slug: "p", locale: "ja", data: { title: "P", section: "" }, body: "alpha alpha alpha beta gamma" },
  ] as unknown as DocLike[];
  const search = createSearch({ entries: docs }); // no embedder → keyword path
  assert.equal((await search.search("alpha", { locale: "ja" }))[0]?.locale, "ja");
  assert.equal((await search.search("alpha", { locale: "en" }))[0]?.locale, "en");
});

test("keyword snippet lands on a whole-token match, not a substring inside a word", async () => {
  const body =
    "A long preamble of filler so the start-of-doc snippet is clearly different here indeed. " +
    "We first discuss concatenation of strings, then later mention a cat in the final sentence.";
  const entries = [{ slug: "d", data: { title: "Guide", section: "" }, body }] as unknown as DocLike[];
  // BM25 matches the whole token "cat"; the snippet must land on the standalone "cat"
  // (near "final"), not on "concatenation" at the document start.
  const hits = await createSearch({ entries }).search("cat");
  assert.equal(hits[0]?.slug, "d");
  assert.ok(/final/i.test(hits[0]!.text), "snippet should land on whole-word 'cat', not 'concatenation'");
});

test("keyword snippet handles CJK queries (no whitespace word boundaries)", async () => {
  // CJK has no whitespace, so the word-boundary regex can't match between Han chars; the
  // snippet must fall back to the term's position rather than start-of-doc.
  const body = "前言內容佔據文件開頭很長一段文字所以天真的摘要會從這裡開始而錯過重點直到後段我們才提到向量搜尋引擎這個關鍵詞作結尾。";
  const entries = [{ slug: "z", locale: "zh-TW", data: { title: "說明", section: "" }, body }] as unknown as DocLike[];
  const hits = await createSearch({ entries }).search("向量搜尋", { locale: "zh-TW" });
  assert.equal(hits[0]?.slug, "z");
  assert.ok(hits[0]!.text.includes("向量搜尋"), "CJK snippet should land on the matched term");
});

test("splitByHeadings splits on ##/###, keeps an intro section, and ignores fenced code", () => {
  const body = [
    "Intro paragraph before any heading.",
    "## Installation",
    "Run the installer.",
    "```sh",
    "## not a heading (inside a fence)",
    "```",
    "### Advanced",
    "Tweak the config.",
  ].join("\n");
  const secs = splitByHeadings(body);
  assert.deepEqual(secs.map((s) => s.headingId), ["", "installation", "advanced"]);
  assert.equal(secs[1]!.heading, "Installation");
  assert.ok(secs[1]!.text.includes("not a heading"), "fenced ## stays in its section, not split out");
  // empty body → a single intro section (never zero), so every doc indexes at least once
  assert.deepEqual(splitByHeadings("").map((s) => s.headingId), [""]);
});

test("splitByHeadings: splits h4 and de-dups repeats, matching processHtml's anchor ids exactly", () => {
  const body = ["## Setup", "a", "### Setup", "b", "#### Details", "c"].join("\n");
  const ids = splitByHeadings(body).map((s) => s.headingId);
  assert.deepEqual(ids, ["setup", "setup-1", "details"]); // h4 split + de-dup
  // The cross-module invariant search.ts relies on: the same headings rendered to HTML get the SAME
  // ids (incl. de-dup), so a search hit's `#id` always resolves to the right rendered anchor.
  const { toc } = processHtml("<h2>Setup</h2><h3>Setup</h3><h4>Details</h4>");
  assert.deepEqual(toc.map((h) => h.id), ids);
});

test("keyword search returns the matching heading's anchor for deep-linking", async () => {
  const doc = [{
    slug: "guide",
    data: { title: "Guide", section: "Docs" },
    body: [
      "Overview of the whole guide and what it covers.",
      "## Installation",
      "Install the package and set the binary path.",
      "## Deployment",
      "Deploy to the edge with workers, configure routes and secrets.",
    ].join("\n"),
  }] as unknown as DocLike[];
  const hits = await createSearch({ entries: doc }).search("deployment edge workers");
  assert.equal(hits[0]?.slug, "guide");
  assert.equal(hits[0]?.headingId, "deployment"); // aligns with nav.slugify → #deployment exists
  assert.equal(hits[0]?.heading, "Deployment");
});

test("maxPerPage caps how many headings of one page appear in the results", async () => {
  const body = ["alpha intro", "## A", "alpha one", "## B", "alpha two", "## C", "alpha three", "## D", "alpha four"].join("\n");
  const doc = [{ slug: "p", data: { title: "P", section: "" }, body }] as unknown as DocLike[];
  const hits = await createSearch({ entries: doc }).search("alpha", { topK: 8, maxPerPage: 2 });
  assert.equal(hits.filter((h) => h.slug === "p").length, 2);
});

test("mode:'keyword' returns results without embedding the query (typeahead fast path)", async () => {
  let embeds = 0;
  const base = fakeEmbedder(["alpha"]);
  const counting: Embedder = { ...base, embed: async (t) => { embeds++; return base.embed(t); } };
  const doc = [{ slug: "p", data: { title: "Alpha guide", section: "" }, body: "alpha is covered here in this section thoroughly" }] as unknown as DocLike[];
  const search = createSearch({ entries: doc, embedder: counting, warm: false });
  const hits = await search.search("alpha", { mode: "keyword" });
  assert.equal(hits[0]?.slug, "p");
  assert.equal(embeds, 0, "keyword mode must not embed the query");
});

test("hybrid (embedder) fuses keyword + semantic and de-dups locale variants by slug", async () => {
  // Same slug "a" in two locales (as DOCS would carry); "b" is unrelated.
  const entries = [
    { slug: "a", locale: "en", data: { title: "Alpha", section: "" }, body: "alpha is the primary keyword covered thoroughly in this guide section" },
    { slug: "a", locale: "ja", data: { title: "Alpha", section: "" }, body: "alpha についてのキーワードをこの節で詳しく解説しています説明" },
    { slug: "b", locale: "en", data: { title: "Beta", section: "" }, body: "beta covers a completely different and unrelated topic in this area entirely" },
  ] as unknown as DocLike[];

  const search = createSearch({ entries, embedder: fakeEmbedder(["alpha", "beta"]), warm: false });
  const hits = await search.search("alpha", { topK: 5 });

  // doc found by BOTH keyword and semantic ranks first
  assert.equal(hits[0]?.slug, "a");
  // de-dup: slug "a" appears once despite two locale variants
  assert.equal(new Set(hits.map((h) => h.slug)).size, hits.length);
  // scores are the fused RRF scores → consistent (non-increasing) with the returned order
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1]!.score >= hits[i]!.score);
});
