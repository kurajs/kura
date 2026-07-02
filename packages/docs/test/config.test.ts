import { test } from "node:test";
import assert from "node:assert/strict";
import { kuraJuneConfig } from "../src/config.ts";

// kuraJuneConfig forwards content.sources to June's `content.sources` (@junejs/server ≥0.0.51
// scans them at `june gen`), defaulting `collection` to "docs" — the collection Kura serves.
// Without sources, no `content` key is emitted at all (off by absence, like site/deploy/i18n).

type JuneShape = { content?: { sources?: { dir: string; collection: string; mount?: string }[] } };

test("kuraJuneConfig: forwards content.sources with collection defaulted to docs", () => {
  const june = kuraJuneConfig(
    { content: { sources: [{ dir: "../docs" }, { dir: "../schema", mount: "schema" }, { dir: "../blog", collection: "posts" }] } },
    { DOCS: [] },
  ) as JuneShape;
  assert.deepEqual(june.content, {
    sources: [
      { collection: "docs", dir: "../docs" },
      { collection: "docs", dir: "../schema", mount: "schema" },
      { collection: "posts", dir: "../blog" },
    ],
  });
});

test("kuraJuneConfig: no sources → no content key (off by absence)", () => {
  assert.equal(("content" in (kuraJuneConfig({}, { DOCS: [] }) as JuneShape)), false);
  assert.equal(("content" in (kuraJuneConfig({ content: { sources: [] } }, { DOCS: [] }) as JuneShape)), false);
});

// The static target: "github-pages" (and its "static" alias) map to June's built-in static() target
// (deploy.target "static"), and the deploy subpath becomes June's top-level basePath.
type DeployShape = { deploy?: { target?: string; basePath?: string }; basePath?: string };

test("kuraJuneConfig: github-pages → June target 'static' + top-level basePath", () => {
  const june = kuraJuneConfig(
    { deploy: { target: "github-pages", basePath: "/openab/docs" } },
    { DOCS: [] },
  ) as DeployShape;
  assert.equal(june.deploy?.target, "static");
  assert.equal(june.basePath, "/openab/docs");
});

test("kuraJuneConfig: 'static' alias behaves the same", () => {
  const june = kuraJuneConfig({ deploy: { target: "static", basePath: "/x" } }, { DOCS: [] }) as DeployShape;
  assert.equal(june.deploy?.target, "static");
  assert.equal(june.basePath, "/x");
});

test("kuraJuneConfig: non-static deploy passes through untouched, no basePath leaks", () => {
  const june = kuraJuneConfig({ deploy: { target: "workers", name: "site" } }, { DOCS: [] }) as DeployShape;
  assert.equal(june.deploy?.target, "workers");
  assert.equal("basePath" in june, false);
});
