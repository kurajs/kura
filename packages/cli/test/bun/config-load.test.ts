import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCliConfig } from "../../src/config-load.ts";

// All of loadCliConfig runs under `bun test`: the kura.toml path needs Bun's native TOML loader, and
// config-load's internal `.js` specifiers only resolve to `.ts` under Bun (not node --strip-types).

const tmp = (files: Record<string, string> | string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kura-cfg-"));
  const entries = typeof files === "string" ? { "kura.toml": files } : files;
  for (const [rel, content] of Object.entries(entries)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
};

test("loadCliConfig: kura.toml is parsed; snake_case + defaults resolved", async () => {
  const dir = tmp(
    'markdown = "commonmark"\n' +
      'base_path = ""\n' +
      "last_updated = true\n" +
      "[site]\nname = \"OpenAB\"\ndescription = \"d\"\n" +
      '[deploy]\ntarget = "github-pages"\nbase_path = "/openab"\n' +
      "[highlight]\nlangs = [\"hcl\"]\n" +
      "[[nav.tabs]]\ntitle = \"Guides\"\ngroups = [\"platforms\"]\n" +
      "[nav.groups.platforms]\ntitle = \"Platforms\"\npages = [\"discord\"]\n",
  );
  const cfg = await loadCliConfig(dir);
  expect(cfg.source).toBe("toml");
  expect(cfg.commonmark).toBe(true);
  expect(cfg.staticTarget).toBe(true); // github-pages
  expect(cfg.basePathSegments).toEqual([]); // base_path "" → site root
  expect(cfg.lastUpdated).toBe(true);
  expect(cfg.hasNav).toBe(true);
  expect(cfg.siteName).toBe("OpenAB");
  expect(cfg.highlightLangs).toEqual(["hcl"]);
  // No [[content.sources]] → default-mount the repo's ./docs at the site root.
  expect(cfg.contentSources).toEqual([{ dir: "docs", collection: "docs", mount: "" }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loadCliConfig: explicit [[content.sources]] override the ./docs default", async () => {
  const dir = tmp('[[content.sources]]\ndir = "handbook"\ncollection = "docs"\nmount = "guide"\n');
  const cfg = await loadCliConfig(dir);
  expect(cfg.contentSources).toEqual([{ dir: "handbook", collection: "docs", mount: "guide" }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loadCliConfig: kura.config.ts is text-scanned into the same shape", async () => {
  const dir = tmp({
    "kura.config.ts":
      'import { defineKura } from "@kurajs/docs";\n' +
      "export default defineKura({\n" +
      '  markdown: "commonmark",\n' +
      '  basePath: "/guide",\n' +
      '  deploy: { target: "github-pages", basePath: "/repo" },\n' +
      '  i18n: { defaultLocale: "en", locales: { en: {}, ja: { path: "/ja" } } },\n' +
      '  content: { sources: [{ dir: "../docs" }] },\n' +
      "  nav: { tabs: [] },\n" +
      "});\n",
  });
  const cfg = await loadCliConfig(dir);
  expect(cfg.source).toBe("ts");
  expect(cfg.commonmark).toBe(true);
  expect(cfg.basePathSegments).toEqual(["guide"]); // docs-mount basePath, NOT deploy.basePath
  expect(cfg.staticTarget).toBe(true);
  expect(cfg.locales.sort()).toEqual(["en", "ja"]);
  expect(cfg.contentSources[0]!.dir).toBe("../docs");
  expect(cfg.hasNav).toBe(true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loadCliConfig: neither config file → source 'none', safe defaults", async () => {
  const dir = tmp({});
  const cfg = await loadCliConfig(dir);
  expect(cfg.source).toBe("none");
  expect(cfg.contentSources).toEqual([]);
  expect(cfg.basePathSegments).toEqual(["docs"]);
  expect(cfg.staticTarget).toBe(false);
  fs.rmSync(dir, { recursive: true, force: true });
});
