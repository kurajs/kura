// Regression tests for real-user feedback (kura-feedback.md). These render JSX / run MDX, so they
// run under `bun test` (Node's --experimental-strip-types can't load .tsx) — see package.json.
import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderMdxBuckets } from "../../src/mdx.tsx";
import { SidebarItems, DocBody, type SidebarNode, type DocView, type Href } from "../../src/ui.tsx";
import { createDocs } from "../../src/app.tsx";
import { DOCS as FIXTURE_DOCS } from "../fixtures.ts";

// ── MDX silent-drop (the most dangerous item: an unfenced {…} dropped the whole page, no error) ──
test("renderMdxBuckets: an unfenced {…} is SURFACED as a failure, not silently dropped", async () => {
  const { map, failures } = await renderMdxBuckets([
    {
      bucket: "default",
      entries: [
        { slug: "good", body: "# Good\n\nFenced `{cli, profile}` is fine." },
        // the exact failure shape from the feedback: MDX reads {…} as a JS expression
        { slug: "bad", body: "machine-readable output ({cli, profile, account, path})" },
      ],
    },
  ]);
  expect(map.default!.good).toContain("Good"); // good page rendered
  expect(map.default!.bad).toBeUndefined(); // bad page NOT in the map…
  expect(failures).toHaveLength(1); // …it's reported instead of vanishing
  expect(failures[0]!.slug).toBe("bad");
  expect(failures[0]!.bucket).toBe("default");
  expect(failures[0]!.error.length).toBeGreaterThan(0);
});

test("renderMdxBuckets: denominator is INPUT count, so a drop is visible (ok < total)", async () => {
  const entries = [
    { slug: "a", body: "# A" },
    { slug: "b", body: "{undefinedExpr}" }, // fails
    { slug: "c", body: "# C" },
  ];
  const { failures } = await renderMdxBuckets([{ bucket: "default", entries }]);
  const total = entries.length;
  const ok = total - failures.length;
  expect(total).toBe(3);
  expect(ok).toBe(2); // reported as 2/3 — NOT 2/2; the dropped page can't hide
});

test("renderMdxBuckets: per-locale buckets each collect their own failures", async () => {
  const { map, failures } = await renderMdxBuckets([
    { bucket: "default", entries: [{ slug: "p", body: "# EN" }] },
    { bucket: "ja-JP", entries: [{ slug: "p", body: "{boom}" }] },
  ]);
  expect(map.default!.p).toContain("EN");
  expect(failures).toEqual([expect.objectContaining({ bucket: "ja-JP", slug: "p" })]);
});

// ── commonmark mode (markdown: "commonmark" / --commonmark): the literal {…} footgun is disarmed ──
test("renderMdxBuckets format='md': a literal {…} renders as text instead of failing the page", async () => {
  // The exact shape from the feedback — MDX reads {…} as a JS expression (`cli is not defined`).
  const entries = [{ slug: "bad", body: "machine-readable output ({cli, profile, account, path})" }];
  const mdx = await renderMdxBuckets([{ bucket: "default", entries }], undefined, "mdx");
  expect(mdx.failures).toHaveLength(1); // mdx: dropped
  expect(mdx.map.default!.bad).toBeUndefined();
  const md = await renderMdxBuckets([{ bucket: "default", entries }], undefined, "md");
  expect(md.failures).toHaveLength(0); // commonmark: rendered, no drop
  expect(md.map.default!.bad).toContain("{cli, profile, account, path}"); // literal text, not evaluated
});

test("renderMdxBuckets format='md' (sparkdown-gfm): GFM + shiki highlight, bare headings, safe fallback", async () => {
  // CommonMark mode renders via the sparkdown-gfm wasm, then shiki-highlights code blocks (same
  // highlighter as MDX mode). Guards: GFM renders, headings stay BARE (Kura's anchor regex needs it),
  // code gets shiki highlighting, an unknown language falls back to text instead of throwing/dropping.
  const body =
    "## Section\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst x: number = 1;\n```\n\n```unknownlang\nplain\n```\n";
  const { map, failures } = await renderMdxBuckets([{ bucket: "default", entries: [{ slug: "p", body }] }], undefined, "md");
  const h = map.default!.p!;
  expect(failures).toHaveLength(0);
  expect(h).toContain("<h2>Section</h2>"); // bare heading (no injected id/class)
  expect(h).toContain("<table>"); // GFM table
  expect(h).toContain('class="shiki'); // shiki highlighting applied to code
  expect(h).toContain("language-ts"); // authored language tagged on <code>
  expect(h).toContain("plain"); // unknown language → highlighted as text, not dropped
});

// ── HCL highlighting: hcl/Terraform fences were rendering as plain text (no `hcl` grammar) ──
test("renderMdxBuckets: ```hcl fences get real shiki highlighting (curated base list includes hcl)", async () => {
  const body = '```hcl\nresource "aws_instance" "demo" {\n  name = "x"\n}\n```\n';
  const { map, failures } = await renderMdxBuckets([{ bucket: "default", entries: [{ slug: "p", body }] }]);
  const h = map.default!.p!;
  expect(failures).toHaveLength(0);
  expect(h).toContain('class="shiki'); // highlighted, not a plain <pre>
  expect(h).toContain("language-hcl"); // tagged with the authored language
  // `resource` is an hcl keyword → shiki wraps it in its own colored span. Plain-text fallback would
  // leave the whole block in one span, so a per-token span for `resource` proves the grammar loaded.
  expect(h).toMatch(/<span[^>]*>resource<\/span>/);
});

test("renderMdxBuckets: a project-configured extra lang (highlight.langs) is highlighted", async () => {
  // Simulates the CLI passing kura.config `highlight: { langs: ["dockerfile"] }` — the name isn't in
  // the curated base list, so it only highlights because the extra lang threaded through to shiki.
  const body = "```dockerfile\nFROM node:20\nRUN echo hi\n```\n";
  const { map } = await renderMdxBuckets(
    [{ bucket: "default", entries: [{ slug: "p", body }] }],
    undefined,
    "mdx",
    ["dockerfile"],
  );
  const h = map.default!.p!;
  expect(h).toContain("language-dockerfile");
  expect(h).toMatch(/<span[^>]*>FROM<\/span>/); // FROM tokenized → dockerfile grammar loaded
});

// ── i18n: sidebar/pager links must route through `href` (the current-locale localeHref) ──────────
const PFX = "/ja-JP";
const prefixed: Href = (p) => PFX + p; // stand-in for hrefFor("ja-JP") = localeHref(i18n, p, "ja-JP")
const docHrefs = (html: string) => [...html.matchAll(/href="([^"]*\/docs\/[^"]*)"/g)].map((m) => m[1]!);

test("SidebarItems: every doc link carries the locale prefix (none drop back to /docs)", () => {
  const items: SidebarNode[] = [
    { slug: "intro", title: "Intro" },
    { title: "Folder", slug: "folder", items: [{ slug: "folder/child", title: "Child" }] },
  ];
  const html = renderToStaticMarkup(<SidebarItems items={items} href={prefixed} basePath="/docs" />);
  const hrefs = docHrefs(html);
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect(h.startsWith(`${PFX}/docs/`)).toBe(true);
});

test("createDocs: reads i18n from config.i18n alone (the generated .june/routes shape) → links keep the locale prefix", () => {
  // The cli barrel calls createDocs({ content, config, ... }) with NO top-level `i18n` — config
  // carries it. Requiring the top-level form made hrefFor a no-op, dropping /ja off every link
  // (currentLocale still worked, so the bug was invisible to component-level tests).
  const finder = (slug: string) => FIXTURE_DOCS.find((d) => d.slug === slug) ?? null;
  const kura = createDocs({
    content: { DOCS: FIXTURE_DOCS, doc: finder as never },
    config: {
      site: { name: "T" },
      i18n: { defaultLocale: "en", locales: { en: {}, "ja-JP": { path: "/ja" } } },
    } as never,
  });
  const d = kura.docRoute.loader({ params: { slug: "getting-started/introduction" }, locale: "ja-JP" } as never);
  const html = renderToStaticMarkup(kura.docRoute.View(d));
  expect(html).toMatch(/href="\/ja\/docs\//); // at least one localized in-page link
  expect(html).not.toMatch(/href="\/docs\/getting-started/); // none drop back to the default prefix
});

test("DocBody pager: prev/next links carry the locale prefix", () => {
  const doc: DocView = {
    slug: "concepts/x", title: "X", section: "Concepts", html: "<h1>X</h1><p>body</p>", toc: [],
    prev: { slug: "concepts/prev", title: "Prev" },
    next: { slug: "concepts/next", title: "Next" },
  };
  const html = renderToStaticMarkup(<DocBody doc={doc} href={prefixed} basePath="/docs" />);
  expect(html).toContain(`href="${PFX}/docs/concepts/prev"`);
  expect(html).toContain(`href="${PFX}/docs/concepts/next"`);
});
