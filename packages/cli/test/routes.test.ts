import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseBasePath, docsRoute, pruneStaleDocsRoutes } from "../src/routes.ts";

// Oracle: the link layer's basePath normalizer, mirrored from @kurajs/docs src/nav.ts (not exported
// as a standalone subpath, and importing it would pull in React). The whole fix is that the CLI's
// route location and this must agree — if nav.ts ever changes, this copy and the CLI must move with
// it, and the "route URL === link href" test below is what catches drift.
function normalizeBasePath(raw?: string): string {
  if (raw === undefined) return "/docs";
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "" : "/" + trimmed;
}
const docPath = (basePath: string, slug: string) => `${basePath}/${slug}`;

test("parseBasePath: absent key defaults to /docs", () => {
  assert.deepEqual(parseBasePath("export default { sections: [] }"), ["docs"]);
});

test("parseBasePath: explicit values map to segments", () => {
  assert.deepEqual(parseBasePath('{ basePath: "" }'), []); // site root
  assert.deepEqual(parseBasePath('{ basePath: "/docs" }'), ["docs"]);
  assert.deepEqual(parseBasePath('{ basePath: "docs" }'), ["docs"]); // no leading slash
  assert.deepEqual(parseBasePath('{ basePath: "docs/" }'), ["docs"]); // trailing slash
  assert.deepEqual(parseBasePath('{ basePath: "/guide" }'), ["guide"]);
  assert.deepEqual(parseBasePath('{ basePath: "/a/b" }'), ["a", "b"]); // nested
  assert.deepEqual(parseBasePath('{ basePath: "//x//" }'), ["x"]); // dup slashes collapse
  assert.deepEqual(parseBasePath("{ basePath: '/guide' }"), ["guide"]); // single quotes
});

test("parseBasePath: a commented-out basePath does not move the route", () => {
  assert.deepEqual(parseBasePath('{ /* basePath: "" */ sections: [] }'), ["docs"]);
  assert.deepEqual(parseBasePath('{\n  // basePath: ""\n  sections: []\n}'), ["docs"]);
});

test("parseBasePath: a https:// in a string is not mistaken for a line comment", () => {
  assert.deepEqual(parseBasePath('{ siteUrl: "https://x.dev", basePath: "/guide" }'), ["guide"]);
});

test("parseBasePath: traversal/separator segments are rejected (no escaping .june/routes)", () => {
  assert.throws(() => parseBasePath('{ basePath: "../../.." }'), /Invalid basePath.*"\.\."/);
  assert.throws(() => parseBasePath('{ basePath: "docs/../../etc" }'), /Invalid basePath/);
  assert.throws(() => parseBasePath('{ basePath: "." }'), /Invalid basePath/);
  assert.throws(() => parseBasePath('{ basePath: "a\\\\b" }'), /Invalid basePath/); // backslash segment
});

test("docsRoute: validated segments stay within routesDir", () => {
  // With parseBasePath rejecting "..", every real segment list keeps docsDir under routesDir.
  const routesDir = "/p/.june/routes";
  for (const raw of ["", "/docs", "/guide", "/a/b"]) {
    const { docsDir } = docsRoute(routesDir, parseBasePath(`{ basePath: ${JSON.stringify(raw)} }`));
    const rel = path.relative(routesDir, docsDir);
    assert.ok(!rel.startsWith(".."), `${raw} → ${docsDir} escapes ${routesDir}`);
  }
});

test("docsRoute: dir + import depth follow the segments", () => {
  const R = "/p/.june/routes";
  assert.deepEqual(docsRoute(R, ["docs"]), { docsDir: path.join(R, "docs", "[[...slug]]"), kuraImport: "../../_kura" });
  assert.deepEqual(docsRoute(R, []), { docsDir: path.join(R, "[[...slug]]"), kuraImport: "../_kura" });
  assert.deepEqual(docsRoute(R, ["a", "b"]), { docsDir: path.join(R, "a", "b", "[[...slug]]"), kuraImport: "../../../_kura" });
});

test("docsRoute: default segments reproduce the historical hardcoded values (no regression)", () => {
  // Before the fix the CLI hardcoded routes/docs/[[...slug]] + "../../_kura"; the default must match.
  const { docsDir, kuraImport } = docsRoute("/p/.june/routes", parseBasePath("{}"));
  assert.equal(docsDir, path.join("/p/.june/routes", "docs", "[[...slug]]"));
  assert.equal(kuraImport, "../../_kura");
});

test("contract: the generated route URL equals the link href for every basePath", () => {
  // June maps routes/<segments>/[[...slug]] → URL "/<segments>", the slug filling the catch-all.
  // That must equal what the docs layer links to: docPath(normalizeBasePath(raw), slug).
  const routesDir = "/p/.june/routes";
  for (const raw of [undefined, "", "/docs", "docs", "docs/", "/guide", "/a/b", "//x//"]) {
    const segments = raw === undefined ? parseBasePath("{}") : parseBasePath(`{ basePath: ${JSON.stringify(raw)} }`);
    const { docsDir } = docsRoute(routesDir, segments);
    const urlSegs = path.relative(routesDir, docsDir).split(path.sep).slice(0, -1); // drop "[[...slug]]"
    for (const slug of ["getting-started", "a/b"]) {
      const routeUrl = "/" + [...urlSegs, slug].join("/");
      assert.equal(routeUrl, docPath(normalizeBasePath(raw), slug), `basePath=${JSON.stringify(raw)} slug=${slug}`);
    }
  }
});

test("pruneStaleDocsRoutes: removes a docs route a prior basePath left behind, keeps the rest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kura-routes-"));
  const routesDir = path.join(root, ".june", "routes");
  // Simulate a switch from basePath "/docs" to "" : stale routes/docs/[[...slug]] + new routes/[[...slug]].
  const stale = path.join(routesDir, "docs", "[[...slug]]");
  const keep = path.join(routesDir, "[[...slug]]");
  const search = path.join(routesDir, "search");
  const og = path.join(routesDir, "og", "[slug]");
  for (const d of [stale, keep, search, og]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(stale, "page.tsx"), "stale");

  pruneStaleDocsRoutes(routesDir, keep);

  assert.equal(fs.existsSync(stale), false, "stale catch-all removed");
  assert.equal(fs.existsSync(path.join(routesDir, "docs")), false, "now-empty parent pruned");
  assert.equal(fs.existsSync(keep), true, "the kept route survives");
  assert.equal(fs.existsSync(search), true, "unrelated search route untouched");
  assert.equal(fs.existsSync(og), true, "unrelated og route untouched");
  fs.rmSync(root, { recursive: true, force: true });
});

test("pruneStaleDocsRoutes: prunes a nested stale prefix back to routesDir, keeping a sibling", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kura-routes-"));
  const routesDir = path.join(root, "routes");
  const stale = path.join(routesDir, "a", "b", "[[...slug]]"); // from basePath "/a/b"
  const keep = path.join(routesDir, "guide", "[[...slug]]"); // current basePath "/guide"
  for (const d of [stale, keep]) fs.mkdirSync(d, { recursive: true });

  pruneStaleDocsRoutes(routesDir, keep);

  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(path.join(routesDir, "a")), false, "empty a/ and a/b/ both pruned");
  assert.equal(fs.existsSync(keep), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("pruneStaleDocsRoutes: a missing routesDir is a no-op", () => {
  assert.doesNotThrow(() => pruneStaleDocsRoutes(path.join(os.tmpdir(), "kura-does-not-exist-xyz"), "x"));
});

test("pruneStaleDocsRoutes: never deletes the OG catch-all (og/[[...slug]] is not a docs route)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kura-routes-"));
  const routesDir = path.join(root, "routes");
  const docs = path.join(routesDir, "[[...slug]]"); // docs at site root (basePath "")
  const og = path.join(routesDir, "og", "[[...slug]]"); // OG catch-all — must survive
  for (const d of [docs, og]) fs.mkdirSync(d, { recursive: true });

  pruneStaleDocsRoutes(routesDir, docs);

  assert.equal(fs.existsSync(og), true, "og/[[...slug]] is left intact");
  assert.equal(fs.existsSync(docs), true, "the docs route survives");
  fs.rmSync(root, { recursive: true, force: true });
});
