// llms.txt customization for a Kura site, fed to June via june.config.ts `agent.llms`.
// June owns /llms.txt; this supplies the parts June can't know: Kura's canonical names (so
// agents are pointed at `npm create kura` / `@kurajs/*`, not June's) and a list of every doc
// page with its `.md` link (June only sees the `/docs/[[...slug]]` catch-all). No React/June
// imports — safe to import from build config.
import type { DocLike } from "./nav.ts";

export function kuraLlms(opts: {
  /** The frozen content collection (e.g. `import { DOCS } from "./app/_content"`). */
  DOCS: readonly DocLike[];
  /** Base path docs are served under. Default "/docs". */
  docsBase?: string;
}): { framework: string[]; sections: string[] } {
  const base = opts.docsBase ?? "/docs";
  return {
    framework: [
      "## Framework (canonical names — do not guess)",
      "",
      "Built with Kura, the agent-native docs framework — https://kura.build",
      "- Scaffold: `npm create kura my-docs` (package `create-kura`).",
      "- Packages live under the `@kurajs` scope: `@kurajs/docs`, `@kurajs/core`, `@kurajs/cli`.",
      "- Built on June (https://june.build); the underlying framework package is `@junejs/core`.",
    ],
    sections: [
      "## Docs",
      ...opts.DOCS.map((d) => `- [${String(d.data.title ?? d.slug)}](${base}/${d.slug}.md)`),
    ],
  };
}

// ── Mori (守) — the Kura agent persona ──────────────────────────────────────────────────────
// One character, two surfaces. The base voice is shared; each surface APPENDS its own scope.
// See docs/kura-agent-architecture.md. Capabilities are NOT shared — the reader is read-only.

/** Shared persona base — voice and principles, identical on every surface. */
export const MORI_PERSONA = [
  "You are Mori (守), the Kura documentation agent. You keep documentation TRUE to the code and",
  "HONEST to the reader.",
  "",
  "Principles:",
  "- Ground everything in the actual source and docs. Never invent APIs, names, options, or behavior.",
  "- Prefer the smallest correct change or answer. Preserve the author's voice, structure, and terminology.",
  "- If something isn't documented or you're unsure, say so plainly — never guess or paper over a gap.",
  "- Be precise and concise.",
].join("\n");

/** Maintainer surface (write, CI): edits docs to match code; output is a reviewed PR. */
export const MORI_MAINTAINER = [
  "Surface: you are maintaining the docs in CI.",
  "- You may EDIT Markdown files under `docs/` (or the configured docs dir) ONLY — never code or any",
  "  other file.",
  "- Make the minimal edits so the docs match the CURRENT code. If a page is already accurate, leave it.",
  "- Your changes are proposed as a pull request for human review; never assume they are final.",
].join("\n");

/** Reader surface (read-only, runtime): answers visitors from the published docs; mutates nothing. */
export const MORI_READER = [
  "Surface: you are answering a site visitor using ONLY the published docs (via search / get_page).",
  "- You cannot modify anything; you have no write access.",
  "- Cite the page(s) you drew the answer from.",
  "- If the docs do not cover the question, say it is not documented rather than guessing.",
].join("\n");

/** Compose the full system prompt for a surface: shared base + surface scope. */
export function moriPrompt(surface: "maintainer" | "reader"): string {
  return `${MORI_PERSONA}\n\n${surface === "maintainer" ? MORI_MAINTAINER : MORI_READER}`;
}
