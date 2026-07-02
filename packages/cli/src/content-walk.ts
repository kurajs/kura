// Filesystem walks over the docs content tree(s): meta.json nav collection, lastUpdated git
// dates, and locale discovery. Extracted from cli.ts (which dispatches a command on import and
// can't be pulled into a test) so the walks are unit-testable — and extended for docs-as-code
// content sources (kura.config `content.sources`): each source dir outside content/docs is
// walked like a mounted subtree of the docs collection, mirroring what June's `content.sources`
// does for the entries themselves at `june gen`.
import { parseMeta, validatePages, type MetaMap } from "@kurajs/docs/meta";
import type { ContentSource } from "./config-read.js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const LOCALE_DIR = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// A docs-collection source resolved to an absolute dir. Non-"docs" collections are June's business
// (entries only); Kura's nav/dates/locales concern the docs collection it serves.
type ResolvedSource = { abs: string; mount?: string };
export function resolveDocsSources(cwd: string, sources: readonly ContentSource[]): ResolvedSource[] {
  return sources
    .filter((s) => s.collection === "docs")
    .map((s) => ({ abs: path.resolve(cwd, s.dir), ...(s.mount ? { mount: s.mount } : {}) }));
}

// Walk one meta tree (default OR a single locale's mirror) → a folder-path-keyed MetaMap, STRICTLY
// validated. `skipTopLocales` excludes top-level locale buckets (true for the default tree, false
// inside a locale's own mirror). `wherePrefix` prefixes error locations (e.g. "ja-JP/") so a bad
// locale meta is unambiguous. Folder paths are keyed RELATIVE to the tree root — `keyPrefix` (a
// source's mount) shifts them to their merged position ("schema" → root meta keys as "schema",
// sub "x" as "schema/x"). `extraRootChildren` are top-level folders contributed by OTHER trees
// (mounted sources), so the root meta.json's tabs/pages validation doesn't false-positive on them.
export function walkMetaTree(
  rootDir: string,
  skipTopLocales: boolean,
  wherePrefix = "",
  opts?: { keyPrefix?: string; extraRootChildren?: ReadonlySet<string> },
): { meta: MetaMap; errors: string[] } {
  const meta: MetaMap = {};
  const errors: string[] = [];
  if (!fs.existsSync(rootDir)) return { meta, errors };
  const keyPrefix = opts?.keyPrefix ?? "";
  const keyOf = (rel: string) => (rel ? (keyPrefix ? `${keyPrefix}/${rel}` : rel) : keyPrefix);
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
      if (rel === "") for (const c of opts?.extraRootChildren ?? []) children.add(c);
      errors.push(...validatePages(parsed.meta, children, where));
      // Root-only: every tab's pages must reference a real top-level folder.
      if (rel === "" && parsed.meta.tabs) {
        for (const t of parsed.meta.tabs)
          for (const p of t.pages)
            if (!children.has(p)) errors.push(`${where}: tab "${t.title}" lists "${p}", which is not a top-level folder (have: ${[...children].sort().join(", ") || "none"})`);
      }
      meta[keyOf(rel)] = parsed.meta;
    }
    for (const e of ents) {
      if (e.isDirectory() && !skipped(rel, e.name)) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
    }
  };
  walk(rootDir, "");
  return { meta, errors };
}

// Merge a source tree's meta into the collected map, failing LOUDLY when two trees claim the same
// folder key — a silent last-wins would apply one tree's nav to the other's folder with no error.
function mergeMeta(into: MetaMap, add: MetaMap, errors: string[], label: string): void {
  for (const [key, value] of Object.entries(add)) {
    if (key in into) {
      errors.push(`${label}: meta.json for "${key || "."}" is defined by more than one content tree — keep one, or mount the source elsewhere`);
      continue;
    }
    into[key] = value;
  }
}

// Collect the default nav metadata PLUS every locale mirror's overrides, across content/docs AND
// the configured docs-collection sources. The default tree skips top-level locale buckets; each
// `<tree>/<locale>/` is then walked as its own mirror, so a locale's meta.json keys match the
// default's by folder path (createDocs merges them per-locale). A locale typically overrides only
// `title` (folder group label); omitted fields fall back.
export function collectMeta(
  cwd: string,
  sources: readonly ContentSource[] = [],
): { meta: MetaMap; metaLocales: Record<string, MetaMap>; errors: string[] } {
  const root = path.join(cwd, "content", "docs");
  const srcs = resolveDocsSources(cwd, sources);
  // Virtual top-level children the sources contribute to the merged tree, so the root meta.json's
  // tabs/pages can reference them: a mount's first segment, or an unmounted source's own top-level
  // folders and pages.
  const extraRootChildren = new Set<string>();
  for (const s of srcs) {
    if (s.mount) extraRootChildren.add(s.mount.split("/")[0]!);
    else if (fs.existsSync(s.abs)) {
      for (const e of fs.readdirSync(s.abs, { withFileTypes: true })) {
        if (e.isDirectory() && !LOCALE_DIR.test(e.name)) extraRootChildren.add(e.name);
        else if (/\.mdx?$/.test(e.name)) extraRootChildren.add(e.name.replace(/\.mdx?$/, ""));
      }
    }
  }
  const errors: string[] = [];
  const { meta, errors: e0 } = walkMetaTree(root, true, "", { extraRootChildren });
  errors.push(...e0);
  const metaLocales: Record<string, MetaMap> = {};
  const localeWalk = (treeRoot: string, wherePrefix: string, keyPrefix?: string) => {
    if (!fs.existsSync(treeRoot)) return;
    for (const ent of fs.readdirSync(treeRoot, { withFileTypes: true })) {
      if (!ent.isDirectory() || !LOCALE_DIR.test(ent.name)) continue;
      const { meta: lm, errors: le } = walkMetaTree(path.join(treeRoot, ent.name), false, `${wherePrefix}${ent.name}/`, { keyPrefix });
      errors.push(...le);
      if (!Object.keys(lm).length) continue;
      metaLocales[ent.name] ??= {};
      mergeMeta(metaLocales[ent.name]!, lm, errors, `${wherePrefix}${ent.name}`);
    }
  };
  localeWalk(root, "");
  for (const s of srcs) {
    const { meta: sm, errors: se } = walkMetaTree(s.abs, true, `${s.abs}/`, { keyPrefix: s.mount });
    errors.push(...se);
    mergeMeta(meta, sm, errors, s.abs);
    localeWalk(s.abs, `${s.abs}/`, s.mount);
  }
  return { meta, metaLocales, errors };
}

// Last git commit (committer) date for a file as ISO-8601, or null when there's no history
// (uncommitted, or a shallow CI clone) or git is unavailable. Never throws — the lastUpdated feature
// degrades to "no date" rather than failing the build.
export function gitDateOf(file: string, cwd: string): string | null {
  try {
    // A cwd-relative, POSIX-slashed pathspec — unambiguous and portable (an absolute or backslashed
    // path is not a reliable git pathspec across platforms). "../docs/x.md" works as long as the
    // source lives in the SAME git repo (the docs-as-code monorepo case); outside it, git errors
    // and the date degrades to null.
    const rel = path.relative(cwd, file).split(path.sep).join("/");
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", rel], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// Per-doc last-updated dates (slug → ISO date) across content/docs and the docs-collection
// sources. Slugs mirror June's slugOf: extension stripped, a trailing index/README collapses to
// its folder — so a mounted source's root README dates the mount's own page. Top-level locale
// dirs are variants, not default docs — skipped per TREE root (`top`), not per merged path,
// because a mounted tree's paths never have rel === "". `dateOf` is injectable for tests.
export function collectLastUpdated(
  cwd: string,
  sources: readonly ContentSource[] = [],
  dateOf: (file: string, cwd: string) => string | null = gitDateOf,
): Record<string, string> {
  const lastUpdated: Record<string, string> = {};
  const walkDates = (dir: string, rel: string, top: boolean) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (top && LOCALE_DIR.test(e.name)) continue; // top-level <locale>/ dirs are variants, not default docs
        walkDates(path.join(dir, e.name), childRel, false);
      } else if (/\.(md|mdx)$/.test(e.name)) {
        const slug = childRel.replace(/\.(md|mdx)$/, "").replace(/(^|\/)(index|README)$/i, ""); // mirrors June's slugOf
        const iso = dateOf(path.join(dir, e.name), cwd);
        if (iso) lastUpdated[slug] = iso;
      }
    }
  };
  walkDates(path.join(cwd, "content", "docs"), "", true);
  for (const s of resolveDocsSources(cwd, sources)) walkDates(s.abs, s.mount ?? "", true);
  return lastUpdated;
}

// Locales that have variant content: `content/<collection>/<locale>/` dirs, plus each configured
// source's top-level `<locale>/` mirrors — so a translated external docs/ lights up its locale in
// the index and MDX buckets just like a translated content/docs would.
export function discoverLocales(cwd: string, sources: readonly ContentSource[] = []): Set<string> {
  const locales = new Set<string>();
  const contentRoot = path.join(cwd, "content");
  if (fs.existsSync(contentRoot)) {
    for (const col of fs.readdirSync(contentRoot, { withFileTypes: true })) {
      if (!col.isDirectory()) continue;
      for (const sub of fs.readdirSync(path.join(contentRoot, col.name), { withFileTypes: true })) {
        if (sub.isDirectory() && LOCALE_DIR.test(sub.name)) locales.add(sub.name);
      }
    }
  }
  for (const s of resolveDocsSources(cwd, sources)) {
    if (!fs.existsSync(s.abs)) continue;
    for (const sub of fs.readdirSync(s.abs, { withFileTypes: true })) {
      if (sub.isDirectory() && LOCALE_DIR.test(sub.name)) locales.add(sub.name);
    }
  }
  return locales;
}
