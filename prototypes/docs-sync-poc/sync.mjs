// docs-sync PoC orchestrator — backend-agnostic. The 3-step flow; only step 2 swaps engine.
//   1. changed files + each doc's `sources:` → candidate doc pages          (neutral)
//   2. backend.run(): an agent edits those .md to match the code            (SWAPPABLE)
//   3. diff the workdir vs the source → what we'd open a PR with            (neutral)
//
// Runs are non-destructive: the sample/ "repo" is copied to a temp workdir; we diff against it.
//
//   node sync.mjs                          # backend: claude-agent-sdk (default)
//   node sync.mjs --backend cli            # backend: external CLI (defaults to the local stub)
//   DOCS_SYNC_AGENT_CMD="codex exec" node sync.mjs --backend cli   # real CLI agent
import { readFileSync, readdirSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sample = join(here, "sample");
const argv = process.argv.slice(2);
const backendName = (argv[argv.indexOf("--backend") + 1] && argv.includes("--backend")) ? argv[argv.indexOf("--backend") + 1] : "claude-agent-sdk";
const changed = argv.filter((a) => !a.startsWith("--") && a !== backendName);
const changedFiles = changed.length ? changed : ["code/auth.ts"];
const ALLOW = ["docs/**"];

// --- pick the backend (the ONLY vendor-specific choice) -------------------------------------
let backend;
if (backendName === "claude-agent-sdk") backend = (await import("./backends/claude-agent-sdk.mjs")).default;
else if (backendName === "cli") backend = (await import("./backends/cli.mjs")).cliBackend(process.env.DOCS_SYNC_AGENT_CMD || `node ${join(here, "stub-agent.mjs")}`);
else throw new Error(`unknown backend: ${backendName}`);

// --- step 1: sources: matching (neutral) ----------------------------------------------------
function parseSources(md) {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  const line = fm?.[1].split("\n").find((l) => l.trim().startsWith("sources:"));
  return line ? line.replace(/.*sources:/, "").trim().replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean) : [];
}
const glob = (g, f) => (g.endsWith("/**") ? f === g.slice(0, -3) || f.startsWith(g.slice(0, -2)) : g.includes("*") ? new RegExp("^" + g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*") + "$").test(f) : g === f);

const docsDir = join(sample, "docs");
const candidates = readdirSync(docsDir).filter((f) => f.endsWith(".md"))
  .filter((f) => parseSources(readFileSync(join(docsDir, f), "utf8")).some((s) => changedFiles.some((c) => glob(s, c))));
console.log(`backend: ${backend.name}`);
console.log(`changed: ${changedFiles.join(", ")}  →  candidate docs: ${candidates.length ? candidates.join(", ") : "(none)"}`);
if (!candidates.length) process.exit(0);

// --- step 2: run the agent in a throwaway copy of the repo ----------------------------------
const work = mkdtempSync(join(tmpdir(), "docs-sync-"));
cpSync(sample, work, { recursive: true });
const prompt =
  `The source file(s) ${changedFiles.join(", ")} just changed. For each of these doc pages: ${candidates.map((p) => `docs/${p}`).join(", ")} — ` +
  `read the current code and the page, then EDIT the page so its prose and code examples match the current code. ` +
  `Minimal edits; preserve voice; only edit files under docs/. If a page is already accurate, leave it.`;
console.log(`\n=== step 2: ${backend.name} ===`);
const { summary } = await backend.run({ cwd: work, prompt, allowEdits: ALLOW });
console.log("  summary:", summary.slice(0, 160));

// --- step 3: diff workdir vs source (what a PR would contain) -------------------------------
console.log("\n=== step 3: proposed changes (would open a PR) ===");
for (const p of candidates) {
  const before = readFileSync(join(docsDir, p), "utf8");
  const after = readFileSync(join(work, "docs", p), "utf8");
  console.log(`\n--- docs/${p}: ${before === after ? "unchanged" : "CHANGED"} ---`);
  if (before !== after) console.log(after);
}
rmSync(work, { recursive: true, force: true });
