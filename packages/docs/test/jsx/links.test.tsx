// In-content Markdown cross-links (`[x](other.md)`) must resolve to the target doc's real URL —
// matched by slug (exact, else basename), carrying the docs mount + deploy subpath (+ anchor).
// Imports app.tsx (JSX) → runs under bun. See package.json.
import { test, expect } from "bun:test";
import { createDocs } from "../../src/app.tsx";
import { DOCS } from "../fixtures.ts";

const finder = (slug: string) => DOCS.find((d) => d.slug === slug) ?? null;
// DOCS has slugs like "features/search", "features/search/semantic", "getting-started/introduction".
const mk = (html: string) =>
  createDocs({
    content: { DOCS, doc: finder as never },
    mdxHtml: { default: { "features/search": html } },
    config: { basePath: "/docs", deploy: { target: "github-pages", basePath: "/openab" } } as never,
  });
const render = (html: string) =>
  (mk(html).docRoute.loader({ params: { slug: "features/search" } } as never) as { doc: { html: string } }).doc.html;

test("rewrites a .md cross-link to the target doc URL (basename match) with the deploy subpath", () => {
  // "semantic.md" → slug features/search/semantic → /openab (deploy) + /docs (mount) + slug
  const html = render('<p>See <a href="semantic.md">semantic</a>.</p>');
  expect(html).toContain('href="/openab/docs/features/search/semantic"');
  expect(html).not.toContain('href="semantic.md"');
});

test("preserves the #anchor and resolves across folders", () => {
  const html = render('<a href="introduction.md#install">intro</a>');
  expect(html).toContain('href="/openab/docs/getting-started/introduction#install"');
});

test("resolves an exact multi-segment target too", () => {
  const html = render('<a href="features/projections/json.md">json</a>');
  expect(html).toContain('href="/openab/docs/features/projections/json"');
});

test("leaves external links, bare anchors, and non-.md links untouched", () => {
  const html = render(
    '<a href="https://x.dev">ext</a><a href="#section">anchor</a><a href="/openab/docs/features/search">abs</a>',
  );
  expect(html).toContain('href="https://x.dev"');
  expect(html).toContain('href="#section"');
  expect(html).toContain('href="/openab/docs/features/search"');
});

test("an unresolved .md link is left as-is (no crash)", () => {
  const html = render('<a href="does-not-exist.md">x</a>');
  expect(html).toContain('href="does-not-exist.md"');
});

test("with frozen LinkData: tier 2 sends a pruned-doc link to the repo blob, tier 1 stays on-site", () => {
  const app = createDocs({
    content: { DOCS, doc: finder as never },
    mdxHtml: { default: { "features/search": '<a href="../RECEIPTS.md#keep">gone</a><a href="semantic.md">here</a>' } },
    config: { basePath: "/docs", deploy: { target: "github-pages", basePath: "/openab" } } as never,
    links: {
      repoUrl: "https://github.com/o/r",
      ref: "abc123",
      sourcePaths: { "features/search": "docs/features/search.md", "features/search/semantic": "docs/features/search/semantic.md" },
      repoFiles: ["docs/RECEIPTS.md"],
    },
  });
  const html = (app.docRoute.loader({ params: { slug: "features/search" } } as never) as { doc: { html: string } }).doc.html;
  expect(html).toContain('href="https://github.com/o/r/blob/abc123/docs/RECEIPTS.md#keep"');
  expect(html).toContain('href="/openab/docs/features/search/semantic"');
});
