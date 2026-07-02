import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectMeta, collectLastUpdated, discoverLocales } from "../src/content-walk.ts";

// Docs-as-code walks: content/docs plus configured external sources (mounted or not) feed the
// meta.json nav, lastUpdated dates, and locale discovery. Fixtures are temp dirs; the git-date
// lookup is injected so tests don't depend on repo history.

const md = (t: string) => `---\ntitle: ${t}\n---\n# ${t}\n`;
const write = (p: string, c: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
};

// content/docs: guides/ (with meta.json) + a root meta.json whose tabs reference both a real
// folder and a MOUNTED one; extdocs (unmounted source): reference/ subtree with meta.json, a
// root-level setup.md, and a de/ locale mirror; schema (mounted source): README + types + meta.
function makeApp(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kura-walk-"));
  write(path.join(cwd, "content", "docs", "guides", "install.md"), md("Install"));
  write(path.join(cwd, "content", "docs", "guides", "meta.json"), JSON.stringify({ title: "Guides" }));
  write(path.join(cwd, "content", "docs", "meta.json"), JSON.stringify({
    tabs: [{ title: "Docs", pages: ["guides"] }, { title: "Schema", pages: ["schema"] }],
  }));
  write(path.join(cwd, "extdocs", "setup.md"), md("Setup"));
  write(path.join(cwd, "extdocs", "reference", "api.md"), md("API"));
  write(path.join(cwd, "extdocs", "reference", "meta.json"), JSON.stringify({ title: "Reference" }));
  write(path.join(cwd, "extdocs", "de", "reference", "api.md"), md("API DE"));
  write(path.join(cwd, "extdocs", "de", "reference", "meta.json"), JSON.stringify({ title: "Referenz" }));
  write(path.join(cwd, "schema", "README.md"), md("Schema"));
  write(path.join(cwd, "schema", "types.md"), md("Types"));
  write(path.join(cwd, "schema", "meta.json"), JSON.stringify({ title: "Schema" }));
  return cwd;
}
const SOURCES = [
  { dir: "extdocs", collection: "docs" },
  { dir: "schema", collection: "docs", mount: "schema" },
];

test("collectMeta: source meta trees merge in — mounted keys prefixed, unmounted keys as-is", () => {
  const cwd = makeApp();
  const { meta, metaLocales, errors } = collectMeta(cwd, SOURCES);
  assert.deepEqual(errors, []);
  assert.ok(meta[""]); // content/docs root meta (tabs)
  assert.ok(meta["guides"]); // content/docs subtree
  assert.equal(meta["reference"]!.title, "Reference"); // unmounted source subtree, key as-is
  assert.equal(meta["schema"]!.title, "Schema"); // mounted source root meta → keyed at its mount
  assert.equal(metaLocales["de"]!["reference"]!.title, "Referenz"); // source locale mirror
});

test("collectMeta: root meta tabs may reference a MOUNT (virtual top-level folder) without a false error", () => {
  const cwd = makeApp();
  const { errors } = collectMeta(cwd, SOURCES);
  assert.deepEqual(errors.filter((e) => e.includes("schema")), []);
});

test("collectMeta: WITHOUT the sources, the same root meta tab IS a validation error (guards the fixture)", () => {
  const cwd = makeApp();
  const { errors } = collectMeta(cwd, []);
  assert.ok(errors.some((e) => e.includes('tab "Schema"')));
});

test("collectMeta: two trees claiming the same folder key is a LOUD error, not last-wins", () => {
  const cwd = makeApp();
  // an unmounted source with its own ROOT meta.json collides with content/docs's root meta ("")
  write(path.join(cwd, "extdocs", "meta.json"), JSON.stringify({ pages: ["setup", "reference"] }));
  const { errors } = collectMeta(cwd, SOURCES);
  assert.ok(errors.some((e) => e.includes("more than one content tree")));
});

test("collectLastUpdated: source slugs are mount-prefixed; a mounted README dates the mount page; locale mirrors skipped", () => {
  const cwd = makeApp();
  const dates = collectLastUpdated(cwd, SOURCES, () => "2026-07-01T00:00:00+00:00");
  assert.ok(dates["guides/install"]); // content/docs
  assert.ok(dates["setup"]); // unmounted source, root-level file
  assert.ok(dates["reference/api"]); // unmounted source, nested
  assert.ok(dates["schema"]); // mounted README → the mount's own page
  assert.ok(dates["schema/types"]); // mounted file
  assert.equal(Object.keys(dates).find((k) => k.includes("de/")), undefined); // de/ = variants, not defaults
});

test("collectLastUpdated: a null date is omitted, never an empty entry", () => {
  const cwd = makeApp();
  assert.deepEqual(collectLastUpdated(cwd, SOURCES, () => null), {});
});

test("discoverLocales: sees content/<col>/<locale>/ AND each source's own locale mirrors", () => {
  const cwd = makeApp();
  assert.deepEqual([...discoverLocales(cwd, [])], []); // content/docs has no locale dirs
  assert.deepEqual([...discoverLocales(cwd, SOURCES)], ["de"]); // extdocs/de/ found
  write(path.join(cwd, "content", "docs", "ja-JP", "guides", "install.md"), md("インストール"));
  assert.deepEqual([...discoverLocales(cwd, SOURCES)].sort(), ["de", "ja-JP"]);
});

test("no sources → behavior identical to the pre-sources walks (zero regression)", () => {
  const cwd = makeApp();
  const { meta, metaLocales } = collectMeta(cwd, []);
  assert.ok(Object.keys(meta).sort().join(",") === ",guides");
  assert.deepEqual(metaLocales, {});
  const dates = collectLastUpdated(cwd, [], () => "2026-07-01T00:00:00+00:00");
  assert.deepEqual(Object.keys(dates), ["guides/install"]);
});

test("a missing source dir yields no meta/dates/locales from it (June's gen is the loud failure)", () => {
  const cwd = makeApp();
  const gone = [{ dir: "no-such-dir", collection: "docs" }];
  assert.deepEqual(collectMeta(cwd, gone).errors.filter((e) => !e.includes('tab "Schema"')), []);
  assert.deepEqual([...discoverLocales(cwd, gone)], []);
});

test("non-docs collections are June's business — ignored by every walk", () => {
  const cwd = makeApp();
  const other = [{ dir: "extdocs", collection: "posts" }];
  const { meta } = collectMeta(cwd, other);
  assert.equal(meta["reference"], undefined);
  assert.deepEqual([...discoverLocales(cwd, other)], []);
});
