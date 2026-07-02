import { test } from "node:test";
import assert from "node:assert/strict";
import { stripConfigComments, isCommonmark, parseHighlightLangs, parseContentSources, parseI18nLocales, parseDeployTarget, isStaticTarget } from "../src/config-read.ts";

// The CLI reads kura.config.ts as TEXT (never executes it). These pure parsers are the risky part —
// regexes over user source — so they're pinned here directly (cli.ts can't be imported: it dispatches
// a command on load). `strip → parse` is the real pipeline, so tests run stripped text through it.
const parse = (src: string) => parseHighlightLangs(stripConfigComments(src));
const cm = (src: string) => isCommonmark(stripConfigComments(src));
const sources = (src: string) => parseContentSources(stripConfigComments(src));

test("parseContentSources: pulls dir/collection/mount from content.sources; collection defaults to docs", () => {
  const src = `export default defineKura({
    content: {
      sources: [
        { dir: "../docs" },
        { dir: '../schema', mount: 'schema' },
        { dir: "../blog", collection: "posts" },
      ],
    },
  });`;
  assert.deepEqual(sources(src), [
    { dir: "../docs", collection: "docs" },
    { dir: "../schema", collection: "docs", mount: "schema" },
    { dir: "../blog", collection: "posts" },
  ]);
});

test("parseContentSources: no content block / empty sources / dir-less object → [] (or skipped)", () => {
  assert.deepEqual(sources(`export default { markdown: "commonmark" };`), []);
  assert.deepEqual(sources(`export default { content: { sources: [] } };`), []);
  assert.deepEqual(sources(`export default { content: { sources: [{ mount: "x" }] } };`), []);
});

test("parseI18nLocales: defaultLocale + locales keys, bare and quoted, nested values walked over", () => {
  const src = `export default defineKura({
    i18n: {
      defaultLocale: "en",
      locales: { en: {}, "ja-JP": { path: "/ja" }, "zh-TW": { path: "/{tw}", domain: "tw.example.com" } },
      prefixDefaultLocale: false,
    },
  });`;
  assert.deepEqual(parseI18nLocales(stripConfigComments(src)).sort(), ["en", "ja-JP", "zh-TW"]);
});

test("parseI18nLocales: nested object keys (path/domain) never become phantom locales", () => {
  const src = `export default { i18n: { defaultLocale: "en", locales: { de: { path: "/de", domain: "x.de" } } } };`;
  assert.deepEqual(parseI18nLocales(src).sort(), ["de", "en"]);
});

test("parseI18nLocales: no i18n → [] (an undeclared locale is not a locale)", () => {
  assert.deepEqual(parseI18nLocales(`export default { site: { name: "t" } };`), []);
  assert.deepEqual(parseI18nLocales(``), []);
});

test("parseI18nLocales: a commented-out i18n block is ignored", () => {
  const src = `export default {\n  // i18n: { defaultLocale: "en", locales: { de: {} } },\n};`;
  assert.deepEqual(parseI18nLocales(stripConfigComments(src)), []);
});

test("parseContentSources: a commented-out source is ignored", () => {
  const src = `export default { content: { sources: [
    { dir: "../docs" },
    // { dir: "../drafts" },
  ] } };`;
  assert.deepEqual(sources(src), [{ dir: "../docs", collection: "docs" }]);
});

test("parseHighlightLangs: pulls quoted langs from highlight.langs", () => {
  const src = `export default defineConfig({ highlight: { langs: ["hcl", "dockerfile"] } });`;
  assert.deepEqual(parse(src), ["hcl", "dockerfile"]);
});

test("parseHighlightLangs: single quotes, whitespace, and newlines inside the array", () => {
  const src = `export default {\n  highlight: {\n    langs: [\n      'hcl',\n      'kotlin',\n    ],\n  },\n};`;
  assert.deepEqual(parse(src), ["hcl", "kotlin"]);
});

test("parseHighlightLangs: no highlight block → []", () => {
  assert.deepEqual(parse(`export default { markdown: "commonmark" };`), []);
});

test("parseHighlightLangs: highlight block without langs → []", () => {
  assert.deepEqual(parse(`export default { highlight: { theme: "dark" } };`), []);
});

test("parseHighlightLangs: empty langs array → []", () => {
  assert.deepEqual(parse(`export default { highlight: { langs: [] } };`), []);
});

test("parseHighlightLangs: a commented-out langs entry is ignored (comments stripped first)", () => {
  // line comment
  assert.deepEqual(parse(`export default { highlight: {\n  // langs: ["hcl"],\n} };`), []);
  // block comment
  assert.deepEqual(parse(`export default { highlight: {\n  /* langs: ["hcl"] */\n} };`), []);
});

test("parseHighlightLangs: a langs commented back IN takes effect once its comment is stripped", () => {
  const src = `export default { highlight: { langs: ["hcl"] /* , "toml" */ } };`;
  assert.deepEqual(parse(src), ["hcl"]);
});

test("isCommonmark: detects markdown: commonmark, ignores a commented-out one", () => {
  assert.equal(cm(`export default { markdown: "commonmark" };`), true);
  assert.equal(cm(`export default { markdown: 'commonmark' };`), true);
  assert.equal(cm(`export default { markdown: "mdx" };`), false);
  assert.equal(cm(`export default {\n  // markdown: "commonmark"\n};`), false);
  assert.equal(cm(``), false);
});

test("stripConfigComments: keeps https:// URLs inside strings (// only strips at line-start/after-space)", () => {
  const src = `export default { site: { url: "https://kura.dev" } };`;
  assert.match(stripConfigComments(src), /https:\/\/kura\.dev/);
});

const target = (src: string) => parseDeployTarget(stripConfigComments(src));
const staticT = (src: string) => isStaticTarget(stripConfigComments(src));

test("parseDeployTarget: pulls the deploy target string; undefined when absent", () => {
  assert.equal(target(`export default defineKura({ deploy: { target: "github-pages", basePath: "/x" } });`), "github-pages");
  assert.equal(target(`export default defineKura({ deploy: { target: 'workers' } });`), "workers");
  assert.equal(target(`export default defineKura({ site: { name: "x" } });`), undefined);
});

test("isStaticTarget: true for github-pages and the static alias, false otherwise", () => {
  assert.equal(staticT(`export default defineKura({ deploy: { target: "github-pages" } });`), true);
  assert.equal(staticT(`export default defineKura({ deploy: { target: "static" } });`), true);
  assert.equal(staticT(`export default defineKura({ deploy: { target: "workers" } });`), false);
  assert.equal(staticT(`export default defineKura({ deploy: { target: "vercel" } });`), false);
  assert.equal(staticT(``), false);
  // a commented-out target must not count
  assert.equal(staticT(`export default defineKura({\n  // deploy: { target: "github-pages" }\n});`), false);
});
