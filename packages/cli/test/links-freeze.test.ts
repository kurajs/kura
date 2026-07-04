// The app/_links.ts freeze — repo detection, path mapping, the source-path walk, and the
// corpus-filtered oracle. Pure parts are injected (env, remote, dates) like content-walk tests.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  detectRepo,
  sourceMapOf,
  repoPathMapper,
  collectSourcePaths,
  collectRepoTargets,
  renderLinksTs,
  linkRef,
} from "../src/links-freeze.ts";

describe("detectRepo — precedence and parsing", () => {
  const none = () => null;
  test("config string pins (normalized), even when env is set", () =>
    assert.deepEqual(detectRepo("up/stream", { GITHUB_REPOSITORY: "fork/x" }, none), {
      url: "https://github.com/up/stream",
      reason: "config",
    }));
  test("config false disables", () =>
    assert.equal(detectRepo(false, { GITHUB_REPOSITORY: "fork/x" }, none).url, null));
  test("GITHUB_REPOSITORY beats the remote", () =>
    assert.deepEqual(detectRepo(undefined, { GITHUB_REPOSITORY: "o/r" }, () => "git@github.com:other/y.git"), {
      url: "https://github.com/o/r",
      reason: "GITHUB_REPOSITORY",
    }));
  test("ssh remote parses", () =>
    assert.equal(detectRepo(undefined, {}, () => "git@github.com:o/r.git").url, "https://github.com/o/r"));
  test("https remote parses, .git and trailing slash dropped", () =>
    assert.equal(detectRepo(undefined, {}, () => "https://github.com/o/r.git").url, "https://github.com/o/r"));
  test("non-GitHub remote → null with the host in the reason", () => {
    const d = detectRepo(undefined, {}, () => "git@gitlab.com:o/r.git");
    assert.equal(d.url, null);
    assert.match(d.reason, /gitlab\.com/);
  });
  test("no remote → null", () => assert.equal(detectRepo(undefined, {}, none).url, null));
});

describe("linkRef", () => {
  test("CI uses the exact sha; local uses HEAD", () => {
    assert.equal(linkRef({ GITHUB_SHA: "abc123" }), "abc123");
    assert.equal(linkRef({}), "HEAD");
  });
});

describe("sourceMapOf + repoPathMapper", () => {
  test("mapped tree wins over repo-root-relative; outside both → undefined", () => {
    const cwd = "/tmp/site";
    const map = sourceMapOf({ KURA_SOURCE_MAP: '{"content/docs":"docs"}' });
    const to = repoPathMapper(cwd, "/tmp/checkout", map);
    assert.equal(to("/tmp/site/content/docs/guide.md"), "docs/guide.md");
    assert.equal(to("/tmp/checkout/README.md"), "README.md");
    assert.equal(to("/elsewhere/x.md"), undefined);
  });
  test("no repo root and no map → everything unmappable", () => {
    const to = repoPathMapper("/tmp/site", null, {});
    assert.equal(to("/tmp/site/content/docs/guide.md"), undefined);
  });
  test("invalid KURA_SOURCE_MAP is ignored", () =>
    assert.deepEqual(sourceMapOf({ KURA_SOURCE_MAP: "[not-an-object]" }), {}));
});

describe("collectSourcePaths — walk + slug rule + locale mirrors", () => {
  let dir: string;
  test("setup", () => {
    dir = mkdtempSync(path.join(tmpdir(), "kura-links-"));
    mkdirSync(path.join(dir, "content", "docs", "adr"), { recursive: true });
    mkdirSync(path.join(dir, "content", "docs", "ja"), { recursive: true });
    writeFileSync(path.join(dir, "content", "docs", "README.md"), "# Home\n");
    writeFileSync(path.join(dir, "content", "docs", "guide.md"), "# Guide\n");
    writeFileSync(path.join(dir, "content", "docs", "adr", "0001-x.md"), "# ADR\n");
    writeFileSync(path.join(dir, "content", "docs", "ja", "guide.md"), "# ガイド\n");
  });
  test("default tree + locale mirror, index/README collapse, repo-relative paths", () => {
    const to = repoPathMapper(dir, null, { "content/docs": "docs" });
    const { sourcePaths, localeSourcePaths } = collectSourcePaths(dir, [], new Set(["ja"]), to);
    assert.deepEqual(sourcePaths, {
      "": "docs/README.md",
      guide: "docs/guide.md",
      "adr/0001-x": "docs/adr/0001-x.md",
    });
    assert.deepEqual(localeSourcePaths, { ja: { guide: "docs/ja/guide.md" } });
  });
  test("cleanup", () => rmSync(dir, { recursive: true, force: true }));
});

describe("collectRepoTargets — corpus scan against the tracked set", () => {
  const tracked = new Set([
    "KNOWN_ISSUES.md",
    "docs/RECEIPTS.md",
    "docs/artifacts/soak/readme.txt",
    "tests/common/harness.rs",
  ]);
  test("files, dirs, and the never-guess rules", () => {
    const docs = [
      {
        fromPath: "docs/cookbook/x.md",
        original:
          "[a](../RECEIPTS.md#keep) [b](../../KNOWN_ISSUES.md) [c](../artifacts/soak/) " +
          "[typo](../nope.md) [ext](https://x.dev) [anchor](#h) [abs](/y.md) [esc](../../../up.md)",
      },
      { fromPath: "docs/ARTIFACT.md", original: "[rs](../tests/common/harness.rs)" },
      { original: "[no-from](../RECEIPTS.md)" }, // no fromPath → contributes nothing
    ];
    assert.deepEqual(collectRepoTargets(docs, tracked), {
      repoFiles: ["KNOWN_ISSUES.md", "docs/RECEIPTS.md", "tests/common/harness.rs"],
      repoDirs: ["docs/artifacts/soak"],
    });
  });
  test("fenced link-shaped text is not scanned", () => {
    const docs = [{ fromPath: "docs/x.md", original: "```\n[a](RECEIPTS.md)\n```" }];
    assert.deepEqual(collectRepoTargets(docs, new Set(["docs/RECEIPTS.md"])), { repoFiles: [], repoDirs: [] });
  });
});

describe("renderLinksTs — deterministic freeze", () => {
  test("sorted keys, empties omitted, typed export", () => {
    const out = renderLinksTs({
      repoUrl: "https://github.com/o/r",
      ref: "HEAD",
      sourcePaths: { b: "docs/b.md", a: "docs/a.md" },
      localeSourcePaths: {},
      repoFiles: [],
      repoDirs: [],
    });
    assert.match(out, /import type \{ LinkData \} from "@kurajs\/docs\/links";/);
    assert.match(out, /"sourcePaths":\{"a":"docs\/a\.md","b":"docs\/b\.md"\}/);
    assert.ok(!out.includes('"localeSourcePaths"'));
    assert.ok(!out.includes('"repoFiles"'));
  });
});
