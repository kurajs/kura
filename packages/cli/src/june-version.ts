// Which June the CLI will run, so the generated shims can use features that exist in it. Kept
// separate from cli.ts (which runs a command on import) so the logic is unit-testable.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// June lists a route's `llms` export in /llms.txt from @junejs/server 1.0.0-dev.29 on. Older June
// ignores the export, so Kura must keep its own hand-built docs list there.
export function supportsRouteLlms(serverVersion: string | null): boolean {
  if (!serverVersion) return false;
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(serverVersion);
  if (!m) return false;
  const major = Number(m[1]);
  if (major !== 1) return major > 1;
  if (Number(m[2]) > 0 || Number(m[3]) > 0) return true;
  const pre = m[4];
  if (!pre) return true; // 1.0.0 stable
  const dev = /^dev\.(\d+)$/.exec(pre);
  return dev ? Number(dev[1]) >= 29 : false; // other 1.0.0 prereleases predate the feature
}

// Walk up from `file` to the package.json whose name is `name`; its version, or null.
function versionOf(file: string, name: string): string | null {
  let dir = path.dirname(file);
  for (;;) {
    const p = path.join(dir, "package.json");
    if (fs.existsSync(p)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(p, "utf8")) as { name?: string; version?: string };
        if (pkg.name === name) return pkg.version ?? null;
      } catch {
        // unreadable package.json — keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// The version of the @junejs/server that `juneBin` (the resolved `june` bin) runs: the bin belongs
// to @junejs/cli, and the server is resolved from that package — the same module the running June
// loads. The package is found next to the bin's .bin directory (node_modules/.bin → node_modules/
// @junejs/cli), not by following the bin: on Windows the bin is a .cmd shim, a plain file that
// realpath can't follow. Null when it can't be determined; callers then assume an older June.
export function juneServerVersion(juneBin: string | null): string | null {
  if (!juneBin) return null;
  try {
    const cliPkg = path.join(path.dirname(juneBin), "..", "@junejs", "cli", "package.json");
    const from = fs.existsSync(cliPkg) ? fs.realpathSync(cliPkg) : fs.realpathSync(juneBin);
    const serverEntry = createRequire(from).resolve("@junejs/server");
    return versionOf(serverEntry, "@junejs/server");
  } catch {
    return null;
  }
}
