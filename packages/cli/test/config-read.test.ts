import { test } from "node:test";
import assert from "node:assert/strict";
import { stripConfigComments, isCommonmark, parseHighlightLangs } from "../src/config-read.ts";

// The CLI reads kura.config.ts as TEXT (never executes it). These pure parsers are the risky part —
// regexes over user source — so they're pinned here directly (cli.ts can't be imported: it dispatches
// a command on load). `strip → parse` is the real pipeline, so tests run stripped text through it.
const parse = (src: string) => parseHighlightLangs(stripConfigComments(src));
const cm = (src: string) => isCommonmark(stripConfigComments(src));

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
