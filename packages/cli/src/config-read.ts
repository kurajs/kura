// Reading settings out of kura.config.ts as TEXT (never importing it) — so `kura index` never
// executes user config code (no side effects, no heavy imports) on any run, including short-circuited
// ones. These are pure string helpers so the regexes are unit-testable in isolation (cli.ts itself
// runs a command dispatch on import and can't be pulled into a test). See cli.ts `cmdIndex`.

/** Strip comments so a commented-out setting can't take effect. Only treat `//` as a comment at
 *  start-of-line/after-whitespace, so `https://…` inside a string survives. Run this BEFORE the
 *  matchers below — they assume comment-free text. */
export function stripConfigComments(txt: string): string {
  return txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** True when the config selects CommonMark rendering (`markdown: "commonmark"`). */
export function isCommonmark(strippedCfg: string): boolean {
  return /\bmarkdown\s*:\s*["']commonmark["']/.test(strippedCfg);
}

/** Extra shiki grammar names from `highlight: { langs: [...] }`, merged onto @kurajs/docs's curated
 *  base list so projects can highlight DSL fences the defaults miss (e.g. "hcl", "dockerfile"). Pull
 *  the array literal, then the quoted strings inside it. Returns [] when there's no highlight.langs. */
export function parseHighlightLangs(strippedCfg: string): string[] {
  const block = strippedCfg.match(/\bhighlight\s*:\s*\{[^}]*\blangs\s*:\s*\[([^\]]*)\]/)?.[1] ?? "";
  return [...block.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]!);
}
