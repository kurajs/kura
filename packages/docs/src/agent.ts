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
