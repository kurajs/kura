// Docs route placement derived from `basePath`. June ties URLs to disk layout (no route-prefix
// config), so the docs catch-all route FILE must live at the subtree matching `basePath` or every
// basePath-derived link 404s. Kept separate from cli.ts (which runs a command on import) so the pure
// logic is unit-testable. Mirrors @kurajs/docs' normalizeBasePath semantics.
import fs from "node:fs";
import path from "node:path";

// Parse the docs `basePath` from kura.config.ts SOURCE TEXT into URL path segments. Never imports
// the config (no user code runs): absent → "/docs" → ["docs"]; "" → site root → []; "/guide" or
// "guide/" → ["guide"]; "/a/b" → ["a","b"]. Comments are stripped first so a commented-out
// `basePath` can't move the route — `//` counts as a comment only at line start/after whitespace,
// so `https://…` inside a string survives (same guard the markdown/lastUpdated readers use).
export function parseBasePath(configText: string): string[] {
  const txt = configText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
  const m = txt.match(/\bbasePath\s*:\s*["']([^"']*)["']/);
  if (!m) return ["docs"]; // key absent → default "/docs"
  const segments = m[1]!.split("/").filter(Boolean); // trims leading/trailing/dup slashes; "" → []
  // Reject traversal/separator segments: "." / ".." / a backslash are meaningless in a URL prefix
  // and, joined into routesDir, would let the docs route escape .june/routes (a confusing config
  // mistake). Fail fast with the offending value so the user fixes basePath, not silently misplace files.
  for (const s of segments) {
    if (s === "." || s === ".." || s.includes("\\")) {
      throw new Error(`Invalid basePath ${JSON.stringify(m[1])}: segment ${JSON.stringify(s)} is not a valid URL path segment.`);
    }
  }
  return segments;
}

// `basePath` segments for the app at `cwd` (no kura.config.ts → default "/docs").
export function basePathSegments(cwd: string): string[] {
  const cfgPath = path.join(cwd, "kura.config.ts");
  if (!fs.existsSync(cfgPath)) return ["docs"];
  return parseBasePath(fs.readFileSync(cfgPath, "utf8"));
}

// The docs catch-all route dir + the relative import its page.tsx uses to reach routes/_kura.ts.
// The import climbs one "../" per basePath segment plus one for the "[[...slug]]" dir itself:
// "/docs" → routes/docs/[[...slug]] + "../../_kura"; "" → routes/[[...slug]] + "../_kura".
export function docsRoute(routesDir: string, segments: string[]): { docsDir: string; kuraImport: string } {
  return {
    docsDir: path.join(routesDir, ...segments, "[[...slug]]"),
    kuraImport: "../".repeat(segments.length + 1) + "_kura",
  };
}

// Remove a docs catch-all that a basePath change left behind. .june/routes is fully kura-owned
// (gitignored artifact), so any "[[...slug]]" dir other than `keep` is stale — without this,
// switching basePath would leave the old route live and June would keep serving the old URLs.
// Empty ancestor dirs are pruned back up to routesDir so no orphan folders remain.
export function pruneStaleDocsRoutes(routesDir: string, keep: string): void {
  if (!fs.existsSync(routesDir)) return;
  const pruneEmptyUp = (dir: string): void => {
    let cur = dir;
    while (cur !== routesDir && cur.startsWith(routesDir) && fs.existsSync(cur) && fs.readdirSync(cur).length === 0) {
      fs.rmdirSync(cur);
      cur = path.dirname(cur);
    }
  };
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (e.name === "[[...slug]]") {
        if (full !== keep) {
          fs.rmSync(full, { recursive: true, force: true });
          pruneEmptyUp(path.dirname(full));
        }
      } else {
        walk(full);
      }
    }
  };
  walk(routesDir);
}
