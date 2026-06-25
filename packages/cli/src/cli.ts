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
import { pathToFileURL, fileURLToPath } from "node:url";

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
      // Root-only: every tab's pages must reference a real top-level folder.
      if (rel === "" && parsed.meta.tabs) {
        for (const t of parsed.meta.tabs)
          for (const p of t.pages)
            if (!children.has(p)) errors.push(`${where}: tab "${t.title}" lists "${p}", which is not a top-level folder (have: ${[...children].sort().join(", ") || "none"})`);
      }
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
  const metaContents =
    "// AUTO-GENERATED by `kura index` — do not edit. Frozen folder nav metadata (from meta.json).\n" +
    `export const META = ${JSON.stringify(meta)} as const;\n` +
    "// Per-locale overrides (content/docs/<locale>/**/meta.json), merged over META per folder.\n" +
    `export const META_LOCALES = ${JSON.stringify(metaLocales)} as const;\n`;
  // Write only when changed — `kura dev` re-runs index on restart, and an unconditional write would
  // bump the mtime every time, which the dev watcher sees as an edit → infinite restart loop.
  if (!fs.existsSync(metaTs) || fs.readFileSync(metaTs, "utf8") !== metaContents) {
    fs.writeFileSync(metaTs, metaContents);
  }
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

  // Content format: kura.config.ts `markdown` (default "mdx"), overridable per run with --commonmark.
  // "commonmark" renders via MDX format:'md' — no MDX/JSX parsing, so a literal {…} can't be read as
  // a JS expression and drop the page. Resolved BEFORE the hash so a format switch forces a rebuild
  // (otherwise the same content short-circuits and leaves _mdx.ts in the previous format).
  let commonmark = process.argv.includes("--commonmark");
  if (!commonmark) {
    // Read the setting as TEXT, not by importing kura.config.ts — so `kura index` never executes user
    // config code (no side effects, no heavy imports) on any run, including ones that short-circuit.
    const cfgPath = path.join(cwd, "kura.config.ts");
    if (fs.existsSync(cfgPath)) {
      // Strip comments before matching so a commented-out `markdown: "commonmark"` can't flip the
      // renderer. Only treat `//` as a comment at start-of-line/after-whitespace, so URLs survive.
      const txt = fs.readFileSync(cfgPath, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
      if (/\bmarkdown\s*:\s*["']commonmark["']/.test(txt)) commonmark = true;
    }
  }
  const format = commonmark ? "md" : "mdx";
  const strict = process.argv.includes("--strict");

  // Content hash — skip rebuilds when nothing changed, so `kura index` is cheap to run before
  // every dev/build. Covers the mode + format + model + locale/slug/body of every entry.
  const hashInput = JSON.stringify([model, noEmbed, format, allEntries.map((e) => [e.locale ?? "", e.slug, e.body])]);
  const contentHash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 16);
  const stamp = `// content-hash: ${contentHash}\n`;
  const hashOf = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").match(/content-hash: (\S+)/)?.[1] : undefined);
  // --strict must re-check failures every run, so it never short-circuits — a cached _mdx.ts from a
  // prior non-strict run could otherwise hide failures and let `kura build --strict` pass wrongly.
  // --no-embed also requires app/_index.ts to actually export INDEX_B64 — not merely exist: a missing,
  // corrupt, or hand-edited stub would otherwise short-circuit and leave a broken `import { INDEX_B64 }`
  // in the config. (The embed path is already covered by its content-hash stamp.)
  const exportsIndexB64 = (f: string) =>
    fs.existsSync(f) && /export\s+const\s+INDEX_B64\b/.test(fs.readFileSync(f, "utf8"));
  const upToDate = !strict && (noEmbed
    ? hashOf(mdxTs) === contentHash && exportsIndexB64(indexTs)
    : hashOf(indexTs) === contentHash && fs.existsSync(mdxTs));
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
    // --no-embed: skip the build-time vector index, but write an empty STUB rather than deleting it,
    // so a semantic-search app's `import { INDEX_B64 } from "./app/_index"` still resolves (deleting it
    // broke the build). The config decodes "" → no index, so the runtime searches by keyword, or
    // builds the index lazily on first query if an embedder is configured. Unstamped (no content-hash
    // line) so dropping --no-embed regenerates the real index next time.
    writeIfChanged(indexTs, "// AUTO-GENERATED by `kura index --no-embed` — empty search-index stub.\nexport const INDEX_B64 = \"\";\n");
    console.log("kura index: --no-embed — MDX only, empty search-index stub (runtime: keyword, or lazy embed if an embedder is set)");
  }

  // Precompile MDX -> static HTML with curated components (build-time; Workers-safe at runtime).
  // Bucketed by locale: "default" for the flat (default-locale) files, plus one per variant locale.
  // renderMdxBuckets collects per-page failures instead of throwing (the silent-drop guard lives in
  // @kurajs/docs so it's unit-tested there).
  const { renderMdxBuckets } = await import("@kurajs/docs/mdx");
  const byLocale = new Map<string, Entry[]>();
  for (const e of variants) byLocale.set(e.locale!, [...(byLocale.get(e.locale!) ?? []), e]);
  const { map, failures } = await renderMdxBuckets([
    { bucket: "default", entries: DOCS },
    ...[...byLocale].map(([bucket, entries]) => ({ bucket, entries })),
  ], undefined, format);
  fs.writeFileSync(
    mdxTs,
    stamp +
      "// AUTO-GENERATED by `kura index` — do not edit. Frozen precompiled MDX (locale → slug → html).\n" +
      `export const MDX: Record<string, Record<string, string>> = ${JSON.stringify(map)};\n`,
  );
  // LOUD per-page failures: a page that fails MDX is silently dropped to plain-markdown html, so the
  // author never learns it broke unless we say so. Print slug + the first error line — NEVER swallow.
  for (const f of failures) {
    // In commonmark mode the "set markdown: commonmark" hint is already in effect — drop it and just
    // name the renderer that failed (a commonmark failure is a genuine parse error, not the {…} footgun).
    const hint = commonmark ? "" : `; wrap any literal {…}/<…> in backticks, or set markdown: "commonmark"`;
    console.error(`kura index: ⚠ ${commonmark ? "CommonMark" : "MDX"} failed for "${f.slug}"${f.bucket !== "default" ? ` [${f.bucket}]` : ""} — ${f.error.split("\n")[0]} (renders as plain markdown${hint})`);
  }
  // Count ATTEMPTS (not map size): a dropped page isn't in the map, so map size == ok and the ratio
  // would always read N/N — hiding the fallbacks and disagreeing with the "(N docs)" up-to-date line.
  const total = DOCS.length + variants.length;
  const ok = total - failures.length;
  const tag = locales.size ? ` across ${locales.size + 1} locales` : "";
  console.log(`kura index: rendered ${ok}/${total} docs via ${commonmark ? "CommonMark" : "MDX"}${tag} -> app/_mdx.ts` + (failures.length ? ` (${failures.length} fell back — see warnings above)` : ""));
  // --strict: a silently-dropped page is a content bug. Fail the build instead of shipping the
  // plain-markdown fallback, so CI catches it (the author never finds out otherwise).
  if (failures.length && strict) {
    console.error(`kura index: --strict — ${failures.length} page(s) failed to render; failing the build.`);
    process.exit(1);
  }
}

// One Kura surface over June: dev / build / deploy each freeze content (june gen) + the search
// index/MDX (kura index), then hand off to the `june` bin — which loads its own TS source and
// owns the dev watch supervisor. Users only ever type `kura`.
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

// Forward extra args to june, dropping the kura-only flags (--no-embed, --model <v>, --strict,
// --commonmark) — june wouldn't understand them.
function passthrough(): string[] {
  const out: string[] = [];
  const a = process.argv.slice(3);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--no-embed") continue;
    if (a[i] === "--strict" || a[i] === "--commonmark") continue; // kura index-only
    if (a[i] === "--model") { i++; continue; }
    out.push(a[i]!);
  }
  return out;
}

// Find a bin shim, walking up so it works both in a standalone app (local node_modules) and a
// workspace member (the bin is hoisted to the root node_modules/.bin).
function findBin(cwd: string, bin: string): string | null {
  const name = process.platform === "win32" ? `${bin}.cmd` : bin;
  let dir = cwd;
  for (;;) {
    const p = path.join(dir, "node_modules", ".bin", name);
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
// Second search root: this CLI module's own directory. Under Bun's isolated linker the transitive
// `june` bin isn't hoisted to the app root — it lives in @kurajs/cli's own node_modules/.bin — so
// also walk up from here. (Under the hoisted linker / npm, the cwd walk above already finds it.)
const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const findJuneBin = (cwd: string) => findBin(cwd, "june") ?? findBin(SELF_DIR, "june");

// Run the app's `june` bin (it handles TS loading + the dev watcher); resolve with its exit code.
function runJune(cwd: string, args: string[]): Promise<number> {
  const bin = findJuneBin(cwd);
  if (!bin) {
    console.error("kura: couldn't find the June runtime — try reinstalling @kurajs/cli.");
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

// Run `wrangler` from the built worker dir (dist/) — used by `kura preview` to serve the freshly
// built Worker locally, a production-faithful preview.
function runWrangler(distDir: string, args: string[]): Promise<number> {
  const bin = findBin(distDir, "wrangler");
  if (!bin) {
    console.error("kura preview: couldn't find wrangler — install it with `npm i -D wrangler`.");
    return Promise.resolve(1);
  }
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: "inherit", cwd: distDir });
    child.on("error", (e) => { console.error(`kura preview: couldn't run wrangler (${e.message}).`); resolve(1); });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

// Run `kura index` in a SHORT-LIVED child so the embedder's native runtime (onnxruntime) is
// loaded and torn down in its own process — keeping the long-running dev/build/deploy parent
// ML-free (and dodging ORT's noisy teardown on some platforms).
function runKuraIndex(cwd: string): Promise<number> {
  const args = [process.argv[1]!, "index"];
  if (flag("no-embed")) args.push("--no-embed");
  if (flag("strict")) args.push("--strict"); // forward to the index child so `kura build --strict` works
  if (flag("commonmark")) args.push("--commonmark");
  const model = arg("model");
  if (model) args.push("--model", model);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", cwd });
    child.on("error", (e) => { console.error(`kura: index failed (${e.message}).`); resolve(1); });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

// Write `content` to `filePath` only when it differs (idempotent, avoids
// mtime bumps that would trigger unnecessary dev-server restarts).
function writeIfChanged(filePath: string, content: string): void {
  if (!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf8") !== content) {
    fs.writeFileSync(filePath, content);
  }
}

// Generate all kura framework files into .june/ so the user never manages boilerplate.
// Lives in .june/ (June's own artifact dir, already gitignored):
//   .june/config.ts       — June site/deploy/agent config (via kuraJuneConfig)
//   .june/routes/_kura.ts — createDocs() barrel (not a route, used by routes below)
//   .june/routes/layout.tsx           — persistent docs shell (segment boundary)
//   .june/routes/page.tsx              — home route
//   .june/routes/docs/[[...slug]]/page.tsx — docs route
//   .june/routes/search/page.tsx       — search route
//   .june/routes/og/[slug]/route.ts    — OG image route
//   .june/routes/_client.ts            — island client entry (⌘K search)
// June v0.0.44+ scans .june/routes/ alongside app/; app/ takes priority (override slot).
function generateJuneConfig(cwd: string): void {
  const kuraConfigPath = path.join(cwd, "kura.config.ts");
  if (!fs.existsSync(kuraConfigPath)) return; // not a kura app, skip

  const juneDir = path.join(cwd, ".june");
  const routesDir = path.join(juneDir, "routes");
  const docsDir = path.join(routesDir, "docs", "[[...slug]]");
  const ogDir = path.join(routesDir, "og", "[slug]");
  const searchDir = path.join(routesDir, "search");
  for (const d of [juneDir, routesDir, docsDir, ogDir, searchDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  const HEADER = "// @kura-generated — do not edit. Configure your site in kura.config.ts instead.\n";

  // .june/config.ts
  writeIfChanged(path.join(juneDir, "config.ts"),
    HEADER +
    'import { kuraJuneConfig } from "@kurajs/docs";\n' +
    'import kuraConfig from "../kura.config.ts";\n' +
    'import { DOCS } from "../app/_content";\n' +
    "\nexport default kuraJuneConfig(kuraConfig, { DOCS });\n",
  );

  // .june/routes/_kura.ts — createDocs() singleton; imported by every route below.
  writeIfChanged(path.join(routesDir, "_kura.ts"),
    HEADER +
    'import { createDocs } from "@kurajs/docs";\n' +
    'import kuraConfig from "../../kura.config.ts";\n' +
    'import { DOCS, doc, docs } from "../../app/_content";\n' +
    'import { MDX } from "../../app/_mdx";\n' +
    'import { META, META_LOCALES } from "../../app/_meta";\n' +
    "\nexport const kura = createDocs({\n" +
    "  content: { DOCS, doc, docs },\n" +
    "  mdxHtml: MDX,\n" +
    "  meta: META,\n" +
    "  metaLocales: META_LOCALES,\n" +
    "  config: kuraConfig,\n" +
    "});\n",
  );

  // .june/routes/layout.tsx — the PERSISTENT docs shell (segment boundary). Soft navigation morphs
  // only the <JuneOutlet> content inside it, so the sidebar (and its open folders) never re-render.
  writeIfChanged(path.join(routesDir, "layout.tsx"),
    HEADER +
    'import { kura } from "./_kura";\n' +
    "export const segmentBoundary = true;\n" +
    "export default kura.layout;\n",
  );

  // .june/routes/page.tsx — home
  writeIfChanged(path.join(routesDir, "page.tsx"),
    HEADER +
    'import { kura } from "./_kura";\n' +
    "export const loader = kura.home.loader;\n" +
    "export const md = kura.home.md;\n" +
    "export const json = kura.home.json;\n" +
    "export const metadata = kura.home.metadata;\n" +
    "export default kura.home.View;\n",
  );

  // .june/routes/docs/[[...slug]]/page.tsx — docs
  writeIfChanged(path.join(docsDir, "page.tsx"),
    HEADER +
    'import { kura } from "../../_kura";\n' +
    "export const loader = kura.docRoute.loader;\n" +
    "export const md = kura.docRoute.md;\n" +
    "export const json = kura.docRoute.json;\n" +
    "export const metadata = kura.docRoute.metadata;\n" +
    "export default kura.docRoute.View;\n",
  );

  // .june/routes/search/page.tsx — search
  writeIfChanged(path.join(searchDir, "page.tsx"),
    HEADER +
    'import { kura } from "../_kura";\n' +
    "export const loader = kura.searchRoute.loader;\n" +
    "export const json = kura.searchRoute.json;\n" +
    "export const metadata = kura.searchRoute.metadata;\n" +
    "export default kura.searchRoute.View;\n",
  );

  // .june/routes/og/[slug]/route.ts — OG image
  writeIfChanged(path.join(ogDir, "route.ts"),
    HEADER +
    'import { kura } from "../../_kura";\n' +
    "export default kura.ogRoute;\n",
  );

  // .june/routes/_client.ts — island client entry. startJuneClient wires island hydration AND the
  // morph router (when clientRouter is on) — without it the router never starts. initSearch then
  // lights up the ⌘K palette. (Calling only initSearch silently disables the router + islands.)
  writeIfChanged(path.join(routesDir, "_client.ts"),
    HEADER +
    'import { startJuneClient } from "@junejs/core/islands-client";\n' +
    'import { initSearch } from "@kurajs/docs/client";\n' +
    'import { ISLAND_LOADERS } from "../../app/_islands.gen";\n' +
    "\nstartJuneClient({ loaders: ISLAND_LOADERS });\n" +
    "initSearch();\n",
  );
}

async function freeze(cwd: string): Promise<void> {
  generateJuneConfig(cwd); // write .june/config.ts from kura.config.ts
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
  case "preview": {
    // Build the Worker, then serve it locally with wrangler — a production-faithful preview.
    await freeze(cwd);
    const code = await runJune(cwd, ["build", ...passthrough()]);
    if (code) process.exit(code);
    process.exit(await runWrangler(path.join(cwd, "dist"), ["dev", "worker.js", "--config", "wrangler.jsonc", ...passthrough()]));
    break;
  }
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
        "  kura preview [--no-embed]   build, then serve the Worker locally via wrangler\n" +
        "  kura deploy [--no-embed]    freeze + deploy to Cloudflare ([--dry-run] [--prod])\n" +
        "  kura index [--no-embed] [--model <hf-model>]   (re)build the search index + MDX only",
    );
    process.exit(cmd ? 1 : 0);
}
