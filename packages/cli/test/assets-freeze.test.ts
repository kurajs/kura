// The app/_assets.ts freeze — corpus-filtered image manifest, content coordinates, the post-build
// copy, and the generated dev route's bundle safety. mkdtemp fixture pattern from links-freeze.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  contentTrees,
  contentFileOf,
  contentPathMapper,
  collectImageRefs,
  renderAssetsTs,
  copyContentAssets,
  readFrozenAssetFiles,
  renderAssetsRoute,
} from "../src/assets-freeze.ts";

let dir: string;
before(() => {
  dir = mkdtempSync(path.join(tmpdir(), "kura-assets-"));
  mkdirSync(path.join(dir, "content", "docs", "user-guide", "images"), { recursive: true });
  mkdirSync(path.join(dir, "content", "docs", "zh-cn", "user-guide"), { recursive: true });
  writeFileSync(path.join(dir, "content", "docs", "user-guide", "x.md"), "x");
  writeFileSync(path.join(dir, "content", "docs", "user-guide", "images", "01.png"), "PNGBYTES");
  writeFileSync(path.join(dir, "content", "docs", "user-guide", "images", "stray.png"), "STRAY");
  writeFileSync(path.join(dir, "content", "docs", "user-guide", "images", "icons.svg"), "<svg/>");
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe("collectImageRefs — corpus-filtered, existence-checked, grammar-shared", () => {
  test("T1 exactly the referenced-and-existing images; strays, non-images, and misses excluded", () => {
    const trees = contentTrees(dir, []);
    const files = collectImageRefs(
      [
        {
          original:
            "![shot](./images/01.png) ![missing](./images/nope.png) [csv](../artifacts/log.csv) ![ext](https://cdn/x.png)",
          bases: ["user-guide/x.md"],
        },
      ],
      trees,
    );
    assert.deepEqual(files, ["user-guide/images/01.png"]);
  });
  test("variant two-step at collect time: a mirror's ref falls back to the DEFAULT tree", () => {
    // Kura's convention: a top-level <locale>/ mirror keeps the SAME relative geometry as the
    // default tree, so the variant authors the same src ("./images/…") and the default base
    // resolves it. (A repo whose mirrors were REARRANGED from a different layout must adjust
    // relative srcs in the copy step — the resolver never guesses geometries.)
    const trees = contentTrees(dir, []);
    const files = collectImageRefs(
      [{ original: "![截图](./images/01.png)", bases: ["zh-cn/user-guide/x.md", "user-guide/x.md"] }],
      trees,
    );
    assert.deepEqual(files, ["user-guide/images/01.png"]);
  });
  test("fragments resolve the path (SVG sprites); fenced image-shaped text is not scanned", () => {
    const trees = contentTrees(dir, []);
    const files = collectImageRefs(
      [{ original: "![i](./images/icons.svg#logo)\n```\n![q](./images/stray.png)\n```", bases: ["user-guide/x.md"] }],
      trees,
    );
    assert.deepEqual(files, ["user-guide/images/icons.svg"]);
  });
});

describe("manifest freeze + round-trip", () => {
  test("renderAssetsTs: deterministic, JSON.parse form, __proto__-safe; readFrozenAssetFiles round-trips", () => {
    const out = renderAssetsTs({
      contentPaths: { b: "b.md", a: "a.md", ["__proto__"]: "p.md" } as Record<string, string>,
      files: ["z.png", "a.png"],
    });
    assert.match(out, /JSON\.parse\(/);
    const appDir = path.join(dir, "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "_assets.ts"), out);
    assert.deepEqual(readFrozenAssetFiles(dir), ["a.png", "z.png"]); // sorted
    const m = /JSON\.parse\((".*")\)/.exec(out)!;
    const data = JSON.parse(JSON.parse(m[1]!)) as { contentPaths: Record<string, string> };
    assert.equal(Object.hasOwn(data.contentPaths, "__proto__"), true);
  });
  test("readFrozenAssetFiles: absent file → empty (copy becomes a no-op)", () => {
    assert.deepEqual(readFrozenAssetFiles(path.join(dir, "nowhere")), []);
  });
});

describe("copyContentAssets — I29/I30", () => {
  test("files land under dist/static/assets/<content-rel>; missing dist and empty manifest are no-ops", () => {
    assert.equal(copyContentAssets(dir, [], ["user-guide/images/01.png"]), 0); // no dist/static yet
    mkdirSync(path.join(dir, "dist", "static"), { recursive: true });
    assert.equal(copyContentAssets(dir, [], []), 0); // empty manifest
    const n = copyContentAssets(dir, [], ["user-guide/images/01.png", "user-guide/images/vanished.png"]);
    assert.equal(n, 1); // the vanished file is skipped, never fails the build
    const dest = path.join(dir, "dist", "static", "assets", "user-guide", "images", "01.png");
    assert.equal(existsSync(dest), true);
    assert.equal(readFileSync(dest, "utf8"), "PNGBYTES");
  });
});

describe("content coordinates", () => {
  test("contentPathMapper: posix keys; mounted source trees prefix with their mount", () => {
    const trees = [
      { root: path.join(dir, "content", "docs"), mount: "" },
      { root: path.join(dir, "ext-docs"), mount: "schema" },
    ];
    const to = contentPathMapper(trees);
    assert.equal(to(path.join(dir, "content", "docs", "user-guide", "x.md")), "user-guide/x.md");
    assert.equal(to(path.join(dir, "ext-docs", "spec.md")), "schema/spec.md");
    assert.equal(to(path.join(dir, "elsewhere", "y.md")), undefined);
  });
  test("contentFileOf honors mounts and rejects escapes", () => {
    const trees = contentTrees(dir, []);
    assert.ok(contentFileOf(trees, "user-guide/images/01.png"));
    assert.equal(contentFileOf(trees, "user-guide/images/nope.png"), null);
  });
});

describe("generated dev route — T9 bundle safety", () => {
  test("no static fs import; computed dynamic import only; 404-safe shape", () => {
    const route = renderAssetsRoute([{ root: "../../../../content/docs", mount: "" }]);
    assert.ok(!/^import .*node:fs/m.test(route), "no top-level fs import");
    assert.match(route, /await import\(/);
    assert.match(route, /status: 404/);
  });
});

describe("review follow-ups", () => {
  test("a symlink escaping the content tree is not an oracle hit (no outside file enters the copy)", () => {
    const outside = path.join(dir, "outside-secret.png");
    writeFileSync(outside, "SECRET");
    const link = path.join(dir, "content", "docs", "user-guide", "images", "leak.png");
    try {
      const { symlinkSync } = require("node:fs") as typeof import("node:fs");
      symlinkSync(outside, link);
    } catch {
      return; // symlinks unavailable on this fs — nothing to assert
    }
    assert.equal(contentFileOf(contentTrees(dir, []), "user-guide/images/leak.png"), null);
  });
  test("the generated route uses a Set membership check", () => {
    const route = renderAssetsRoute([{ root: "../../../../content/docs", mount: "" }]);
    assert.match(route, /new Set\(ASSETS\.files\)/);
    assert.match(route, /FILES\.has\(rel\)/);
  });
});

test("readFrozenAssetFiles tolerates a corrupted manifest (non-array files)", () => {
  const bad = mkdtempSync(path.join(tmpdir(), "kura-badassets-"));
  mkdirSync(path.join(bad, "app"), { recursive: true });
  writeFileSync(path.join(bad, "app", "_assets.ts"), 'export const ASSETS = JSON.parse("{\\"files\\":\\"oops\\"}");\n');
  assert.deepEqual(readFrozenAssetFiles(bad), []);
  rmSync(bad, { recursive: true, force: true });
});

test("a legitimate ..-prefixed NAME is not an escape (contentPathMapper boundary)", () => {
  const trees = [{ root: path.join(dir, "content", "docs"), mount: "" }];
  mkdirSync(path.join(dir, "content", "docs", "..dots"), { recursive: true });
  writeFileSync(path.join(dir, "content", "docs", "..dots", "y.md"), "y");
  assert.equal(contentPathMapper(trees)(path.join(dir, "content", "docs", "..dots", "y.md")), "..dots/y.md");
});

test("the generated route percent-encodes path segments in the file URL", () => {
  const route = renderAssetsRoute([{ root: "../../../../content/docs", mount: "" }]);
  assert.match(route, /encodeURIComponent/);
});
