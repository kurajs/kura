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

/** The deploy target from `deploy: { target: "…" }`, or undefined. The deploy block is flat
 *  (target/name/domain/basePath — no nesting), so a `[^}]*` scan to the target key is safe. */
export function parseDeployTarget(strippedCfg: string): string | undefined {
  return strippedCfg.match(/\bdeploy\s*:\s*\{[^}]*\btarget\s*:\s*["']([^"']+)["']/)?.[1];
}

/** True when the deploy target builds a pure static site ("github-pages" or its "static" alias) —
 *  the CLI then drops the dynamic OG image route (it can't be prerendered on a static host). */
export function isStaticTarget(strippedCfg: string): boolean {
  const t = parseDeployTarget(strippedCfg);
  return t === "github-pages" || t === "static";
}

/** Extra shiki grammar names from `highlight: { langs: [...] }`, merged onto @kurajs/docs's curated
 *  base list so projects can highlight DSL fences the defaults miss (e.g. "hcl", "dockerfile"). Pull
 *  the array literal, then the quoted strings inside it. Returns [] when there's no highlight.langs. */
export function parseHighlightLangs(strippedCfg: string): string[] {
  const block = strippedCfg.match(/\bhighlight\s*:\s*\{[^}]*\blangs\s*:\s*\[([^\]]*)\]/)?.[1] ?? "";
  return [...block.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]!);
}

/** One extra content source (docs-as-code): a dir outside content/docs merged into a collection.
 *  Mirrors @kurajs/docs KuraContentSource with `collection` resolved to its "docs" default. */
export type ContentSource = { dir: string; collection: string; mount?: string };

/** Extra content sources from `content: { sources: [{ dir, collection?, mount? }, …] }`. Pull the
 *  array literal, then each `{…}` object's string fields (source objects are flat — no nested
 *  braces/brackets — which the KuraConfig docs pin as the contract for text-readability).
 *  `collection` defaults to "docs", matching kuraJuneConfig's forwarding. */
export function parseContentSources(strippedCfg: string): ContentSource[] {
  const block = strippedCfg.match(/\bcontent\s*:\s*\{\s*sources\s*:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const out: ContentSource[] = [];
  for (const obj of block.match(/\{[^}]*\}/g) ?? []) {
    const field = (name: string) => obj.match(new RegExp(`\\b${name}\\s*:\\s*["']([^"']+)["']`))?.[1];
    const dir = field("dir");
    if (!dir) continue; // a source without a dir is meaningless — skip rather than crash
    const mount = field("mount");
    out.push({ dir, collection: field("collection") ?? "docs", ...(mount ? { mount } : {}) });
  }
  return out;
}

// The `{…}` block starting at openIdx (which must point at "{"), braces balanced, string
// literals skipped (a "{" inside "path: '/{x}'" must not count). Returns "" when unbalanced.
function balancedBlock(s: string, openIdx: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === "\\") i++; // skip the escaped char
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return s.slice(openIdx, i + 1);
  }
  return "";
}

/** The DECLARED locale set from `i18n: { defaultLocale, locales: { … } }` — defaultLocale plus
 *  each `locales` key (bare or quoted, e.g. `en` / `"ja-JP"`). Locale entries nest (`{ path }`),
 *  so this walks braces instead of trusting a flat regex; keys are taken at depth 1 only.
 *  Returns [] when no i18n is configured — an undeclared locale is not a locale. */
export function parseI18nLocales(strippedCfg: string): string[] {
  const i18nAt = strippedCfg.search(/\bi18n\s*:\s*\{/);
  if (i18nAt === -1) return [];
  const i18n = balancedBlock(strippedCfg, strippedCfg.indexOf("{", i18nAt));
  const out = new Set<string>();
  const def = i18n.match(/\bdefaultLocale\s*:\s*["']([^"']+)["']/)?.[1];
  if (def) out.add(def);
  const localesAt = i18n.search(/\blocales\s*:\s*\{/);
  if (localesAt !== -1) {
    const inner = balancedBlock(i18n, i18n.indexOf("{", localesAt)).slice(1, -1);
    // Keys at depth 0 of the locales object: skip each value by brace-walking to the next
    // depth-0 comma, so a nested `{ path: "/ja" }` can't contribute phantom keys.
    let depth = 0;
    let quote: string | null = null;
    let atKey = true;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i]!;
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (depth === 0 && atKey) {
        const m = inner.slice(i).match(/^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9$_-]+))\s*:/);
        if (m) {
          out.add(m[1] ?? m[2] ?? m[3]!);
          i += m[0].length - 1;
          atKey = false;
          continue;
        }
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth--;
      else if (c === "," && depth === 0) atKey = true;
    }
  }
  return [...out];
}
