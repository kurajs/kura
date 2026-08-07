// The MDX components seam (KuraConfig.mdxComponents): a user map merged over the curated defaults,
// injected into every mdxToHtml/renderMdxBuckets call. These run MDX (react-dom/server), so they run
// under `bun test` — see package.json. They cover the LIBRARY seam + the identity-keyed cache that
// makes a custom map cache correctly without colliding with another map's output.
import { test, expect } from "bun:test";
import { createElement } from "react";

import { mdxToHtml, renderMdxBuckets, mdxComponents } from "../../src/mdx.tsx";

// A user `img` override: the whole point of the seam — resolve CDN URL + width/height + placeholder
// from a manifest at build, so the pixels never need to exist. Here we just stamp fixed attrs.
const imgOverride = {
  img: (props: { src?: string; alt?: string }) =>
    createElement("img", { src: `https://cdn.example/${props.src}`, alt: props.alt, width: 800, height: 600, "data-ph": "blur" }),
};

test("mdxToHtml: a custom img component overrides the default rendering", async () => {
  const merged = { ...mdxComponents, ...imgOverride };
  const html = await mdxToHtml("![cat](cat.png)", merged);
  expect(html).toContain('src="https://cdn.example/cat.png"');
  expect(html).toContain('width="800"');
  expect(html).toContain('height="600"');
  expect(html).toContain('data-ph="blur"');
});

test("mdxToHtml: merging over defaults keeps curated components (Callout) working", async () => {
  const merged = { ...mdxComponents, ...imgOverride };
  const html = await mdxToHtml('<Callout type="tip" title="Hi">body</Callout>\n\n![x](y.png)', merged);
  expect(html).toContain("callout"); // curated Callout still renders
  expect(html).toContain("https://cdn.example/y.png"); // and the override applies in the same doc
});

test("mdxToHtml: default components render a plain <img> (no override leaks in)", async () => {
  const html = await mdxToHtml("![cat](cat.png)"); // defaults
  expect(html).toContain('src="cat.png"');
  expect(html).not.toContain("cdn.example");
});

// ── identity-keyed cache: the regression guard for the perf fix ──────────────────────────────────
test("mdxToHtml: two different component maps on the SAME source do NOT collide in the cache", async () => {
  const source = "![pic](p.png)";
  const a = { ...mdxComponents, img: () => createElement("img", { src: "AAA" }) };
  const b = { ...mdxComponents, img: () => createElement("img", { src: "BBB" }) };
  const first = await mdxToHtml(source, a);
  const second = await mdxToHtml(source, b); // same source — must NOT return a's cached html
  expect(first).toContain("AAA");
  expect(second).toContain("BBB");
  expect(second).not.toContain("AAA");
});

test("mdxToHtml: the SAME custom map returns a stable (cached) result across calls", async () => {
  const source = "# Title\n\n![pic](p.png)";
  const map = { ...mdxComponents, ...imgOverride };
  const first = await mdxToHtml(source, map);
  const second = await mdxToHtml(source, map); // cache hit — identical bytes
  expect(second).toBe(first);
});

test("mdxToHtml: commonmark ('md') ignores components — the img override does NOT apply", async () => {
  const merged = { ...mdxComponents, ...imgOverride };
  const html = await mdxToHtml("![cat](cat.png)", merged, "md");
  expect(html).toContain('src="cat.png"'); // sparkdown emits the authored src; no JSX component layer
  expect(html).not.toContain("cdn.example");
});

test("renderMdxBuckets: forwards a custom components map to every entry in every bucket", async () => {
  const merged = { ...mdxComponents, ...imgOverride };
  const { map, failures } = await renderMdxBuckets(
    [
      { bucket: "default", entries: [{ slug: "a", body: "![one](1.png)" }] },
      { bucket: "ja-JP", entries: [{ slug: "a", body: "![two](2.png)" }] },
    ],
    merged,
  );
  expect(failures).toHaveLength(0);
  expect(map.default!.a).toContain("https://cdn.example/1.png");
  expect(map["ja-JP"]!.a).toContain("https://cdn.example/2.png");
});
