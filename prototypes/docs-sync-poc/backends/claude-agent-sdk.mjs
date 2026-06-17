// Backend: Claude Agent SDK (the default/primary). Full agent loop — it Reads the code + doc
// and Edits the doc itself. `allowEdits` is enforced with a PreToolUse hook that denies edits
// outside the allowed globs (so the contract is real, not advisory).
import { query } from "@anthropic-ai/claude-agent-sdk";
import { relative, isAbsolute } from "node:path";

function inScope(cwd, filePath, allowEdits) {
  if (!filePath) return false;
  const rel = isAbsolute(filePath) ? relative(cwd, filePath) : filePath;
  if (rel.startsWith("..")) return false;
  return allowEdits.some((g) =>
    g.endsWith("/**") ? rel === g.slice(0, -3) || rel.startsWith(g.slice(0, -2)) : g === rel,
  );
}

/** @type {import("./types.mjs").AgentBackend} */
export default {
  name: "claude-agent-sdk",
  async run({ cwd, prompt, allowEdits }) {
    const denyOutOfScope = async (input) => {
      const fp = input?.tool_input?.file_path;
      if (!inScope(cwd, fp, allowEdits)) {
        return { hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: `edit outside ${allowEdits.join(", ")}` } };
      }
      return {};
    };
    let summary = "";
    for await (const m of query({
      prompt,
      options: {
        cwd,
        allowedTools: ["Read", "Grep", "Glob", "Edit"],
        permissionMode: "acceptEdits",
        hooks: { PreToolUse: [{ matcher: "Edit|Write", hooks: [denyOutOfScope] }] },
      },
    })) {
      if (m.type === "assistant") {
        for (const b of m.message?.content ?? []) {
          if (b.type === "tool_use") console.log(`    · ${b.name}(${b.input?.file_path ?? ""})`);
        }
      }
      if ("result" in m) summary = String(m.result);
    }
    return { summary };
  },
};
