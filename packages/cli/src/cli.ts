#!/usr/bin/env node
// Kura CLI.
//   kura index [--model Xenova/bge-m3]
//     Build the search index + precompiled MDX for the current Kura docs app and FREEZE both
//     as importable modules (app/_index.ts, app/_mdx.ts) — so the worker bundle imports them
//     and never reads the filesystem (Workers-safe; mirrors June's app/_content.ts freeze).
//     A content hash short-circuits re-embedding when nothing changed (cheap to run pre-dev).
import { buildIndex } from "@kurajs/docs/search";
import { parseMeta, validatePages, type MetaMap } from "@kurajs/docs/meta";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const LOCALE_DIR = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// Walk one meta tree (default OR a single locale's mirror) → a folder-path-keyed MetaMap, STRICTLY
// validated. `skipTopLocales` excludes top-level locale buckets (true for the default tree, false
// inside a locale's own mirror). `wherePrefix` prefixes error locations (e.g. "ja-JP/") so a bad
// locale meta is unambiguous. Folder paths are keyed RELATIVE to the tree root, so a locale's keys
// line up 1:1 with the default's for per-folder overriding.
function walkMetaTree(rootDir: string, skipTopLocales: boolean, wherePrefix = ""): { meta: MetaMap; errors: string[] } {
  const meta: MetaMap = {};
  const errors: string[] = [];
  if (!fs.existsSync(rootDir)) return { meta, errors };
  const skipped = (rel: string, name: string) => skipTopLocales && rel === "" && LOCALE_DIR.test(name);
  const walk = (dir: string, rel: string) => {
    const ents = fs.readdirSync(dir, { withFileTypes: true });
    if (ents.some((e) => !e.isDirectory() && e.name === "meta.json")) {
      const where = `${wherePrefix}${rel || "."}/meta.json`;
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
      } catch (e) {
        errors.push(`${where}: invalid JSON — ${(e as Error).message}`);
        raw = {};
      }
      const parsed = parseMeta(raw, where);
      errors.push(...parsed.errors);
      const children = new Set<string>();
      for (const c of ents) {
        if (c.isDirectory() && !skipped(rel, c.name)) children.add(c.name);
        else if (/\.mdx?$/.test(c.name)) children.add(c.name.replace(/\.mdx?$/, ""));
      }
      errors.push(...validatePages(parsed.meta, children, where));
      meta[rel] = parsed.meta;
    }
    for (const e of ents) {
      if (e.isDirectory() && !skipped(rel, e.name)) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
    }
  };
  walk(rootDir, "");
  return { meta, errors };
}

// Collect the default nav metadata PLUS every locale mirror's overrides. The default tree skips
// top-level locale buckets; each `content/docs/<locale>/` is then walked as its own tree, so a
// locale's meta.json keys match the default's by folder path (createDocs merges them per-locale).
// A locale typically overrides only `title` (folder group label); omitted fields fall back.
function collectMeta(cwd: string): { meta: MetaMap; metaLocales: Record<string, MetaMap>; errors: string[] } {
  const root = path.join(cwd, "content", "docs");
  const errors: string[] = [];
  const { meta, errors: e0 } = walkMetaTree(root, true);
  errors.push(...e0);
  const metaLocales: Record<string, MetaMap> = {};
  if (fs.existsSync(root)) {
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory() || !LOCALE_DIR.test(ent.name)) continue;
      const { meta: lm, errors: le } = walkMetaTree(path.join(root, ent.name), false, `${ent.name}/`);
      errors.push(...le);
      if (Object.keys(lm).length) metaLocales[ent.name] = lm;
    }
  }
  return { meta, metaLocales, errors };
}

async function cmdIndex(): Promise<void> {
  const cwd = process.cwd();
  const contentPath = path.join(cwd, "app", "_content.ts");
  if (!fs.existsSync(contentPath)) {
    console.error("kura index: app/_content.ts not found — run `june gen` first (in a Kura docs app).");
    process.exit(1);
  }
  const model = arg("model", "Xenova/bge-m3")!;
  const indexTs = path.join(cwd, "app", "_index.ts");
  const mdxTs = path.join(cwd, "app", "_mdx.ts");
  const metaTs = path.join(cwd, "app", "_meta.ts");

  // Nav metadata (meta.json) — validated and frozen first, so a bad meta fails fast and cheap.
  // META is the default tree; META_LOCALES holds each locale mirror's per-folder overrides.
  const { meta, metaLocales, errors: metaErrors } = collectMeta(cwd);
  if (metaErrors.length) {
    console.error("kura index: meta.json validation failed —\n  " + metaErrors.join("\n  "));
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(metaTs), { recursive: true });
  fs.writeFileSync(
    metaTs,
    "// AUTO-GENERATED by `kura index` — do not edit. Frozen folder nav metadata (from meta.json).\n" +
      `export const META = ${JSON.stringify(meta)} as const;\n` +
      "// Per-locale overrides (content/docs/<locale>/**/meta.json), merged over META per folder.\n" +
      `export const META_LOCALES = ${JSON.stringify(metaLocales)} as const;\n`,
  );
  const metaCount = Object.keys(meta).length + Object.values(metaLocales).reduce((n, m) => n + Object.keys(m).length, 0);
  if (metaCount) console.log(`kura index: validated ${metaCount} meta.json file(s)`);

  type Entry = Parameters<typeof buildIndex>[0]["entries"][number];
  const mod = (await import(pathToFileURL(contentPath).href)) as {
    DOCS?: Entry[];
    docs?: (locale?: string) => Entry[];
  };
  const DOCS = mod.DOCS ?? [];
  if (!DOCS.length) {
    console.error("kura index: no docs found in app/_content.ts");
    process.exit(1);
  }

  // Discover locales from content/<col>/<locale>/ subdirs, then collect each locale's actual
  // variants (entry.locale === locale; fallbacks stay in the default set). Both the search
  // index and the MDX precompile cover default + every variant → cross-lingual by construction.
  const LOCALE_DIR = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
  const contentRoot = path.join(cwd, "content");
  const locales = new Set<string>();
  if (mod.docs && fs.existsSync(contentRoot)) {
    for (const col of fs.readdirSync(contentRoot, { withFileTypes: true })) {
      if (!col.isDirectory()) continue;
      for (const sub of fs.readdirSync(path.join(contentRoot, col.name), { withFileTypes: true })) {
        if (sub.isDirectory() && LOCALE_DIR.test(sub.name)) locales.add(sub.name);
      }
    }
  }
  const variants: Entry[] = [];
  for (const locale of locales) for (const e of mod.docs!(locale)) if (e.locale === locale) variants.push(e);
  const allEntries = [...DOCS, ...variants];

  // --no-embed: skip the search index entirely (build MDX only). Use it when the site runs
  // WITHOUT a runtime embedder — search degrades to a lexical scan, so no model/index is needed
  // (e.g. a Cloudflare Workers deploy without Workers AI).
  const noEmbed = process.argv.includes("--no-embed");

  // Content hash — skip rebuilds when nothing changed, so `kura index` is cheap to run before
  // every dev/build. Covers the mode + model + locale/slug/body of every entry.
  const hashInput = JSON.stringify([model, noEmbed, allEntries.map((e) => [e.locale ?? "", e.slug, e.body])]);
  const contentHash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 16);
  const stamp = `// content-hash: ${contentHash}\n`;
  const hashOf = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").match(/content-hash: (\S+)/)?.[1] : undefined);
  const upToDate = noEmbed ? hashOf(mdxTs) === contentHash : hashOf(indexTs) === contentHash && fs.existsSync(mdxTs);
  if (upToDate) {
    console.log(`kura index: up to date (${allEntries.length} docs, hash ${contentHash}) — skipped`);
    return;
  }
  fs.mkdirSync(path.dirname(mdxTs), { recursive: true });

  if (!noEmbed) {
    const localeTag = locales.size ? ` (+${variants.length} variants across ${locales.size} locales)` : "";
    console.log(`kura index: embedding ${DOCS.length} docs${localeTag} (model ${model})…`);
    const t0 = Date.now();
    // Lazy import: only the embed path needs the ML stack, so --no-embed sites never load it
    // (and never install @kurajs/transformers — it's an optional peer).
    const { transformers } = await import("@kurajs/transformers").catch(() => {
      console.error("kura index: embedding needs @kurajs/transformers — install it, or use --no-embed.");
      return process.exit(1);
    });
    const bytes = await buildIndex({ entries: allEntries, embedder: transformers({ model }) });
    const b64 = Buffer.from(bytes).toString("base64");
    fs.writeFileSync(
      indexTs,
      stamp +
        "// AUTO-GENERATED by `kura index` — do not edit. Frozen search index (base64) so the worker\n" +
        "// bundle imports it instead of reading the filesystem (Workers-safe).\n" +
        `export const INDEX_B64 = ${JSON.stringify(b64)};\n`,
    );
    console.log(`kura index: wrote app/_index.ts (${(bytes.length / 1024).toFixed(0)}KB index) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } else {
    if (fs.existsSync(indexTs)) fs.rmSync(indexTs);
    console.log("kura index: --no-embed — MDX only, no search index (runtime search is lexical)");
  }

  // Precompile MDX -> static HTML with curated components (build-time; Workers-safe at runtime).
  // Bucketed by locale: "default" for the flat (default-locale) files, plus one per variant locale.
  const { mdxToHtml } = await import("@kurajs/docs/mdx");
  const map: Record<string, Record<string, string>> = { default: {} };
  let ok = 0;
  const render = async (bucket: string, e: Entry) => {
    try {
      (map[bucket] ??= {})[e.slug] = await mdxToHtml(e.body);
      ok++;
    } catch {
      /* leave out → the app falls back to the plain markdown html */
    }
  };
  for (const d of DOCS) await render("default", d);
  for (const e of variants) await render(e.locale!, e);
  fs.writeFileSync(
    mdxTs,
    stamp +
      "// AUTO-GENERATED by `kura index` — do not edit. Frozen precompiled MDX (locale → slug → html).\n" +
      `export const MDX: Record<string, Record<string, string>> = ${JSON.stringify(map)};\n`,
  );
  const total = Object.values(map).reduce((n, b) => n + Object.keys(b).length, 0);
  const tag = locales.size ? ` across ${locales.size + 1} locales` : "";
  console.log(`kura index: rendered ${ok}/${total} docs via MDX${tag} -> app/_mdx.ts`);
}

// One Kura surface over June: dev / build / deploy each freeze content (june gen) + the search
// index/MDX (kura index), then hand off to the `june` bin — which loads its own TS source and
// owns the dev watch supervisor. Users only ever type `kura`.
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

// Forward extra args to june, dropping the kura-only flags (--no-embed, --model <v>).
function passthrough(): string[] {
  const out: string[] = [];
  const a = process.argv.slice(3);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--no-embed") continue;
    if (a[i] === "--model") { i++; continue; }
    out.push(a[i]!);
  }
  return out;
}

// Find the `june` bin shim, walking up so it works both in a standalone app (local node_modules)
// and a workspace member (the bin is hoisted to the root node_modules/.bin).
function findJuneBin(cwd: string): string | null {
  const name = process.platform === "win32" ? "june.cmd" : "june";
  let dir = cwd;
  for (;;) {
    const p = path.join(dir, "node_modules", ".bin", name);
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Run the app's `june` bin (it handles TS loading + the dev watcher); resolve with its exit code.
function runJune(cwd: string, args: string[]): Promise<number> {
  const bin = findJuneBin(cwd);
  if (!bin) {
    console.error("kura: couldn't find the `june` bin — is @junejs/cli installed?");
    return Promise.resolve(1);
  }
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", (e) => {
      console.error(`kura: couldn't run june (${e.message}).`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

// Run `kura index` in a SHORT-LIVED child so the embedder's native runtime (onnxruntime) is
// loaded and torn down in its own process — keeping the long-running dev/build/deploy parent
// ML-free (and dodging ORT's noisy teardown on some platforms).
function runKuraIndex(cwd: string): Promise<number> {
  const args = [process.argv[1]!, "index"];
  if (flag("no-embed")) args.push("--no-embed");
  const model = arg("model");
  if (model) args.push("--model", model);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", cwd });
    child.on("error", (e) => { console.error(`kura: index failed (${e.message}).`); resolve(1); });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

async function freeze(cwd: string): Promise<void> {
  let code = await runJune(cwd, ["gen"]); // june gen → app/_content.ts
  if (code) process.exit(code);
  code = await runKuraIndex(cwd); // kura index → app/_index.ts + _mdx.ts (own process)
  if (code) process.exit(code);
}

const cmd = process.argv[2];
const cwd = process.cwd();
switch (cmd) {
  case "index":
    await cmdIndex();
    break;
  case "dev":
    await freeze(cwd);
    process.exit(await runJune(cwd, ["dev", ...passthrough()]));
    break;
  case "build":
    await freeze(cwd);
    process.exit(await runJune(cwd, ["build", ...passthrough()]));
    break;
  case "deploy": {
    await freeze(cwd);
    const dargs = ["deploy"];
    for (const f of ["dry-run", "prod", "skip-migrate", "allow-destructive"]) if (flag(f)) dargs.push(`--${f}`);
    process.exit(await runJune(cwd, dargs));
    break;
  }
  default:
    console.log(
      "Kura CLI\n" +
        "  kura dev [--no-embed]       freeze content + index, then run the dev server\n" +
        "  kura build [--no-embed]     freeze + build the Worker bundle\n" +
        "  kura deploy [--no-embed]    freeze + deploy to Cloudflare ([--dry-run] [--prod])\n" +
        "  kura index [--no-embed] [--model <hf-model>]   (re)build the search index + MDX only",
    );
    process.exit(cmd ? 1 : 0);
}
