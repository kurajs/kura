import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearch } from "../src/search.ts";
import type { DocLike } from "../src/nav.ts";

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
