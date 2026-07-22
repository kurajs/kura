// Guards the scaffold against the regressions in the first real-user feedback:
//  - P1: the generated /og route imports `workers-og`, so the template MUST declare it, or
//        `kura build`/`deploy` fail to resolve it.
//  - DX3: the quickstart told users to run `npm run gen`, which the template has no script for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tpl = JSON.parse(readFileSync(new URL("../template/package.json", import.meta.url), "utf8"));
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("template declares workers-og (the generated /og route imports it)", () => {
  assert.ok(tpl.dependencies["workers-og"], "template package.json must list workers-og in dependencies");
});

test("template declares the kura runtime deps", () => {
  assert.ok(tpl.dependencies["@kurajs/docs"], "needs @kurajs/docs");
  assert.ok(tpl.dependencies["react"] && tpl.dependencies["react-dom"], "needs react + react-dom");
  assert.ok(tpl.devDependencies["@kurajs/cli"], "needs @kurajs/cli (dev)");
});

// The template pins published ranges (not workspace:*), so a release that bumps
// @kurajs/docs or @kurajs/cli past the template's caret range would scaffold apps
// on stale majors. Caret semantics: ^0.y.z admits only 0.y.*; ^x.y.z admits x.*.
const caretCovers = (range: string, version: string) => {
  if (!range.startsWith("^")) return false;
  const [bMaj, bMin, bPat] = range.slice(1).split(".").map(Number);
  const [vMaj, vMin, vPat] = version.split(".").map(Number);
  if (vMaj !== bMaj) return false;
  if (bMaj === 0) return vMin === bMin && vPat! >= bPat!;
  return vMin! > bMin! || (vMin === bMin && vPat! >= bPat!);
};

test("template ranges cover the workspace versions of @kurajs/docs and @kurajs/cli", () => {
  for (const [dep, dir, deps] of [
    ["@kurajs/docs", "docs", tpl.dependencies],
    ["@kurajs/cli", "cli", tpl.devDependencies],
  ] as const) {
    const { version } = JSON.parse(read(`../../${dir}/package.json`));
    const range = deps[dep];
    assert.ok(
      caretCovers(range, version),
      `template's ${dep} range "${range}" does not cover the workspace version ${version} — bump the template`,
    );
  }
});

test("every `npm run X` in the quickstart maps to a real template script", () => {
  const scripts = new Set(Object.keys(tpl.scripts ?? {}));
  const qs = read("../template/content/docs/quickstart.md");
  for (const m of qs.matchAll(/npm run ([\w:-]+)/g)) {
    assert.ok(scripts.has(m[1]!), `quickstart references "npm run ${m[1]}" but the template has no such script`);
  }
});
