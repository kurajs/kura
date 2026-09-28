import { test } from "node:test";
import assert from "node:assert/strict";
import { processHtml, slugify } from "../src/nav.ts";
import { createSearch } from "../src/search.ts";
import type { DocLike } from "../src/nav.ts";
import type { Embedder } from "@kurajs/core";

// June (≥ its heading-ids release) renders every heading with a GitHub-compatible id — the single
// source of truth. Kura must REUSE those ids everywhere it anchors or indexes headings, never
// recompute them: the right-rail ToC, the keyword index, and the semantic index all have to point
// at the anchor that is actually on the page.
//
// The headings below are ones Kura's former slugify got wrong (it dropped "_", which GitHub keeps);
// slugify now IS June's algorithm, so a bare copy of this html anchors the same way (see nav.test).
const JUNE_HTML =
  '<h1 id="guide">Guide</h1><p>intro</p>' +
  '<h2 id="snake_case_opt">snake_case_opt</h2><p>set the snake option to tune caching</p>' +
  '<h2 id="api_key-vs-api-key">API_KEY vs. api key</h2><p>questions and answers about credentials</p>' +
  '<h3 id="setup">Setup</h3><p>run the installer</p>';

test("slugify agrees with June's ids for these headings", () => {
  assert.equal(slugify("snake_case_opt"), "snake_case_opt");
  assert.equal(slugify("API_KEY vs. api key"), "api_key-vs-api-key");
});

test("processHtml reuses an existing id even where the slug would differ (an author's own anchor)", () => {
  const { html, toc } = processHtml('<h2 id="custom-anchor">Setup</h2><h2>Setup</h2>');
  assert.deepEqual(toc.map((t) => t.id), ["custom-anchor", "setup"]);
  assert.equal(html, '<h2 id="custom-anchor">Setup</h2><h2 id="setup">Setup</h2>');
});

test("processHtml reuses June's ids for the ToC and leaves the headings untouched", () => {
  const { html, toc } = processHtml(JUNE_HTML);
  assert.deepEqual(toc, [
    { level: 2, text: "snake_case_opt", id: "snake_case_opt" },
    { level: 2, text: "API_KEY vs. api key", id: "api_key-vs-api-key" },
    { level: 3, text: "Setup", id: "setup" },
  ]);
  assert.equal(html, JUNE_HTML); // every heading already had its id — nothing to add, nothing duplicated
});

test("processHtml: a bare heading (older June) still gets an id, and never one already on the page", () => {
  const { html, toc } = processHtml('<h2 id="setup">Setup</h2><h2>Setup</h2><h2>Usage</h2>');
  assert.deepEqual(toc.map((t) => t.id), ["setup", "setup-1", "usage"]);
  assert.equal(html, '<h2 id="setup">Setup</h2><h2 id="setup-1">Setup</h2><h2 id="usage">Usage</h2>');
});

test("processHtml keeps a heading's other attributes when it adds an id", () => {
  const { html } = processHtml('<h2 class="x">Plain</h2>');
  assert.equal(html, '<h2 class="x" id="plain">Plain</h2>');
});

test("a folded in-page 'Table of Contents' keeps June's id for its <details>", () => {
  const { html, toc } = processHtml(
    '<h2 id="table-of-contents">Table of Contents</h2><ul><li><a href="#setup">Setup</a></li></ul>' +
      '<h2 id="setup">Setup</h2>',
  );
  assert.ok(html.includes('<details class="kura-toc" id="table-of-contents">'));
  assert.deepEqual(toc.map((t) => t.id), ["setup"]); // the folded ToC heading is no longer a heading
});

const entries = [
  { slug: "guide", data: { title: "Guide", section: "Docs" }, html: JUNE_HTML, body: "", original: "" },
] as unknown as DocLike[];

test("keyword index: a hit's headingId is June's id (the deep link lands)", async () => {
  const hits = await createSearch({ entries }).search("snake option caching", { mode: "keyword" });
  assert.equal(hits[0]?.slug, "guide");
  assert.equal(hits[0]?.headingId, "snake_case_opt");
});

// Marks which marker words a text contains (a baseline dim keeps marker-free texts non-zero).
function fakeEmbedder(markers: string[]): Embedder {
  const dim = markers.length + 1;
  return {
    id: "fake",
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((t) => {
        const v = new Float32Array(dim);
        v[markers.length] = 0.1;
        markers.forEach((m, i) => { if (t.toLowerCase().includes(m)) v[i] = 1; });
        const norm = Math.hypot(...v) || 1;
        return v.map((x) => x / norm);
      });
    },
  };
}

test("semantic index: sections come from the rendered HTML, carrying June's ids", async () => {
  // body holds the markdown source; slugging it would yield "snakecaseopt" / "apikey-vs-api-key" — wrong
  const withBody = [{ ...entries[0], body: "## snake_case_opt\nset the snake option\n\n## API_KEY vs. api key\nquestions" }] as unknown as DocLike[];
  const kb = await createSearch({ entries: withBody, embedder: fakeEmbedder(["snake", "questions"]) }).getKb();
  assert.ok(kb);
  const ids = async (q: string) => (await kb.searchText(q, { topK: 1 })).map((h) => (h.data as { headingId?: string }).headingId);
  assert.deepEqual(await ids("snake"), ["snake_case_opt"]);
  assert.deepEqual(await ids("questions"), ["api_key-vs-api-key"]);
});
