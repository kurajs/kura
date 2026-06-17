#!/usr/bin/env node
// A STAND-IN for a real CLI coding agent (Copilot/Codex/Gemini/aider), used to prove the `cli`
// backend's plumbing end-to-end WITHOUT another vendor's auth. It is intentionally dumb: it reads
// the prompt from stdin, then makes a deterministic edit to docs under DOCS_SYNC_ALLOW_EDITS that
// mimics reconciling the doc with the code change. A real agent would reason; this just proves the
// orchestrator → backend → external process → file-edit → detect loop is identical to the SDK path.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const allow = (process.env.DOCS_SYNC_ALLOW_EDITS || "docs/**").split(",");
// (prompt arrives on stdin; this stub doesn't need to parse it)
try { readFileSync(0, "utf8"); } catch {}

const docsDirs = allow.map((g) => g.replace(/\/\*\*$/, "")).filter(Boolean);
let edited = 0;
for (const d of docsDirs) {
  let files = [];
  try { files = readdirSync(join(cwd, d)).filter((f) => f.endsWith(".md")); } catch { continue; }
  for (const f of files) {
    const p = join(cwd, d, f);
    let md = readFileSync(p, "utf8");
    if (!md.includes("login(email, password)")) continue;
    md = md
      .replaceAll("login(email, password)", "login(email, password, otp)")
      .replaceAll('await login("a@b.com", "hunter2")', 'await login("a@b.com", "hunter2", "123456")')
      .replace(/There is no second factor[^\n]*/, "As of v2, pass the 6-digit one-time passcode (`otp`) as a second factor.");
    writeFileSync(p, md);
    edited++;
  }
}
console.log(`stub-agent: edited ${edited} doc(s) under ${allow.join(", ")}`);
