// End-to-end SMOKE test for the mdxComponents seam: run the REAL `kura index` against a throwaway
// app and assert the frozen app/_mdx.ts carries the user's <img> override — proving the whole wiring
// (config text-scan → resolveComponentsModule → dynamic import → merge over curated defaults →
// renderMdxBuckets → freeze) works together, not just the units.
//
// The fixture lives UNDER packages/docs so `react` (needed by the user components module) resolves on
// its module chain, and cli.ts's own `@kurajs/docs/*` imports resolve from packages/cli as usual. We
// run cli.ts via the current runtime (bun, under `bun test`) — the config→merge→freeze logic under
// test is runtime-independent; `--no-embed` skips the ML stack.
import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", ".."); // packages/cli/test/bun → repo root
const cliSrc = path.resolve(here, "..", "..", "src", "cli.ts");
const docsPkg = path.join(repoRoot, "packages", "docs");

function scaffold(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(docsPkg, "smoke-mdxcomp-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

const CONTENT = `export const DOCS = [
  { slug: "home", data: { title: "Home" }, html: "<p>fallback</p>", original: "# Home\\n\\n![cat](cat.png)\\n", body: "# Home\\n\\n![cat](cat.png)\\n" },
];
`;
const OVERRIDE = `import { createElement } from "react";
export default {
  img: (props) => createElement("img", { src: "https://cdn.example/" + props.src, alt: props.alt, width: 800, height: 600, "data-ph": "blur" }),
};
`;

const runIndex = (cwd: string) =>
  spawnSync(process.execPath, [cliSrc, "index", "--no-embed"], { cwd, encoding: "utf8" });

test("kura index (e2e): an app/mdx-components.ts override is baked into the frozen _mdx.ts", () => {
  const dir = scaffold({
    "kura.config.ts": 'import { defineKura } from "@kurajs/docs";\nexport default defineKura({ mdxComponents: "./app/mdx-components.ts" });\n',
    "app/_content.ts": CONTENT,
    "app/mdx-components.ts": OVERRIDE,
  });
  try {
    const res = runIndex(dir);
    expect(res.status, `stderr:\n${res.stderr}\nstdout:\n${res.stdout}`).toBe(0);
    expect(res.stdout).toContain("mdxComponents — merged 1 override");
    const mdx = fs.readFileSync(path.join(dir, "app", "_mdx.ts"), "utf8");
    expect(mdx).toContain("https://cdn.example/cat.png"); // the override applied…
    expect(mdx).toContain('width=\\"800\\"'); // …with its enrichment attrs (escaped in the JSON string)
    expect(mdx).not.toContain('src=\\"cat.png\\"'); // the plain authored src is gone
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

test("kura index (e2e): the app/mdx-components.ts CONVENTION is auto-detected without config", () => {
  const dir = scaffold({
    "kura.config.ts": 'import { defineKura } from "@kurajs/docs";\nexport default defineKura({});\n',
    "app/_content.ts": CONTENT,
    "app/mdx-components.ts": OVERRIDE, // no config path — picked up by convention
  });
  try {
    const res = runIndex(dir);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("mdxComponents — merged");
    expect(fs.readFileSync(path.join(dir, "app", "_mdx.ts"), "utf8")).toContain("https://cdn.example/cat.png");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

test("kura index (e2e): an explicit mdxComponents path that is missing FAILS the build", () => {
  const dir = scaffold({
    "kura.config.ts": 'import { defineKura } from "@kurajs/docs";\nexport default defineKura({ mdxComponents: "./app/nope.ts" });\n',
    "app/_content.ts": CONTENT,
  });
  try {
    const res = runIndex(dir);
    expect(res.status).not.toBe(0); // loud failure, not a silent skip
    expect(res.stderr).toContain("not found");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

test("kura index (e2e): no override → the plain authored <img> is frozen unchanged", () => {
  const dir = scaffold({
    "kura.config.ts": 'import { defineKura } from "@kurajs/docs";\nexport default defineKura({});\n',
    "app/_content.ts": CONTENT,
  });
  try {
    const res = runIndex(dir);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).not.toContain("mdxComponents —");
    const mdx = fs.readFileSync(path.join(dir, "app", "_mdx.ts"), "utf8");
    expect(mdx).toContain('src=\\"cat.png\\"'); // defaults: authored src untouched
    expect(mdx).not.toContain("cdn.example");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
