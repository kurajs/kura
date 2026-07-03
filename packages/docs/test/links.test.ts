// The 3-tier link resolver — the definitive matrix. Fixture mirrors the real-world corpora that
// motivated the feature (rustbgpd's pruned RECEIPTS/perf/adr links, beads_rust's ../.beads and
// ../tests/*.rs links), so every tier-2 row here is a link that 404'd on a live site.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveLink,
  rewriteMarkdownLinks,
  buildLinkContext,
  normalizeRepoUrl,
  type LinkData,
} from "../src/links.ts";
import type { DocLike } from "../src/nav.ts";

const d = (slug: string): DocLike => ({ slug, data: {}, html: "", original: "", body: "" }) as unknown as DocLike;

const ENTRIES = [
  d(""), // homepage (docs/README.md promoted)
  d("API"),
  d("OPERATIONS"),
  d("guide"),
  d("adr/guide"),
  d("adr/0064-grpc-authorization"),
  d("cookbook"), // folder page (docs/cookbook/README.md)
  d("cookbook/l3vpn-route-reflector"),
  d("mdx-page"),
];

const LINKS: LinkData = {
  repoUrl: "https://github.com/o/r",
  ref: "abc123",
  sourcePaths: {
    "": "docs/README.md",
    API: "docs/API.md",
    OPERATIONS: "docs/OPERATIONS.md",
    guide: "docs/guide.md",
    "adr/guide": "docs/adr/guide.md",
    "adr/0064-grpc-authorization": "docs/adr/0064-grpc-authorization.md",
    cookbook: "docs/cookbook/README.md",
    "cookbook/l3vpn-route-reflector": "docs/cookbook/l3vpn-route-reflector.md",
    "mdx-page": "docs/mdx-page.mdx",
  },
  repoFiles: [
    "KNOWN_ISSUES.md",
    "README.md",
    "docs/RECEIPTS.md",
    "docs/perf/scale-receipt-2026-07.md",
    "docs/notes/guide.md",
    "docs/assets/arch diagram.png",
    "tests/common/harness.rs",
    ".beads/SYNC_SAFETY_INVARIANTS.md",
    ".github/workflows/pr-bot.yml",
  ],
  repoDirs: ["docs/artifacts/soak/gate8b"],
};

const href = (slug: string) => (slug === "" ? "/" : `/${slug}`);
const CTX = buildLinkContext(ENTRIES, LINKS);
const LEGACY = buildLinkContext(ENTRIES); // no LinkData — the pre-feature behavior
const from = (slug: string) => LINKS.sourcePaths[slug];
const r = (h: string, fromSlug?: string, ctx = CTX) =>
  resolveLink(h, fromSlug === undefined ? undefined : from(fromSlug), ctx, href);

describe("normalizeRepoUrl", () => {
  test("owner/name shorthand → GitHub URL", () => assert.equal(normalizeRepoUrl("o/r"), "https://github.com/o/r"));
  test("full URL passes through, trailing .git and slashes dropped", () => {
    assert.equal(normalizeRepoUrl("https://github.com/o/r.git"), "https://github.com/o/r");
    assert.equal(normalizeRepoUrl("https://github.example.com/o/r/"), "https://github.example.com/o/r"); // GHES
  });
});

describe("guards (T31) — never touched, with or without LinkData", () => {
  for (const h of ["https://github.com/x/y", "mailto:a@b.c", "//cdn.x/y", "#quick-start", ""]) {
    test(`"${h}" → null`, () => {
      assert.equal(r(h, "API"), null);
      assert.equal(r(h, undefined, LEGACY), null);
    });
  }
});

describe("tier 1 — on-site targets resolve from the linking doc's own directory", () => {
  test("T01 same-dir: GNMI.md → /GNMI needs the slug to exist; here API.md→OPERATIONS.md", () =>
    assert.equal(r("OPERATIONS.md", "API"), "/OPERATIONS"));
  test("T02 explicit ./ same-dir", () => assert.equal(r("./guide.md", "API"), "/guide"));
  test("T03 subfolder down from top-level", () =>
    assert.equal(r("adr/0064-grpc-authorization.md", "API"), "/adr/0064-grpc-authorization"));
  test("T04 ../ sibling from a subfolder doc", () =>
    assert.equal(r("../API.md", "adr/0064-grpc-authorization"), "/API"));
  test("T05 sub→sub with anchor, anchor verbatim", () =>
    assert.equal(r("./guide.md#part-2", "adr/0064-grpc-authorization"), "/adr/guide#part-2"));
  test("T06 anchor on a same-dir link", () =>
    assert.equal(r("OPERATIONS.md#grpc-audit", "API"), "/OPERATIONS#grpc-audit"));
  test("T08 mid-path ..: planning/../OPERATIONS.md", () =>
    assert.equal(r("planning/../OPERATIONS.md", "API"), "/OPERATIONS"));
  test("T09 self-link with anchor", () => assert.equal(r("./API.md#auth", "API"), "/API#auth"));
  test("percent-encoded target decodes before matching (%20 → the on-disk space)", () =>
    assert.equal(
      r("assets/arch%20diagram.png", "API"),
      "https://github.com/o/r/blob/abc123/docs/assets/arch%20diagram.png",
    ));
  test(".mdx source resolves via its real path (no legacy widening needed)", () =>
    assert.equal(r("mdx-page.mdx", "API"), "/mdx-page"));
  test("T24 authored path beats legacy shallowest-basename: guide.md FROM adr/ is adr's own guide", () =>
    assert.equal(r("guide.md", "adr/0064-grpc-authorization"), "/adr/guide"));
  test("RISK-2 README/index aliases: ./index.md hits the folder page authored as README.md", () =>
    assert.equal(r("./index.md", "cookbook/l3vpn-route-reflector"), "/cookbook"));
  test("T36 directory link to an on-site folder page", () => {
    assert.equal(r("cookbook/", "API"), "/cookbook");
    // "../" from docs/cookbook/x.md is the docs/ DIR (RFC 3986) — the promoted homepage.
    assert.equal(r("../", "cookbook/l3vpn-route-reflector"), "/");
    assert.equal(r("./", "cookbook/l3vpn-route-reflector"), "/cookbook");
  });
});

describe("tier 2 — repo files not on the site → the repo's web view (the live 404 classes)", () => {
  test("T12 pruned doc with anchor (rustbgpd RECEIPTS)", () =>
    assert.equal(
      r("../RECEIPTS.md#retention", "cookbook/l3vpn-route-reflector"),
      "https://github.com/o/r/blob/abc123/docs/RECEIPTS.md#retention",
    ));
  test("T13 repo-root file via ../../ (KNOWN_ISSUES)", () =>
    assert.equal(
      r("../../KNOWN_ISSUES.md", "cookbook/l3vpn-route-reflector"),
      "https://github.com/o/r/blob/abc123/KNOWN_ISSUES.md",
    ));
  test("T14 pruned subfolder doc (perf/)", () =>
    assert.equal(
      r("../perf/scale-receipt-2026-07.md", "cookbook/l3vpn-route-reflector"),
      "https://github.com/o/r/blob/abc123/docs/perf/scale-receipt-2026-07.md",
    ));
  test("T16 dot-dir target (beads_rust ../.beads/…)", () =>
    assert.equal(
      r("../.beads/SYNC_SAFETY_INVARIANTS.md", "API"),
      "https://github.com/o/r/blob/abc123/.beads/SYNC_SAFETY_INVARIANTS.md",
    ));
  test("T17 non-md source file (../tests/harness.rs)", () =>
    assert.equal(
      r("../tests/common/harness.rs", "API"),
      "https://github.com/o/r/blob/abc123/tests/common/harness.rs",
    ));
  test("T20 <a> to an image (path with a space, encoded per segment)", () =>
    assert.equal(
      r("assets/arch diagram.png", "API"),
      "https://github.com/o/r/blob/abc123/docs/assets/arch%20diagram.png",
    ));
  test("T21 tracked directory → /tree/", () =>
    assert.equal(
      r("artifacts/soak/gate8b/", "API"),
      "https://github.com/o/r/tree/abc123/docs/artifacts/soak/gate8b",
    ));
  test("T22 root README with anchor", () =>
    assert.equal(
      r("../../README.md#quick-start", "cookbook/l3vpn-route-reflector"),
      "https://github.com/o/r/blob/abc123/README.md#quick-start",
    ));
  test("T23 .github workflow file", () =>
    assert.equal(
      r("../../.github/workflows/pr-bot.yml", "adr/0064-grpc-authorization"),
      "https://github.com/o/r/blob/abc123/.github/workflows/pr-bot.yml",
    ));
  test("T25 exact tracked path beats a same-basename on-site doc", () =>
    assert.equal(r("notes/guide.md", "API"), "https://github.com/o/r/blob/abc123/docs/notes/guide.md"));
});

describe("tier 3 + degrades — never emit a URL we can't prove", () => {
  test("T28 broken link (file nowhere) stays authored", () => assert.equal(r("./missing.md", "API"), null));
  test("T30 escape above the repo root → null", () =>
    assert.equal(r("../../../secrets.md", "cookbook/l3vpn-route-reflector"), null));
  test("T35 case mismatch is a miss (GitHub URLs are case-exact)", () =>
    assert.equal(r("../receipts.md", "cookbook/l3vpn-route-reflector"), null));
  test("T32 no LinkData: pruned-doc link stays authored (no half-guessing)", () =>
    assert.equal(r("../RECEIPTS.md#retention", undefined, LEGACY), null));
  test("T34 repo:false hard-disables tier 2, tier 1 unaffected", () => {
    const ctx = buildLinkContext(ENTRIES, LINKS, false);
    assert.equal(resolveLink("../RECEIPTS.md", from("cookbook/l3vpn-route-reflector"), ctx, href), null);
    assert.equal(resolveLink("../API.md", from("adr/guide"), ctx, href), "/API");
  });
  test("config.repo string overrides the detected URL", () => {
    const ctx = buildLinkContext(ENTRIES, LINKS, "up/stream");
    assert.equal(
      resolveLink("../RECEIPTS.md", from("cookbook/l3vpn-route-reflector"), ctx, href),
      "https://github.com/up/stream/blob/abc123/docs/RECEIPTS.md",
    );
  });
  test("no repoUrl detected: tier 2 off, tier 1 + legacy still on", () => {
    const ctx = buildLinkContext(ENTRIES, { ...LINKS, repoUrl: null });
    assert.equal(resolveLink("../RECEIPTS.md", from("cookbook/l3vpn-route-reflector"), ctx, href), null);
    assert.equal(resolveLink("../API.md", from("adr/guide"), ctx, href), "/API");
  });
});

describe("legacy rescue net — the pre-feature algorithm, byte-compatible (T26-T27, absolute paths)", () => {
  test("T26 exact-slug rescue without a source path", () =>
    assert.equal(r("guide.md", undefined, LEGACY), "/guide"));
  test("T27 basename fallback prefers the shallowest slug", () =>
    assert.equal(r("../../deep/guide.md", undefined, LEGACY), "/guide"));
  test("leading-slash absolute .md keeps resolving via legacy (historical behavior)", () =>
    assert.equal(r("/guide.md", "API"), "/guide"));
  test("non-.md targets are ignored without a source path", () =>
    assert.equal(r("../tests/common/harness.rs", undefined, LEGACY), null));
  test("with LinkData, a moved file (path miss) still rescues by slug", () =>
    assert.equal(r("../../old/path/OPERATIONS.md", "cookbook/l3vpn-route-reflector"), "/OPERATIONS"));
});

describe("rewriteMarkdownLinks — agent surfaces", () => {
  const resolve = (h: string): string | null =>
    h === "other.md" ? "/other.md" : h === "../RECEIPTS.md" ? "https://github.com/o/r/blob/HEAD/docs/RECEIPTS.md" : null;
  test("inline links rewrite; unresolved and images stay authored", () => {
    const md = "See [x](other.md) and [gone](../nope.md) and ![img](other.md).";
    assert.equal(
      rewriteMarkdownLinks(md, resolve),
      "See [x](/other.md) and [gone](../nope.md) and ![img](other.md).",
    );
  });
  test("titles survive; nested [] in text survives", () => {
    assert.equal(
      rewriteMarkdownLinks('[a [b] c](other.md "Title")', resolve),
      '[a [b] c](/other.md "Title")',
    );
  });
  test("fenced code blocks are untouched (transcript pseudo-links)", () => {
    const md = "```\n[x](other.md)\n```\n[x](other.md)";
    assert.equal(rewriteMarkdownLinks(md, resolve), "```\n[x](other.md)\n```\n[x](/other.md)");
  });
  test("inline code spans are untouched", () => {
    assert.equal(
      rewriteMarkdownLinks("Use `[x](other.md)` then [x](other.md)", resolve),
      "Use `[x](other.md)` then [x](/other.md)",
    );
  });
  test("reference definitions rewrite; footnote definitions don't", () => {
    const md = "[ref]: ../RECEIPTS.md\n[^note]: not a link target other.md";
    assert.equal(
      rewriteMarkdownLinks(md, resolve),
      "[ref]: https://github.com/o/r/blob/HEAD/docs/RECEIPTS.md\n[^note]: not a link target other.md",
    );
  });
});

describe("review follow-ups", () => {
  test("tier-2 directory link keeps its anchor (tree URL + #fragment)", () =>
    assert.equal(
      resolveLink("artifacts/soak/gate8b/#readme", LINKS.sourcePaths.API, CTX, href),
      "https://github.com/o/r/tree/abc123/docs/artifacts/soak/gate8b#readme",
    ));
  test("a 4-backtick fence is not closed by a 3-backtick line (CommonMark closer >= opener)", () => {
    const resolve = (h: string): string | null => (h === "other.md" ? "/other" : null);
    const md = "````\n```\n[x](other.md)\n```\n````\n[x](other.md)";
    assert.equal(rewriteMarkdownLinks(md, resolve), "````\n```\n[x](other.md)\n```\n````\n[x](/other)");
  });
  test("an info-string line inside a fence does not close it", () => {
    const resolve = (h: string): string | null => (h === "other.md" ? "/other" : null);
    const md = "```\n```ts not a closer\n[x](other.md)\n```\n[x](other.md)";
    assert.equal(rewriteMarkdownLinks(md, resolve), "```\n```ts not a closer\n[x](other.md)\n```\n[x](/other)");
  });
});

describe("locale variants resolve from their OWN source path", () => {
  test("../README.md means different targets from docs/ja/guide.md vs docs/guide.md", () => {
    // From the ja mirror (one dir deeper) "../README.md" is docs/README.md — the site homepage.
    assert.equal(resolveLink("../README.md", "docs/ja/guide.md", CTX, href), "/");
    // From the default file it's the repo-root README — tier 2.
    assert.equal(
      resolveLink("../README.md", "docs/guide.md", CTX, href),
      "https://github.com/o/r/blob/abc123/README.md",
    );
  });
});

describe("code spans, CommonMark exact-run matching", () => {
  const resolve = (h: string): string | null => (h === "other.md" ? "/other" : null);
  test("a double-backtick span containing single backticks stays untouched", () =>
    assert.equal(
      rewriteMarkdownLinks("``x ` [a](other.md) ` y`` then [a](other.md)", resolve),
      "``x ` [a](other.md) ` y`` then [a](/other)",
    ));
  test("an unmatched backtick run is literal text; the link after it still rewrites", () =>
    assert.equal(
      rewriteMarkdownLinks("odd ` tick [a](other.md)", resolve),
      "odd ` tick [a](/other)",
    ));
  test("a simple span still guards its content", () =>
    assert.equal(
      rewriteMarkdownLinks("`[a](other.md)` and [a](other.md)", resolve),
      "`[a](other.md)` and [a](/other)",
    ));
});

describe("variant-base tier-1 (locale paths registered in the maps)", () => {
  const ctx = buildLinkContext(ENTRIES, {
    ...LINKS,
    localeSourcePaths: { ja: { OPERATIONS: "docs/ja/OPERATIONS.md", guide: "docs/ja/guide.md" } },
  });
  test("a sibling link resolved against a ja variant base hits tier 1, not the repo oracle", () =>
    assert.equal(resolveLink("./OPERATIONS.md", "docs/ja/guide.md", ctx, href), "/OPERATIONS"));
  test("../ from the ja mirror still reaches the default-tree sibling via tier 1", () =>
    assert.equal(resolveLink("../API.md", "docs/ja/guide.md", ctx, href), "/API"));
});
