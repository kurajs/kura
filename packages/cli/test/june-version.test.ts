import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { juneServerVersion, supportsRouteLlms } from "../src/june-version.ts";

test("supportsRouteLlms: from @junejs/server 1.0.0-dev.29 on, never before", () => {
  for (const v of ["1.0.0-dev.29", "1.0.0-dev.30", "1.0.0-dev.100", "1.0.0", "1.0.1", "1.2.0", "2.0.0-dev.1"]) {
    assert.equal(supportsRouteLlms(v), true, v);
  }
  // 0.x is the stable line Kura ships on today; dev.28 is the release before the feature
  for (const v of ["0.1.0", "0.1.1", "0.0.51", "1.0.0-dev.28", "1.0.0-dev.2", "1.0.0-rc.1", "garbage", null]) {
    assert.equal(supportsRouteLlms(v), false, String(v));
  }
});

// A project layout the way a package manager lays it out: node_modules/.bin/june is a symlink into
// @junejs/cli, and @junejs/server resolves from there.
function project(serverVersion: string | null): { root: string; bin: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kura-june-version-"));
  const nm = path.join(root, "node_modules");
  const cliDir = path.join(nm, "@junejs", "cli");
  fs.mkdirSync(path.join(cliDir, "bin"), { recursive: true });
  fs.writeFileSync(path.join(cliDir, "package.json"), JSON.stringify({ name: "@junejs/cli", version: "0.0.52", bin: { june: "bin/june.js" } }));
  fs.writeFileSync(path.join(cliDir, "bin", "june.js"), "#!/usr/bin/env node\n");
  if (serverVersion) {
    const serverDir = path.join(nm, "@junejs", "server");
    fs.mkdirSync(path.join(serverDir, "dist"), { recursive: true });
    // exports without "./package.json" — like the real package, so the version is read by walking up
    fs.writeFileSync(path.join(serverDir, "package.json"), JSON.stringify({
      name: "@junejs/server",
      version: serverVersion,
      exports: { ".": { default: "./dist/index.js" } },
    }));
    fs.writeFileSync(path.join(serverDir, "dist", "index.js"), "export {};\n");
  }
  fs.mkdirSync(path.join(nm, ".bin"), { recursive: true });
  const bin = path.join(nm, ".bin", "june");
  fs.symlinkSync(path.join("..", "@junejs", "cli", "bin", "june.js"), bin);
  return { root, bin };
}

test("juneServerVersion: reads the @junejs/server the june bin resolves", () => {
  const { root, bin } = project("1.0.0-dev.29");
  try {
    assert.equal(juneServerVersion(bin), "1.0.0-dev.29");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("juneServerVersion: null when there is no bin or no resolvable server (→ older-June behavior)", () => {
  assert.equal(juneServerVersion(null), null);
  const { root, bin } = project(null);
  try {
    assert.equal(juneServerVersion(bin), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
