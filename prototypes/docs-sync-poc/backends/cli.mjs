// Backend: any external coding-agent CLI (the vendor-swap seam). Copilot CLI, OpenAI Codex,
// Gemini CLI, aider, etc. all share the same shape — a process that, given a prompt, edits
// files in a working dir. We spawn it in `cwd`, pass the prompt on stdin, and surface allowEdits
// via an env var. Configure the command via DOCS_SYNC_AGENT_CMD (space-separated) or the factory.
//
// Proves the point: the orchestrator (steps 1 & 3) is identical regardless of which CLI runs here.
import { spawn } from "node:child_process";

export function cliBackend(cmdline) {
  const [cmd, ...args] = (cmdline || process.env.DOCS_SYNC_AGENT_CMD || "").split(" ").filter(Boolean);
  return {
    name: `cli:${cmd || "<unset>"}`,
    async run({ cwd, prompt, allowEdits }) {
      if (!cmd) throw new Error("cli backend: set DOCS_SYNC_AGENT_CMD or pass a command");
      const out = await new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { cwd, env: { ...process.env, DOCS_SYNC_ALLOW_EDITS: allowEdits.join(",") } });
        let o = "";
        p.stdout.on("data", (d) => (o += d));
        p.stderr.on("data", (d) => (o += d));
        p.on("error", reject);
        p.on("close", (code) => (code === 0 ? resolve(o) : reject(new Error(`${cmd} exited ${code}: ${o}`))));
        p.stdin.write(prompt);
        p.stdin.end();
      });
      return { summary: out.trim().slice(0, 200) };
    },
  };
}
