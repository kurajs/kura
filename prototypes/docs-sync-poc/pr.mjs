// docs-sync PoC — full flow against a REAL git repo, ending in a PR.
//   1. changed files + each doc's `sources:` → candidate pages        (neutral)
//   2. backend.run(): agent edits those .md to match the code          (swappable)
//   3. branch → commit → push → `gh pr create`                         (neutral)
//
//   node pr.mjs --repo <dir> [--backend claude-agent-sdk|cli] [--docs docs] [changed...]
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const repo = opt("--repo");
if (!repo) throw new Error("--repo <dir> required (a git checkout with a GitHub remote)");
const backendName = opt("--backend", "claude-agent-sdk");
const docsRel = opt("--docs", "docs");
const flags = new Set(["--repo", "--backend", "--docs"]);
const changed = argv.filter((a, i) => !a.startsWith("--") && !flags.has(argv[i - 1]));
const changedFiles = changed.length ? changed : ["code/auth.ts"];
const ALLOW = [`${docsRel}/**`];
const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" }).trim();

// step 1: sources → candidates
const parseSources = (md) => {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  const line = fm?.[1].split("\n").find((l) => l.trim().startsWith("sources:"));
  return line ? line.replace(/.*sources:/, "").trim().replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean) : [];
};
const glob = (g, f) => (g.endsWith("/**") ? f === g.slice(0, -3) || f.startsWith(g.slice(0, -2)) : g === f);
const docsDir = join(repo, docsRel);
const candidates = readdirSync(docsDir).filter((f) => f.endsWith(".md"))
  .filter((f) => parseSources(readFileSync(join(docsDir, f), "utf8")).some((s) => changedFiles.some((c) => glob(s, c))));
console.log(`backend: ${backendName}  ·  changed: ${changedFiles.join(", ")}  ·  candidates: ${candidates.join(", ") || "(none)"}`);
if (!candidates.length) process.exit(0);

// step 2: agent edits the real repo
const backend = backendName === "cli"
  ? (await import("./backends/cli.mjs")).cliBackend(process.env.DOCS_SYNC_AGENT_CMD || `node ${join(here, "stub-agent.mjs")}`)
  : (await import("./backends/claude-agent-sdk.mjs")).default;
const prompt =
  `The source file(s) ${changedFiles.join(", ")} just changed. For each page: ${candidates.map((p) => `${docsRel}/${p}`).join(", ")} — ` +
  `read the current code and the page, then EDIT the page so prose and examples match the current code. ` +
  `Minimal edits; preserve voice; only edit files under ${docsRel}/.`;
console.log(`\n=== step 2: ${backend.name} ===`);
const { summary } = await backend.run({ cwd: repo, prompt, allowEdits: ALLOW });

// step 3: branch → commit → push → PR
if (!git("status", "--porcelain", "--", docsRel)) { console.log("\nno doc changes — nothing to PR."); process.exit(0); }
const branch = `docs-sync/${changedFiles[0].replace(/[^a-z0-9]+/gi, "-")}-${Date.now().toString(36)}`;
git("checkout", "-b", branch);
git("add", docsRel);
git("-c", "user.name=kura-docs-sync", "-c", "user.email=docs-sync@kura.build", "commit", "-m", `docs: sync with ${changedFiles.join(", ")}`);
git("push", "-u", "origin", branch);
const body = `Automated by Kura docs-sync (backend: ${backend.name}).\n\nChanged: ${changedFiles.join(", ")}\nPages: ${candidates.map((p) => docsRel + "/" + p).join(", ")}\n\n${summary.slice(0, 500)}`;
const url = execFileSync("gh", ["pr", "create", "--title", `docs: sync with ${changedFiles.join(", ")}`, "--body", body, "--head", branch], { cwd: repo, encoding: "utf8" }).trim();
console.log(`\n=== step 3: PR opened ===\n${url}`);
