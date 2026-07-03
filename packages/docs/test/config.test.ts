import { test } from "node:test";
import assert from "node:assert/strict";
import { kuraJuneConfig, fromKuraToml } from "../src/config.ts";

// fromKuraToml: normalize a parsed kura.toml (snake_case) into a KuraConfig (camelCase) + defaults.
test("fromKuraToml: renames snake_case keys, keeps nav/content, defaults the title template", () => {
  const cfg = fromKuraToml({
    site: { name: "OpenAB", description: "d" },
    markdown: "commonmark",
    base_path: "",
    deploy: { target: "github-pages", base_path: "/openab" },
    content: { sources: [{ dir: "docs", mount: "" }] },
    nav: { tabs: [{ title: "Guides", groups: ["platforms"] }], groups: { platforms: { title: "Platforms", pages: ["discord"] } } },
  } as never) as {
    site: { name: string; titleTemplate?: string };
    markdown: string;
    basePath: string;
    deploy: { target: string; basePath: string };
    content: { sources: { dir: string }[] };
    nav: { tabs: unknown[] };
  };
  assert.equal(cfg.markdown, "commonmark");
  assert.equal(cfg.basePath, ""); // base_path → basePath (empty preserved)
  assert.deepEqual(cfg.deploy, { target: "github-pages", basePath: "/openab" }); // deploy.base_path → basePath
  assert.equal(cfg.content.sources[0]!.dir, "docs"); // in-place mount, no ../ (that was scaffold plumbing)
  assert.equal((cfg.nav.tabs as unknown[]).length, 1); // nav passes through 1:1
  assert.equal(cfg.site.titleTemplate, "%s - OpenAB"); // defaulted from the site name
});

test("fromKuraToml: no [[content.sources]] → default-mount the repo's ./docs at the site root", () => {
  const cfg = fromKuraToml({ site: { name: "S" } } as never) as { content: { sources: { dir: string; mount: string }[] } };
  assert.deepEqual(cfg.content.sources, [{ dir: "docs", mount: "" }]);
});

test("fromKuraToml: an explicit title_template wins; i18n default_locale is renamed", () => {
  const cfg = fromKuraToml({
    site: { name: "S", title_template: "%s | S" },
    i18n: { default_locale: "en", locales: { en: {}, "ja-JP": { path: "/ja" } } },
  } as never) as { site: { titleTemplate: string }; i18n: { defaultLocale: string; locales: Record<string, unknown> } };
  assert.equal(cfg.site.titleTemplate, "%s | S");
  assert.equal(cfg.i18n.defaultLocale, "en");
  assert.deepEqual(Object.keys(cfg.i18n.locales), ["en", "ja-JP"]); // locale KEYS untouched (not snake-cased)
});

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

test("fromKuraToml: repo accepts a string or false, ignores other types", () => {
  assert.equal(fromKuraToml({ repo: "o/r" }).repo, "o/r");
  assert.equal(fromKuraToml({ repo: false }).repo, false);
  assert.equal(fromKuraToml({ repo: true } as never).repo, undefined);
  assert.equal(fromKuraToml({}).repo, undefined);
});
