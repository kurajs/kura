import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCliConfig, resolveComponentsModule } from "../../src/config-load.ts";

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

// ── mdxComponents: config surfacing (kura.toml + kura.config.ts) ──────────────────────────────────
test("loadCliConfig: mdxComponents path is read from kura.toml (mdx_components)", async () => {
  const dir = tmp('mdx_components = "./app/mdx-components.ts"\n');
  const cfg = await loadCliConfig(dir);
  expect(cfg.mdxComponents).toBe("./app/mdx-components.ts");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loadCliConfig: mdxComponents path is text-scanned from kura.config.ts", async () => {
  const dir = tmp({
    "kura.config.ts":
      'import { defineKura } from "@kurajs/docs";\n' +
      'export default defineKura({ mdxComponents: "./app/mdx-components.tsx" });\n',
  });
  const cfg = await loadCliConfig(dir);
  expect(cfg.mdxComponents).toBe("./app/mdx-components.tsx");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loadCliConfig: no mdxComponents → undefined", async () => {
  const dir = tmp('markdown = "commonmark"\n');
  const cfg = await loadCliConfig(dir);
  expect(cfg.mdxComponents).toBeUndefined();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── resolveComponentsModule: explicit path + convention detection ─────────────────────────────────
test("resolveComponentsModule: an explicit path that exists resolves to an absolute path", () => {
  const dir = tmp({ "app/mdx-components.ts": "export default {};\n" });
  const r = resolveComponentsModule(dir, "./app/mdx-components.ts");
  expect(r.error).toBeUndefined();
  expect(r.path).toBe(path.join(dir, "app", "mdx-components.ts"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveComponentsModule: an explicit path that is missing is a loud error, not a silent skip", () => {
  const dir = tmp({});
  const r = resolveComponentsModule(dir, "./app/nope.ts");
  expect(r.path).toBeUndefined();
  expect(r.error).toContain("nope.ts");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveComponentsModule: auto-detects the app/mdx-components.* convention (tsx too)", () => {
  const dir = tmp({ "app/mdx-components.tsx": "export default {};\n" });
  const r = resolveComponentsModule(dir); // no explicit path → convention
  expect(r.path).toBe(path.join(dir, "app", "mdx-components.tsx"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveComponentsModule: explicit config path wins over the convention file", () => {
  const dir = tmp({ "app/mdx-components.ts": "export default {};\n", "custom/comp.ts": "export default {};\n" });
  const r = resolveComponentsModule(dir, "./custom/comp.ts");
  expect(r.path).toBe(path.join(dir, "custom", "comp.ts"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveComponentsModule: nothing configured and no convention file → {} (no override)", () => {
  const dir = tmp({});
  expect(resolveComponentsModule(dir)).toEqual({});
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveComponentsModule: an explicit path that is a DIRECTORY is a loud error, not a module", () => {
  const dir = tmp({ "custom/comp.ts/keep": "" }); // makes custom/comp.ts a directory
  const r = resolveComponentsModule(dir, "./custom/comp.ts");
  expect(r.path).toBeUndefined();
  expect(r.error).toContain("is not a file");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveComponentsModule: a convention path that is a DIRECTORY is skipped, not resolved", () => {
  const dir = tmp({ "app/mdx-components.ts/keep": "" });
  expect(resolveComponentsModule(dir)).toEqual({});
  fs.rmSync(dir, { recursive: true, force: true });
});
