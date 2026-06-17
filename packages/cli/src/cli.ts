#!/usr/bin/env node
// Kura CLI.
//   kura index [--out app/_index.bin] [--model Xenova/bge-m3]
//     Build the search index for the current Kura docs app: embed every doc from the
//     June-frozen app/_content.ts and write a compact index the app loads at runtime.
import { buildIndex } from "@kurajs/docs/search";
import { transformers } from "@kurajs/transformers";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function cmdIndex(): Promise<void> {
  const cwd = process.cwd();
  const contentPath = path.join(cwd, "app", "_content.ts");
  if (!fs.existsSync(contentPath)) {
    console.error("kura index: app/_content.ts not found — run `june gen` first (in a Kura docs app).");
    process.exit(1);
  }
  const out = arg("out", path.join("app", "_index.bin"))!;
  const model = arg("model", "Xenova/bge-m3")!;

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

  const localeTag = locales.size ? ` (+${variants.length} variants across ${locales.size} locales)` : "";
  console.log(`kura index: embedding ${DOCS.length} docs${localeTag} (model ${model})…`);
  const t0 = Date.now();
  const bytes = await buildIndex({ entries: allEntries, embedder: transformers({ model }) });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  console.log(`kura index: wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)}KB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Precompile MDX -> static HTML with curated components (build-time; Workers-safe at
  // runtime). Bucketed by locale: "default" for the flat (default-locale) files, plus one
  // bucket per variant locale. The app picks the bucket per entry.
  const { mdxToHtml } = await import("@kurajs/docs/mdx");
  const mdxOut = path.join(cwd, "app", "_mdx.json");
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
  fs.writeFileSync(mdxOut, JSON.stringify(map));
  const total = Object.values(map).reduce((n, b) => n + Object.keys(b).length, 0);
  const tag = locales.size ? ` across ${locales.size + 1} locales` : "";
  console.log(`kura index: rendered ${ok}/${total} docs via MDX${tag} -> ${path.relative(cwd, mdxOut)}`);
}

const cmd = process.argv[2];
if (cmd === "index") {
  await cmdIndex();
} else {
  console.log("Kura CLI\n  kura index [--out app/_index.bin] [--model <hf-model>]   build the docs search index");
  process.exit(cmd ? 1 : 0);
}
