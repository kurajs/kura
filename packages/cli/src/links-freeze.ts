// Freeze app/_links.ts — the LinkData behind @kurajs/docs' 3-tier link resolver (links.ts there).
// The CLI is the only place with a filesystem AND git, so everything the resolver needs at render
// time is computed here once per `kura index` and frozen: each doc's repo-relative source path,
// the detected repo URL + ref, and a corpus-filtered oracle of git-tracked link targets (only
// paths that authored links actually reach — never the whole index, so a monorepo can't bloat the
// worker bundle). Mirrors content-walk.ts conventions (same tree walk, same slugOf rule).
import { rewriteMarkdownLinks, resolveRepoPath, normalizeRepoUrl } from "@kurajs/docs/links";
import type { ContentSource } from "./config-read.js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const posix = (p: string): string => p.split(path.sep).join("/");

/** The repo root paths are computed against: KURA_REPO_ROOT (the action builds in a temp dir with
 *  the checkout elsewhere), else `git rev-parse --show-toplevel`, else null (tier 2 off). */
export function repoRootOf(cwd: string, env: Record<string, string | undefined> = process.env): string | null {
  if (env.KURA_REPO_ROOT) return path.resolve(cwd, env.KURA_REPO_ROOT);
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Detected repo web URL + why. Precedence: config `repo` (string pins, false disables) >
 *  GITHUB_REPOSITORY > the origin remote — GitHub-shaped hosts only (tier-2 URLs are blob/tree). */
export function detectRepo(
  configRepo: string | false | undefined,
  env: Record<string, string | undefined> = process.env,
  remoteUrlOf: () => string | null = () => gitOriginUrl(),
): { url: string | null; reason: string } {
  if (configRepo === false) return { url: null, reason: "disabled by config (repo = false)" };
  if (typeof configRepo === "string" && configRepo.trim()) return { url: normalizeRepoUrl(configRepo), reason: "config" };
  // an empty/whitespace string is treated as unset (falls through to detection)
  if (env.GITHUB_REPOSITORY) return { url: `https://github.com/${env.GITHUB_REPOSITORY}`, reason: "GITHUB_REPOSITORY" };
  const remote = remoteUrlOf();
  if (!remote) return { url: null, reason: "no git remote detected" };
  const m =
    /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote) ??
    /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote) ??
    /^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote);
  if (m) return { url: `https://github.com/${m[1]}`, reason: "git remote" };
  return { url: null, reason: `non-GitHub remote (${remote.replace(/^[a-z+]+:\/\//i, "").split(/[/:]/)[0]})` };
}

/** The origin remote URL, read from `cwd` — pass the REPO ROOT when the build runs in a copied
 *  tree (the checkout is elsewhere; running git in the build dir would find nothing). */
export function gitOriginUrl(cwd?: string): string | null {
  try {
    const out = execFileSync("git", ["remote", "get-url", "origin"], {
      ...(cwd ? { cwd } : {}),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Git ref for tier-2 URLs: the exact commit in CI (immortal, matches what the build saw), HEAD
 *  locally (the branch is unknowable). */
export const linkRef = (env: Record<string, string | undefined> = process.env): string => env.GITHUB_SHA ?? "HEAD";

type SourceMap = Record<string, string>; // cwd-relative tree root → repo-relative base

/** KURA_SOURCE_MAP: where copied trees REALLY live in the repo (the action copies docs/ into
 *  content/docs/ inside a temp build dir) — JSON like {"content/docs":"docs"}. */
export function sourceMapOf(env: Record<string, string | undefined> = process.env): SourceMap {
  if (!env.KURA_SOURCE_MAP) return {};
  try {
    const parsed = JSON.parse(env.KURA_SOURCE_MAP) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: SourceMap = {};
      // values are repo-RELATIVE bases: strip accidental leading slashes too, or every mapped
      // path would come out absolute and poison the blob URLs.
      for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") out[posix(k)] = posix(v).replace(/^\/+|\/+$/g, "");
      return out;
    }
  } catch {
    /* fall through */
  }
  console.warn("kura index: links — KURA_SOURCE_MAP is not a JSON object of {tree: repoBase}; ignoring");
  return {};
}

/** Map an absolute file to its repo-relative path: an explicit KURA_SOURCE_MAP tree wins (copied
 *  trees), else relative-to-repo-root when the file is inside it, else undefined (unmappable). */
export function repoPathMapper(
  cwd: string,
  repoRoot: string | null,
  map: SourceMap,
): (absFile: string) => string | undefined {
  // Most-specific tree first: with overlapping roots ("content" and "content/docs"), the deeper
  // one must win regardless of object-key order.
  const treeAbs = Object.entries(map)
    .map(([tree, base]) => ({ abs: path.resolve(cwd, tree), base }))
    .sort((a, b) => b.abs.length - a.abs.length);
  return (absFile) => {
    const escapes = (rel: string): boolean => rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel);
    for (const t of treeAbs) {
      const rel = path.relative(t.abs, absFile);
      if (!escapes(rel)) return t.base ? `${t.base}/${posix(rel)}` : posix(rel);
    }
    if (repoRoot) {
      const rel = path.relative(repoRoot, absFile);
      if (!escapes(rel)) return posix(rel);
    }
    return undefined;
  };
}

/** Per-doc repo-relative source paths, default tree + declared locale mirrors. Same walk shape and
 *  slug rule as collectLastUpdated (extension stripped, index/README collapses to the folder). */
export function collectSourcePaths(
  cwd: string,
  sources: readonly ContentSource[],
  locales: ReadonlySet<string>,
  toRepoPath: (absFile: string) => string | undefined,
): { sourcePaths: Record<string, string>; localeSourcePaths: Record<string, Record<string, string>> } {
  // Null-prototype maps: assigning a "__proto__" slug to a plain object silently sets the
  // prototype (the doc would vanish); with no prototype it is just a key.
  const sourcePaths: Record<string, string> = Object.create(null);
  const localeSourcePaths: Record<string, Record<string, string>> = Object.create(null);
  const slugOf = (rel: string) => rel.replace(/\.(md|mdx)$/, "").replace(/(^|\/)(index|README)$/i, "");
  const walk = (dir: string, rel: string, top: boolean, into: Record<string, string>) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (top && locales.has(e.name)) continue; // locale mirrors are collected separately below
        walk(path.join(dir, e.name), childRel, false, into);
      } else if (/\.(md|mdx)$/.test(e.name)) {
        const repoPath = toRepoPath(path.join(dir, e.name));
        if (repoPath) into[slugOf(childRel)] = repoPath;
      }
    }
  };
  // Docs-collection sources resolved to absolute dirs (mirrors content-walk's resolveDocsSources —
  // kept inline: the cli's runtime relative imports stay zero so tests run under strip-types).
  const trees: { root: string; mount?: string }[] = [
    { root: path.join(cwd, "content", "docs") },
    ...sources
      .filter((s) => s.collection === "docs")
      .map((s) => ({ root: path.resolve(cwd, s.dir), ...(s.mount ? { mount: s.mount } : {}) })),
  ];
  for (const t of trees) {
    walk(t.root, t.mount ?? "", true, sourcePaths);
    for (const locale of locales) {
      const mirror = path.join(t.root, locale);
      if (!fs.existsSync(mirror)) continue;
      localeSourcePaths[locale] ??= Object.create(null);
      walk(mirror, t.mount ?? "", false, localeSourcePaths[locale]!);
    }
  }
  return { sourcePaths, localeSourcePaths };
}

/** Git-tracked files of the repo, or null when git/repo is unavailable (tier 2 degrades off). */
export function gitTrackedFiles(repoRoot: string): Set<string> | null {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    });
    return new Set(out.split("\0").filter(Boolean));
  } catch {
    return null;
  }
}

/** Corpus scan: every authored link target across the docs, resolved from each doc's own repo
 *  path, intersected with the tracked set → the frozen tier-2 oracle. Extraction reuses
 *  rewriteMarkdownLinks as a collector, so the scan grammar can't drift from the rewrite grammar. */
export function collectRepoTargets(
  docs: readonly { original?: string; fromPath?: string }[],
  tracked: ReadonlySet<string>,
): { repoFiles: string[]; repoDirs: string[] } {
  const files = new Set<string>();
  const dirs = new Set<string>();
  // Ancestor-dir set for O(1) directory-candidate checks.
  const trackedDirs = new Set<string>();
  for (const f of tracked) {
    const segs = f.split("/");
    for (let i = 1; i < segs.length; i++) trackedDirs.add(segs.slice(0, i).join("/"));
  }
  for (const d of docs) {
    if (!d.original || !d.fromPath) continue;
    const fromPath = d.fromPath;
    rewriteMarkdownLinks(d.original, (href) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) return null;
      const hashAt = href.indexOf("#");
      const target = hashAt >= 0 ? href.slice(0, hashAt) : href;
      if (target === "" || target.startsWith("/")) return null;
      const cand = resolveRepoPath(fromPath, target);
      if (cand == null || cand === "") return null;
      if (tracked.has(cand)) files.add(cand);
      else if (trackedDirs.has(cand)) dirs.add(cand);
      return null; // collector only — never rewrite
    });
  }
  return { repoFiles: [...files].sort(), repoDirs: [...dirs].sort() };
}

export type FrozenLinks = {
  repoUrl: string | null;
  ref: string;
  sourcePaths: Record<string, string>;
  localeSourcePaths?: Record<string, Record<string, string>>;
  repoFiles?: string[];
  repoDirs?: string[];
};

const sorted = (o: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/** Deterministic app/_links.ts source (stable writeIfChanged, like _dates.ts). */
export function renderLinksTs(data: FrozenLinks): string {
  const body: FrozenLinks = {
    repoUrl: data.repoUrl,
    ref: data.ref,
    sourcePaths: sorted(data.sourcePaths),
    ...(data.localeSourcePaths && Object.keys(data.localeSourcePaths).length
      ? {
          localeSourcePaths: Object.fromEntries(
            Object.entries(data.localeSourcePaths)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([l, m]) => [l, sorted(m)]),
          ),
        }
      : {}),
    ...(data.repoFiles?.length ? { repoFiles: data.repoFiles } : {}),
    ...(data.repoDirs?.length ? { repoDirs: data.repoDirs } : {}),
  };
  // JSON.parse (not an object literal): a literal "__proto__" key would SET the prototype instead
  // of defining a property; JSON.parse creates it as a plain own property.
  return (
    "// AUTO-GENERATED by `kura index` — frozen link-resolution data (see @kurajs/docs links.ts).\n" +
    "// Source paths let each page resolve its authored links from its own file; repoFiles/repoDirs\n" +
    "// are the corpus-filtered, git-tracked targets behind the repo-link fallback.\n" +
    'import type { LinkData } from "@kurajs/docs/links";\n' +
    `export const LINKS: LinkData = JSON.parse(${JSON.stringify(JSON.stringify(body))});\n`
  );
}
