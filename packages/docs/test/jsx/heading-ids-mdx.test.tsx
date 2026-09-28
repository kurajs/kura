// A page renders its precompiled MDX (opts.mdxHtml) when there is one, not the entry's own html.
// June's html carries June's ids, while the MDX precompile emits bare headings that processHtml
// anchors with the same GitHub algorithm, so both agree. Search must still index what the page
// RENDERS (an authored id or MDX-only heading exists in only one of them), or a hit's headingId
// can name an anchor that isn't on the page. Every search surface is checked against the
// page's own ToC: server keyword, semantic, and the static corpus the browser indexes.
// Imports app.tsx (JSX) → runs under bun (see package.json).
import { test, expect } from "bun:test";
import type { Embedder } from "@kurajs/core";
import { createDocs } from "../../src/app.tsx";
import { createSearch } from "../../src/search.ts";

const JUNE_HTML =
  '<h1 id="guide">Guide</h1><p>intro</p>' +
  '<h2 id="snake_case_opt">snake_case_opt</h2><p>set the snake option to tune caching</p>';
const MDX_HTML = "<h1>Guide</h1><p>intro</p><h2>snake_case_opt</h2><p>set the snake option to tune caching</p>";
const DOCS = [
  { slug: "guide", data: { title: "Guide" }, html: JUNE_HTML, body: "## snake_case_opt\nset the snake option to tune caching", original: "" },
];
const finder = (slug: string) => DOCS.find((d) => d.slug === slug) ?? null;

// Marks whether a text mentions "snake" (a baseline dim keeps other texts non-zero).
const fakeEmbedder: Embedder = {
  id: "fake",
  dim: 2,
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array([t.toLowerCase().includes("snake") ? 1 : 0, 0.1]);
      const norm = Math.hypot(...v);
      return v.map((x) => x / norm);
    });
  },
};

const mk = (config: object) =>
  createDocs({ content: { DOCS, doc: finder as never }, mdxHtml: { default: { guide: MDX_HTML } }, config: config as never });
const pageAnchor = (kura: ReturnType<typeof mk>): string => {
  const { doc } = kura.docRoute.loader({ params: { slug: "guide" } } as never) as { doc: { toc: { id: string }[] } };
  return doc.toc[0]!.id;
};

test("the page anchors its bare MDX heading with the same GitHub id June gives it", () => {
  expect(pageAnchor(mk({}))).toBe("snake_case_opt");
});

test("keyword search: a hit's headingId is the page's anchor", async () => {
  const kura = mk({});
  const hits = await kura.search.search("snake option caching", { mode: "keyword" });
  expect(hits[0]?.headingId).toBe(pageAnchor(kura));
});

test("semantic search: a hit's headingId is the page's anchor", async () => {
  const kura = mk({ embedder: fakeEmbedder });
  const kb = await kura.search.getKb();
  expect(kb).toBeTruthy();
  const hits = await kb!.searchText("snake", { topK: 1 });
  expect((hits[0]?.data as { headingId?: string }).headingId).toBe(pageAnchor(kura));
});

test("static corpus: the browser's index resolves to the page's anchor", async () => {
  const kura = mk({ deploy: { target: "static" } });
  const { index } = kura.searchRoute.json({ q: "", hits: [], tokens: [] }) as { index: { slug: string; html: string; data: { title: string } }[] };
  const hits = await createSearch({ entries: index as never }).search("snake option caching", { mode: "keyword" });
  expect(hits[0]?.headingId).toBe(pageAnchor(kura));
});
