// In-content link resolution — the 3-tier resolver behind rewriteDocLinks.
//
// A doc's authored links come in repo-relative shapes ("other.md", "../RECEIPTS.md#a",
// "../../KNOWN_ISSUES.md", "../tests/harness.rs") that only mean something relative to the FILE the
// author was editing. Rendered on a site, each link must become one of:
//
//   tier 1  a page on this site            → the site URL (locale + deploy prefix composed)
//   tier 2  a repo file NOT on the site    → the repo's web URL (GitHub blob/tree, anchor kept)
//   tier 3  nothing we can prove exists    → left byte-for-byte as authored
//
// Tiers 1–2 need two things the renderer alone doesn't have: each entry's SOURCE PATH in the repo
// (to resolve "../" against) and an existence oracle for repo files. Both are frozen at build time
// by `kura index` into app/_links.ts (LinkData) — the CLI walks the same trees June scans and asks
// git for the corpus-reachable file set. At render time resolution is pure lookups, identical on
// dev/Workers/static.
//
// Everything here is OPTIONAL by construction: with no LinkData (an older CLI, or a direct
// createDocs caller), resolveLink degrades to exactly the legacy slug/basename matching that
// shipped before this module existed — no link that worked yesterday changes today. The legacy
// matcher also stays as the rescue net UNDER the path tiers, so moved files keep resolving.

import type { DocLike } from "./nav.ts";

/** Frozen by `kura index` as app/_links.ts; absent on older CLIs (resolver degrades to legacy). */
export type LinkData = {
  /** Repo web URL ("https://github.com/owner/name") or null when undetectable. Tier-2 URLs are
   *  GitHub-shaped (/blob/, /tree/) — GitHub and GHES; other forges need a future URL template. */
  repoUrl: string | null;
  /** Git ref for blob/tree URLs — the exact commit sha in CI, "HEAD" for local builds. */
  ref?: string;
  /** slug → repo-relative source path of the entry's default-locale file ("docs/cookbook/x.md"). */
  sourcePaths: Record<string, string>;
  /** locale → slug → the variant's OWN source path ("docs/ja/guide.md"). i18n mirrors live one
   *  directory deeper, so their relative links resolve against a different base than the default
   *  file's — a variant page must use its own path. Missing entries fall back to sourcePaths. */
  localeSourcePaths?: Record<string, Record<string, string>>;
  /** Repo-relative, git-tracked FILE paths that authored links actually reach (corpus-filtered —
   *  never the whole index, so a monorepo can't bloat the worker bundle). */
  repoFiles?: readonly string[];
  /** Repo-relative, git-tracked DIRECTORY paths that authored links reach (trailing-slash links). */
  repoDirs?: readonly string[];
};

export type LinkContext = {
  /** Legacy matching (pre-LinkData behavior): the doc slug set + basename fallback map. */
  slugSet: ReadonlySet<string>;
  byBasename: ReadonlyMap<string, readonly string[]>;
  /** Path tiers (present only with LinkData): repo path → slug, incl. index/README aliases. */
  slugByPath?: ReadonlyMap<string, string>;
  /** Folder-page lookup: repo DIR path → the slug of its collapsed index/README entry. */
  dirSlugByPath?: ReadonlyMap<string, string>;
  repoUrl?: string | null;
  ref?: string;
  repoFiles?: ReadonlySet<string>;
  repoDirs?: ReadonlySet<string>;
};

// ── Content assets (images) ──────────────────────────────────────────────────────────────────────
// Images referenced by docs live in the CONTENT tree (docs/user-guide/images/x.png). The CLI freezes
// an asset manifest in CONTENT-relative coordinates (always derivable — repo paths can be absent in
// isolated builds), the build copies the referenced files under /assets/<content-rel>, and the
// renderer rewrites <img src> (and markdown image targets) to that absolute URL. Assets are language-
// less: locale mirrors share the default tree's files, so URLs never carry a locale prefix.

/** Frozen by `kura index` as app/_assets.ts; absent on older CLIs → image handling stays authored. */
export type AssetData = {
  /** slug → content-relative source path of the entry's default file ("user-guide/x.md"). */
  contentPaths: Record<string, string>;
  /** locale → slug → the variant's own content-relative path ("zh-cn/user-guide/x.md"). */
  localeContentPaths?: Record<string, Record<string, string>>;
  /** Content-relative paths of REFERENCED image files that exist on disk (corpus-filtered). */
  files: readonly string[];
};

export type AssetContext = {
  files: ReadonlySet<string>;
  contentPaths: Record<string, string>;
  localeContentPaths?: Record<string, Record<string, string>>;
};

export function buildAssetContext(assets?: AssetData): AssetContext | undefined {
  if (!assets || !assets.files.length) return undefined;
  return { files: new Set(assets.files), contentPaths: assets.contentPaths, localeContentPaths: assets.localeContentPaths };
}

const own = (o: Record<string, string> | undefined, k: string): string | undefined =>
  o && Object.hasOwn(o, k) ? o[k] : undefined;

/**
 * Resolve an authored image src for the entry (slug + its own locale) to the site's asset URL, or
 * null (= leave authored). Resolution is two-step for locale variants: the variant's own content
 * path first, then the DEFAULT entry's (mirrors are one directory deeper, but share the default
 * tree's asset files). `toAssetHref` prepends the deploy prefix — never a locale prefix.
 */
export function resolveAsset(
  src: string,
  entry: { slug: string; locale?: string },
  ctx: AssetContext,
  toAssetHref: (contentRelPath: string) => string,
): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") || src.startsWith("/") || src.startsWith("#") || src === "")
    return null; // schemes (incl. data:), protocol-relative, site-absolute, anchors: authored
  const bases = [
    entry.locale ? own(ctx.localeContentPaths?.[entry.locale], entry.slug) : undefined,
    own(ctx.contentPaths, entry.slug),
  ].filter((b): b is string => b != null);
  for (const base of bases) {
    const cand = resolveRepoPath(base, src); // same pure path join + per-segment decoding
    if (cand != null && ctx.files.has(cand)) return toAssetHref(cand);
  }
  return null;
}

/** Rewrite <img src="…"> attributes (the <a href> side stays rewriteDocLinks' job). */
export function rewriteImgSrcs(html: string, resolve: (src: string) => string | null): string {
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"]*)(")/gi, (m, pre: string, src: string, post: string) => {
    const u = resolve(src);
    return u == null ? m : pre + u + post;
  });
}

/** "owner/name" shorthand or a full URL → a normalized web URL (no trailing slash / .git). */
export function normalizeRepoUrl(repo: string): string {
  const r = repo.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(r) ? r : `https://github.com/${r}`;
}

/** Build the legacy maps from the frozen DOCS (extracted verbatim from the old app.tsx closure). */
export function legacyMaps(entries: readonly DocLike[]): {
  slugSet: Set<string>;
  byBasename: Map<string, string[]>;
} {
  const slugSet = new Set<string>(entries.map((d) => d.slug));
  const byBasename = new Map<string, string[]>();
  for (const d of entries) {
    const b = d.slug.split("/").pop() ?? d.slug;
    const arr = byBasename.get(b);
    arr ? arr.push(d.slug) : byBasename.set(b, [d.slug]);
  }
  return { slugSet, byBasename };
}

/** Assemble the full context from the frozen pieces. `repoOverride` is config.repo: a string wins
 *  over LinkData's detected URL (mirrors/canonical-upstream cases); `false` hard-disables tier 2. */
export function buildLinkContext(
  entries: readonly DocLike[],
  links?: LinkData,
  repoOverride?: string | false,
): LinkContext {
  const { slugSet, byBasename } = legacyMaps(entries);
  if (!links) return { slugSet, byBasename };
  const slugByPath = new Map<string, string>();
  const dirSlugByPath = new Map<string, string>();
  const register = (path: string, slug: string) => {
    slugByPath.set(path, slug);
    // A collapsed index/README owns its folder: alias the sibling spellings (authors write either),
    // and register the DIRECTORY itself so "cookbook/" and "../" resolve to the folder page.
    const m = /^(.*?)\/?(index|README)\.(md|mdx)$/i.exec(path);
    if (m) {
      const dir = m[1] ?? "";
      for (const alt of ["index", "README"]) {
        for (const ext of ["md", "mdx"]) slugByPath.set(dir ? `${dir}/${alt}.${ext}` : `${alt}.${ext}`, slug);
      }
      dirSlugByPath.set(dir, slug);
    }
  };
  for (const [slug, path] of Object.entries(links.sourcePaths)) register(path, slug);
  // Locale-variant paths resolve to the SAME slugs, so a link normalized against a variant base
  // ("docs/ja/…") tier-1 resolves too (the caller's toDocHref supplies the locale prefix) instead
  // of leaking to the repo oracle or the basename guesser.
  for (const bySlug of Object.values(links.localeSourcePaths ?? {}))
    for (const [slug, path] of Object.entries(bySlug)) register(path, slug);
  const repoUrl =
    repoOverride === false ? null : repoOverride ? normalizeRepoUrl(repoOverride) : links.repoUrl;
  return {
    slugSet,
    byBasename,
    slugByPath,
    dirSlugByPath,
    repoUrl,
    ref: links.ref ?? "HEAD",
    repoFiles: links.repoFiles ? new Set(links.repoFiles) : undefined,
    repoDirs: links.repoDirs ? new Set(links.repoDirs) : undefined,
  };
}

/** Join an authored relative target onto the linking file's repo directory, pure-POSIX. Returns
 *  null when the path escapes the repo root (`../../..` beyond top) — those can't be proven,
 *  tier 3. Escapes decode PER SEGMENT (an authored %2F can't become a separator), and mid-path
 *  ".." / "." normalize ("planning/../SECURITY.md" → "SECURITY.md"). Exported for the CLI's
 *  corpus scan, so candidate extraction and runtime resolution share one implementation. */
export function resolveRepoPath(fromPath: string, target: string): string | null {
  const decoded = target
    .split("/")
    .map((seg) => {
      try {
        const dec = decodeURIComponent(seg); // authored "%20" etc. → the on-disk name
        return dec.includes("/") ? seg : dec;
      } catch {
        return seg; // malformed escape → match the raw spelling
      }
    })
    .join("/");
  const base = fromPath.split("/").slice(0, -1); // dirname
  const out: string[] = [...base];
  for (const seg of decoded.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null; // escapes the repo
      out.pop();
    } else out.push(seg);
  }
  return out.join("/");
}

const encodePath = (p: string): string => p.split("/").map(encodeURIComponent).join("/");

/**
 * Resolve one authored href. Returns the replacement URL or null (= leave as authored).
 *
 * `fromPath` is the linking doc's repo-relative source path (undefined without LinkData — path
 * tiers off, legacy only). `toDocHref` maps a slug to its final page URL (the caller binds locale,
 * docs mount, and deploy prefix — and the ".md flavor" for agent surfaces).
 */
export function resolveLink(
  href: string,
  fromPath: string | undefined,
  ctx: LinkContext,
  toDocHref: (slug: string) => string,
): string | null {
  // Guards, verbatim from the legacy resolver: schemes, protocol-relative, bare anchors.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) return null;
  const hashAt = href.indexOf("#");
  const rawPath = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  if (rawPath === "") return null;

  // Path tiers — only for relative targets with a known source location. Site-absolute hrefs
  // ("/guide.md") keep their historical legacy treatment (leading slashes stripped there).
  if (fromPath && ctx.slugByPath && !rawPath.startsWith("/")) {
    const norm = resolveRepoPath(fromPath, rawPath);
    if (norm != null) {
      // tier 1: the target IS a page on this site (file path first, then folder page).
      const slug = ctx.slugByPath.get(norm) ?? ctx.dirSlugByPath?.get(norm);
      if (slug !== undefined) return toDocHref(slug) + hash;
      // tier 2: a git-tracked file/dir that is NOT on the site → the repo's web view.
      if (ctx.repoUrl) {
        const ref = ctx.ref ?? "HEAD";
        if (ctx.repoFiles?.has(norm)) return `${ctx.repoUrl}/blob/${ref}/${encodePath(norm)}${hash}`;
        if (ctx.repoDirs?.has(norm)) return `${ctx.repoUrl}/tree/${ref}/${encodePath(norm)}${hash}`;
      }
    }
  }

  // Legacy rescue net — the exact pre-LinkData algorithm, unchanged (.md links only): strip the
  // extension and every leading "../", match a slug exactly, else by shallowest basename.
  if (!/\.md$/i.test(rawPath)) return null;
  const clean = rawPath.replace(/\.md$/i, "").replace(/^(\.\.?\/)+/, "").replace(/^\/+/, "");
  if (ctx.slugSet.has(clean)) return toDocHref(clean) + hash;
  const cands = ctx.byBasename.get(clean.split("/").pop() ?? "");
  if (cands?.length) {
    const best = [...cands].sort(
      (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
    )[0]!;
    return toDocHref(best) + hash;
  }
  return null;
}

// ── Markdown-surface rewriting ────────────────────────────────────────────────────────────────────
// The .md/.json projections and the search corpus ship AUTHORED markdown; agents follow its links
// too. Rewrite inline `[t](target)` and reference definitions `[label]: target` with the SAME
// resolver, but never inside fenced code blocks or inline code spans (transcripts and examples in
// real docs contain link-shaped text), and never images (`![](…)` stays authored).

const INLINE_LINK = /(!?)\[((?:[^[\]]|\[[^\]]*\])*)\]\(([^()\s]+)((?:[ \t]+"[^"]*")?)\)/g;
const REF_DEF = /^([ \t]{0,3}\[(?!\^)[^\]]+\]:[ \t]*)(\S+)/;

function rewriteSegment(
  seg: string,
  resolve: (href: string) => string | null,
  resolveImage?: (src: string) => string | null,
): string {
  return seg.replace(INLINE_LINK, (m, bang: string, text: string, target: string, title: string) => {
    if (bang) {
      // Images stay authored unless an asset resolver is bound (the content-image pipeline).
      const u = resolveImage?.(target) ?? null;
      return u == null ? m : `![${text}](${u}${title})`;
    }
    const u = resolve(target);
    return u == null ? m : `[${text}](${u}${title})`;
  });
}

/** Rewrite link targets in markdown, fence/code-span aware. Pure; used per agent surface.
 *  `opts.resolveImage` additionally rewrites image targets (absent → images stay authored). */
export function rewriteMarkdownLinks(
  md: string,
  resolve: (href: string) => string | null,
  opts?: { resolveImage?: (src: string) => string | null },
): string {
  const out: string[] = [];
  let inFence = false;
  let fenceMark = "";
  let fenceLen = 0;
  for (const line of md.split("\n")) {
    const fence = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const run = fence[1]!;
      if (!inFence) {
        inFence = true;
        fenceMark = run[0]!;
        fenceLen = run.length;
      } else if (run[0] === fenceMark && run.length >= fenceLen && fence[2]!.trim() === "") {
        // CommonMark closer: same char, at least the opening length, nothing but whitespace after.
        inFence = false;
      }
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const ref = REF_DEF.exec(line);
    if (ref) {
      const u = resolve(ref[2]!);
      out.push(u == null ? line : line.slice(0, ref[1]!.length) + u + line.slice(ref[1]!.length + ref[2]!.length));
      continue;
    }
    out.push(rewriteLineLinks(line, resolve, opts?.resolveImage));
  }
  return out.join("\n");
}

/** CommonMark code spans in a line: an opener of N backticks is closed by the NEXT run of exactly
 *  N (a span can contain shorter/longer runs); an unmatched run is literal text. Line-scoped:
 *  multi-line spans are rare in docs and the fence pass above guards the multi-line code shapes. */
function codeSpansOf(line: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    let n = i;
    while (n < line.length && line[n] === "`") n++;
    const runLen = n - i;
    let j = n;
    let close = -1;
    while (j < line.length) {
      if (line[j] === "`") {
        let k = j;
        while (k < line.length && line[k] === "`") k++;
        if (k - j === runLen) {
          close = k;
          break;
        }
        j = k;
      } else j++;
    }
    if (close >= 0) {
      spans.push({ start: i, end: close });
      i = close;
    } else i = n; // unmatched run: literal text
  }
  return spans;
}

// Rewrite a line's links unless the TARGET sits inside a code span. The span rule is about quoting:
// a link-shaped example inside code (a whole link inside backticks) must stay verbatim — but a real link whose TEXT
// is code (backticked file names as link text, everywhere in real docs) is still a link and must rewrite.
// Splitting the line around spans broke exactly that shape (the "](target)" lost its "[text").
function rewriteLineLinks(
  line: string,
  resolve: (href: string) => string | null,
  resolveImage?: (src: string) => string | null,
): string {
  const spans = codeSpansOf(line);
  const inSpan = (pos: number): boolean => spans.some((sp) => pos >= sp.start && pos < sp.end);
  return line.replace(INLINE_LINK, (m, bang: string, _text: string, target: string, title: string, offset: number) => {
    // The target's absolute position: the match ends `(target[ title])`.
    const targetStart = offset + m.length - 1 - title.length - target.length;
    if (inSpan(targetStart)) return m; // quoted example inside a code span
    const u = bang ? (resolveImage?.(target) ?? null) : resolve(target);
    return u == null ? m : m.slice(0, targetStart - offset) + u + m.slice(targetStart - offset + target.length);
  });
}
