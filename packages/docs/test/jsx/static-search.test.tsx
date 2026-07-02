// Static-search seam: a static build has no server to answer /search.json?q=… per keystroke, so the
// search route ships the CORPUS instead and the browser builds the (pure-JS) BM25 index locally.
// searchRoute.json includes `index` ONLY on static targets; server targets stay lean and query the
// endpoint per request. Imports app.tsx (JSX) → runs under bun (see package.json).
import { test, expect } from "bun:test";

import { createDocs } from "../../src/app.tsx";
import { DOCS } from "../fixtures.ts";

const finder = (slug: string) => DOCS.find((d) => d.slug === slug) ?? null;
const empty = { q: "", hits: [], tokens: [] };

test("searchRoute.json: static target ships the corpus so the browser can run BM25 client-side", () => {
  const kura = createDocs({
    content: { DOCS, doc: finder as never },
    config: { basePath: "", deploy: { target: "github-pages", basePath: "/x" } } as never,
  });
  const out = kura.searchRoute.json(empty) as { index?: { slug: string; html: string; data: { title: string } }[] };
  expect(Array.isArray(out.index)).toBe(true);
  expect(out.index!.length).toBe(DOCS.length);
  // each corpus entry carries what the client index needs: slug + rendered HTML (→ text + preview) + a title
  const e = out.index![0]!;
  expect(typeof e.slug).toBe("string");
  expect(typeof e.html).toBe("string");
  expect(typeof e.data.title).toBe("string");
});

test("searchRoute.json: 'static' alias also ships the corpus", () => {
  const kura = createDocs({ content: { DOCS, doc: finder as never }, config: { deploy: { target: "static" } } as never });
  expect(Array.isArray((kura.searchRoute.json(empty) as { index?: unknown[] }).index)).toBe(true);
});

test("searchRoute.json: server target stays lean — no corpus (queries hit the endpoint per request)", () => {
  const kura = createDocs({ content: { DOCS, doc: finder as never }, config: { deploy: { target: "workers" } } as never });
  expect("index" in (kura.searchRoute.json(empty) as object)).toBe(false);
});

test("searchRoute.json: no deploy target → not static → no corpus", () => {
  const kura = createDocs({ content: { DOCS, doc: finder as never }, config: {} as never });
  expect("index" in (kura.searchRoute.json(empty) as object)).toBe(false);
});
