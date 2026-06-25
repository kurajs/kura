// Coverage for the optional "Last updated on" feature (config.lastUpdated): the DocBody render and the
// createDocs wiring (git date map → DocView, with a frontmatter override + default-off empty map). The
// cli git-date capture itself is covered by the end-to-end build verification (build with the flag on).
import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DocBody, type DocView } from "../../src/ui.tsx";
import { createDocs } from "../../src/app.tsx";
import { doc as mkDoc } from "../fixtures.ts";

const base: DocView = { slug: "x", title: "X", section: "S", html: "<h1>X</h1><p>body</p>", toc: [], prev: null, next: null };

test("DocBody: renders a localized 'Last updated on' line with a <time> when lastUpdated is set", () => {
  const html = renderToStaticMarkup(<DocBody doc={{ ...base, lastUpdated: "2026-06-18T16:00:56-05:00" }} locale="en" />);
  expect(html).toContain("Last updated on");
  expect(html).toMatch(/<time datetime="2026-06-18T16:00:56-05:00"/i); // attr case is renderer-dependent
  expect(html).toContain("June 18, 2026"); // Intl long format, pinned to UTC → stable
});

test("DocBody: no last-updated line (and no <time>) when lastUpdated is absent", () => {
  const html = renderToStaticMarkup(<DocBody doc={base} />);
  expect(html).not.toContain("Last updated on");
  expect(html).not.toContain("<time");
});

test("DocBody: the date is formatted per the page locale", () => {
  const en = renderToStaticMarkup(<DocBody doc={{ ...base, lastUpdated: "2026-06-18" }} locale="en" />);
  const ja = renderToStaticMarkup(<DocBody doc={{ ...base, lastUpdated: "2026-06-18" }} locale="ja-JP" />);
  expect(en).toContain("June 18, 2026");
  expect(ja).toContain("年"); // ja-JP long date includes 年 — the locale path was applied
  expect(ja).not.toBe(en);
});

test("DocBody: an unparseable date falls back to the raw string (never throws)", () => {
  const html = renderToStaticMarkup(<DocBody doc={{ ...base, lastUpdated: "not-a-date" }} />);
  expect(html).toContain("not-a-date");
});

const cfg = { site: { name: "T" } } as never;
const finderFor = (d: ReturnType<typeof mkDoc>) => ((s: string) => (s === d.slug ? d : null)) as never;

test("createDocs: opts.lastUpdated[slug] flows through to DocView.lastUpdated", () => {
  const d = mkDoc("getting-started/introduction", "Intro");
  const kura = createDocs({
    content: { DOCS: [d], doc: finderFor(d) },
    config: cfg,
    lastUpdated: { "getting-started/introduction": "2026-03-03T00:00:00Z" },
  });
  const page = kura.docRoute.loader({ params: { slug: "getting-started/introduction" } } as never) as { doc: DocView };
  expect(page.doc.lastUpdated).toBe("2026-03-03T00:00:00Z");
});

test("createDocs: a frontmatter lastUpdated overrides the git date map", () => {
  const d = mkDoc("p", "P", { lastUpdated: "2025-12-25" });
  const kura = createDocs({
    content: { DOCS: [d], doc: finderFor(d) },
    config: cfg,
    lastUpdated: { p: "2020-01-01" }, // git map — must LOSE to the frontmatter value
  });
  const page = kura.docRoute.loader({ params: { slug: "p" } } as never) as { doc: DocView };
  expect(page.doc.lastUpdated).toBe("2025-12-25");
});

test("createDocs: an empty map (the default-off frozen LAST_UPDATED) → DocView has no date", () => {
  const d = mkDoc("p", "P");
  const kura = createDocs({
    content: { DOCS: [d], doc: finderFor(d) },
    config: cfg,
    lastUpdated: {}, // what `kura index` freezes when config.lastUpdated is off
  });
  const page = kura.docRoute.loader({ params: { slug: "p" } } as never) as { doc: DocView };
  expect(page.doc.lastUpdated).toBeUndefined();
});
