// The kura CLI's ONE config read. A project configures Kura with either a declarative `kura.toml`
// (parsed with smol-toml — robust, and works whether the CLI runs under node or bun) or a
// `kura.config.ts` (text-scanned so `kura index` never executes user code). Both collapse to the
// same CliConfig the codegen consumes.
import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";

import {
  stripConfigComments,
  isCommonmark,
  parseHighlightLangs,
  parseContentSources,
  parseI18nLocales,
  parseDeployTarget,
  type ContentSource,
} from "./config-read.js";
import { parseBasePath, basePathToSegments } from "./routes.js";

export type CliConfig = {
  source: "toml" | "ts" | "none";
  contentSources: ContentSource[];
  locales: string[];
  commonmark: boolean;
  highlightLangs: string[];
  staticTarget: boolean; // github-pages / static → drop the dynamic OG route, prerender to files
  basePathSegments: string[]; // where the docs catch-all route is placed
  hasNav: boolean; // config.nav (virtual navigation) present
  lastUpdated: boolean; // show a git-derived "Last updated on …" line per page
  siteName?: string; // [site].name — used for the default landing page (toml projects)
  siteDescription?: string;
  raw?: Record<string, unknown>; // the parsed kura.toml — materialized into .june/kura.gen.ts
};

const isStatic = (t?: string) => t === "github-pages" || t === "static";

export function loadCliConfig(cwd: string): CliConfig {
  const tomlPath = path.join(cwd, "kura.toml");
  if (fs.existsSync(tomlPath)) {
    const raw = parseToml(fs.readFileSync(tomlPath, "utf8")) as Record<string, any>;
    const i18n = raw.i18n as { default_locale?: string; locales?: Record<string, unknown> } | undefined;
    const locales = i18n
      ? [...new Set([i18n.default_locale, ...Object.keys(i18n.locales ?? {})].filter(Boolean) as string[])]
      : [];
    // Default: mount the repo's ./docs at the site root (the docs-as-code convention; mirrors
    // fromKuraToml). Override with [[content.sources]].
    const sources = (raw.content?.sources ?? [{ dir: "docs", mount: "" }]) as Array<{ dir?: string; collection?: string; mount?: string }>;
    const site = raw.site as { name?: string; description?: string } | undefined;
    return {
      source: "toml",
      raw,
      siteName: site?.name,
      siteDescription: site?.description,
      contentSources: sources
        .filter((s): s is { dir: string; collection?: string; mount?: string } => !!s.dir)
        // mount "" (site root) is meaningful — keep it; only an ABSENT mount is omitted.
        .map((s) => ({ dir: s.dir, collection: s.collection ?? "docs", ...(s.mount !== undefined ? { mount: s.mount } : {}) })),
      locales,
      commonmark: raw.markdown === "commonmark",
      highlightLangs: (raw.highlight as { langs?: string[] } | undefined)?.langs ?? [],
      staticTarget: isStatic((raw.deploy as { target?: string } | undefined)?.target),
      basePathSegments: basePathToSegments(raw.base_path as string | undefined),
      hasNav: !!raw.nav,
      lastUpdated: raw.last_updated === true,
    };
  }
  const cfgPath = path.join(cwd, "kura.config.ts");
  if (!fs.existsSync(cfgPath)) {
    return { source: "none", contentSources: [], locales: [], commonmark: false, highlightLangs: [], staticTarget: false, basePathSegments: ["docs"], hasNav: false, lastUpdated: false };
  }
  const txt = stripConfigComments(fs.readFileSync(cfgPath, "utf8"));
  return {
    source: "ts",
    contentSources: parseContentSources(txt),
    locales: parseI18nLocales(txt),
    commonmark: isCommonmark(txt),
    highlightLangs: parseHighlightLangs(txt),
    staticTarget: isStatic(parseDeployTarget(txt)),
    basePathSegments: parseBasePath(txt),
    hasNav: /\bnav\s*:\s*\{/.test(txt),
    lastUpdated: /\blastUpdated\s*:\s*true\b/.test(txt),
  };
}
