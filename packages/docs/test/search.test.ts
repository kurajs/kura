import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearch } from "../src/search.ts";
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

test("keyword snippet aligns with BM25 tokenization for punctuated queries", async () => {
  // Body padded so a naive (start-of-doc) snippet would miss the match. BM25 tokenizes
  // "react/redux" → ["react","redux"]; the snippet must use the same tokenization (not a
  // whitespace split, which would look for the literal "react/redux" and not find it).
  const body =
    "Introductory filler text padding the very start of this document so that a naive snippet " +
    "would begin here and never reach the relevant part of the page at all, truly. " +
    "Later on the guide explains how to wire React and Redux together for predictable state.";
  const entries = [{ slug: "d", data: { title: "Guide", section: "" }, body }] as unknown as DocLike[];

  const hits = await createSearch({ entries }).search("react/redux");
  assert.equal(hits[0]?.slug, "d");
  assert.ok(/redux/i.test(hits[0]!.text), "snippet should land on the matched term, not the doc start");
});

test("keyword search ranks the doc with the rare query term first", async () => {
  const entries = [
    { slug: "a", data: { title: "Intro", section: "" }, body: "general overview and getting started" },
    { slug: "b", data: { title: "Kubernetes", section: "" }, body: "deploying to a kubernetes cluster with helm" },
  ] as unknown as DocLike[];
  const hits = await createSearch({ entries }).search("kubernetes deployment");
  assert.equal(hits[0]?.slug, "b");
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
