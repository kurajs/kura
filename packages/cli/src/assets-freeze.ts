// Freeze app/_assets.ts — the AssetData behind @kurajs/docs' content-image pipeline (links.ts
// there). Coordinates are CONTENT-TREE-relative (mount-prefixed), never repo-relative: they stay
// derivable in isolated builds (no git, no KURA_SOURCE_MAP — where LinkData.sourcePaths is empty),
// and the existence oracle is the filesystem itself. The manifest is corpus-filtered: only image
// files actually referenced by some doc's markdown are frozen (and later copied) — a tree full of
// generated artifacts can't bloat the worker bundle or the published site.
import { rewriteMarkdownLinks, resolveRepoPath, type AssetData } from "@kurajs/docs/links";
import type { ContentSource } from "./config-read.js";
import fs from "node:fs";
import path from "node:path";

const posix = (p: string): string => p.split(path.sep).join("/");

/** Extensions the pipeline serves. Everything else keeps link semantics (blob tier / authored). */
export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico"]);

type Tree = { root: string; mount: string };

/** The docs-collection content trees: content/docs plus each configured docs source. */
export function contentTrees(cwd: string, sources: readonly ContentSource[]): Tree[] {
  return [
    { root: path.join(cwd, "content", "docs"), mount: "" },
    ...sources
      .filter((s) => s.collection === "docs")
      .map((s) => ({ root: path.resolve(cwd, s.dir), mount: s.mount ?? "" })),
  ];
}

/** Locate a content-relative path on disk (first tree whose mount prefixes it), or null. The
 *  oracle is CONFINED to the tree: the real path (symlinks resolved) must stay under the tree
 *  root, so a symlink can't pull files from outside the content root into the manifest/copy.
 *  Transient stat races read as absent — never a throw. */
export function contentFileOf(trees: readonly Tree[], contentRel: string): string | null {
  for (const t of trees) {
    const rel = t.mount ? (contentRel === t.mount ? "" : contentRel.startsWith(t.mount + "/") ? contentRel.slice(t.mount.length + 1) : null) : contentRel;
    if (rel == null) continue;
    try {
      const abs = path.join(t.root, ...rel.split("/"));
      if (!fs.statSync(abs).isFile()) continue;
      const real = fs.realpathSync(abs);
      const rootReal = fs.realpathSync(t.root);
      if (real !== rootReal && !real.startsWith(rootReal + path.sep)) continue; // symlink escape
      return abs;
    } catch {
      /* absent or racing — try the next tree */
    }
  }
  return null;
}

/** An identity content mapper for collectSourcePaths: file → its content-relative path. */
export function contentPathMapper(trees: readonly Tree[]): (absFile: string) => string | undefined {
  return (absFile) => {
    for (const t of trees) {
      const rel = path.relative(t.root, absFile);
      if (!rel.startsWith("..") && !path.isAbsolute(rel)) return t.mount ? `${t.mount}/${posix(rel)}` : posix(rel);
    }
    return undefined;
  };
}

/**
 * Corpus scan: every authored markdown IMAGE target, resolved from the referencing entry's own
 * content path (variant first, then the default entry's — mirrors share the default tree's files)
 * and kept only when the file exists in a content tree with an image extension. Extraction reuses
 * rewriteMarkdownLinks as a collector, so the scan grammar cannot drift from the rewrite grammar.
 */
export function collectImageRefs(
  docs: readonly { original?: string; bases: readonly string[] }[],
  trees: readonly Tree[],
): string[] {
  const files = new Set<string>();
  for (const d of docs) {
    if (!d.original || !d.bases.length) continue;
    rewriteMarkdownLinks(d.original, () => null, {
      resolveImage: (src) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") || src.startsWith("/") || src.startsWith("#") || src === "") return null;
        const hashAt = src.indexOf("#");
        const p = hashAt >= 0 ? src.slice(0, hashAt) : src;
        if (p === "") return null;
        const ext = p.split(".").pop()?.toLowerCase() ?? "";
        if (!IMAGE_EXTS.has(ext)) return null;
        for (const base of d.bases) {
          const cand = resolveRepoPath(base, p);
          if (cand != null && cand !== "" && contentFileOf(trees, cand)) {
            files.add(cand);
            break;
          }
        }
        return null; // collector only — never rewrite
      },
    });
  }
  return [...files].sort();
}

const sorted = (o: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/** Deterministic app/_assets.ts source. JSON.parse form (a literal "__proto__" key would set the
 *  prototype in an object literal; parsed it is a plain own property). */
export function renderAssetsTs(data: AssetData): string {
  const body: AssetData = {
    contentPaths: sorted(data.contentPaths),
    ...(data.localeContentPaths && Object.keys(data.localeContentPaths).length
      ? {
          localeContentPaths: Object.fromEntries(
            Object.entries(data.localeContentPaths)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([l, m]) => [l, sorted(m)]),
          ),
        }
      : {}),
    files: [...data.files].sort(),
  };
  return (
    "// AUTO-GENERATED by `kura index` — frozen content-asset manifest (see @kurajs/docs links.ts).\n" +
    "// Content-relative coordinates; `files` is corpus-filtered to images docs actually reference.\n" +
    'import type { AssetData } from "@kurajs/docs/links";\n' +
    `export const ASSETS: AssetData = JSON.parse(${JSON.stringify(JSON.stringify(body))});\n`
  );
}

/** Copy the manifest's files into dist/static/assets/<content-rel>. Static-target post-build step;
 *  a missing dist/static or an empty manifest is a no-op. Returns the number of files copied. */
export function copyContentAssets(cwd: string, sources: readonly ContentSource[], files: readonly string[]): number {
  const staticDir = path.join(cwd, "dist", "static");
  if (!files.length || !fs.existsSync(staticDir)) return 0;
  const trees = contentTrees(cwd, sources);
  let copied = 0;
  for (const rel of files) {
    const src = contentFileOf(trees, rel);
    if (!src) continue; // vanished since the freeze — skip, never fail the build
    const dest = path.join(staticDir, "assets", ...rel.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied++;
  }
  return copied;
}

/** The dev/asset resource route, generated at .june/routes/assets/[[...path]]/route.ts. Serves the
 *  manifest's files from DISK at request time (dev: staleness-free; production workers: the
 *  computed import fails harmlessly → 404, static hosts never reach it — files exist). */
export function renderAssetsRoute(relTreesFromRouteDir: readonly { root: string; mount: string }[]): string {
  const trees = JSON.stringify(relTreesFromRouteDir);
  return (
    "// @kura-generated — serves referenced content images in dev (production static builds copy\n" +
    "// them to dist/static/assets/; worker targets 404 here — the fs import fails harmlessly).\n" +
    'import { ASSETS } from "../../../../app/_assets";\n' +
    "const TYPES: Record<string, string> = { png: \"image/png\", jpg: \"image/jpeg\", jpeg: \"image/jpeg\", gif: \"image/gif\", svg: \"image/svg+xml\", webp: \"image/webp\", avif: \"image/avif\", ico: \"image/x-icon\" };\n" +
    `const TREES: { root: string; mount: string }[] = ${trees};\n` +
    "const FILES = new Set(ASSETS.files);\n" +
    "export default async (_req: Request, ctx: { params: Record<string, string | undefined> }): Promise<Response> => {\n" +
    "  const rel = ctx.params.path ?? \"\";\n" +
    "  if (!FILES.has(rel)) return new Response(null, { status: 404 });\n" +
    "  try {\n" +
    "    const fsMod = \"node:fs/promises\";\n" +
    "    const { readFile } = await import(/* @vite-ignore */ fsMod); // computed: stays out of worker graphs\n" +
    "    for (const t of TREES) {\n" +
    "      const sub = t.mount ? (rel.startsWith(t.mount + \"/\") ? rel.slice(t.mount.length + 1) : null) : rel;\n" +
    "      if (sub == null) continue;\n" +
    "      try {\n" +
    "        const bytes = await readFile(new URL(t.root + \"/\" + sub, import.meta.url));\n" +
    "        const ext = rel.split(\".\").pop()?.toLowerCase() ?? \"\";\n" +
    "        return new Response(bytes, { headers: { \"content-type\": TYPES[ext] ?? \"application/octet-stream\" } });\n" +
    "      } catch { /* try the next tree */ }\n" +
    "    }\n" +
    "  } catch { /* no fs on this target */ }\n" +
    "  return new Response(null, { status: 404 });\n" +
    "};\n"
  );
}

/** Read back the frozen manifest's file list (the post-build copy runs in a separate invocation
 *  from the freeze). Tolerant: absent/unparsable → empty (the copy becomes a no-op). */
export function readFrozenAssetFiles(cwd: string): string[] {
  try {
    const txt = fs.readFileSync(path.join(cwd, "app", "_assets.ts"), "utf8");
    const m = /JSON\.parse\((".*")\)/.exec(txt);
    if (!m) return [];
    const data = JSON.parse(JSON.parse(m[1]!)) as { files?: string[] };
    return data.files ?? [];
  } catch {
    return [];
  }
}
