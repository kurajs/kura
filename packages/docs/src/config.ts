import type { Embedder } from "@kurajs/core";
import type { TokenizerResolver } from "@kurajs/search";
import type { I18nConfig } from "@junejs/core/i18n";
import type { Labels } from "./labels.ts";
import type { DocLike } from "./nav.ts";
import { kuraLlms } from "./agent.ts";

/** i18n config shape — re-exported so apps import from @kurajs/docs, not @junejs/core. */
export type KuraI18nConfig = I18nConfig;

export interface KuraConfig {
  /** URL prefix for doc pages (default `/docs`). Set `""` to mount docs at the site root. The route
   *  files must be placed to match: `app/docs/[[...slug]]` for `/docs`, `app/[[...slug]]` for root.
   *  Affects generated links only (sidebar, pager, tabs, search results, `.md`); search stays at
   *  `/search`. */
  basePath?: string;
  /** Sidebar group order (sections). */
  sections?: string[];
  /** Site identity shown in the chrome and passed to June (name, brand, description, titleTemplate). */
  site?: { name?: string; brand?: string; description?: string; titleTemplate?: string };
  /** Embedding engine for search (e.g. transformers()); injected for local↔cloud parity. */
  embedder?: Embedder;
  /** Per-locale keyword tokenizer for search. Default: CJK locales use native word
   *  segmentation (Intl.Segmenter), others use the Latin tokenizer. Override to customize —
   *  e.g. `byLocale({ "zh-TW": pipeline({ pre: [normalizeChinese()], segment: cjkSegmenter("zh-TW") }) })`. */
  tokenizer?: TokenizerResolver;
  /**
   * Per-locale UI string overrides. en-US is the built-in default (DEFAULT_LABELS);
   * each locale supplies only the strings it changes. Keyed by the same locale tags
   * as june.config.ts `i18n.locales` (e.g. `{ "zh-TW": { previous: "上一頁" } }`).
   */
  labels?: Record<string, Partial<Labels>>;
  /**
   * Per-locale display names for sidebar sections. The section value in frontmatter is a
   * stable KEY (keep it identical across locales so grouping and fallback line up); this
   * maps that key to a localized heading. Keyed locale → sectionKey → display.
   */
  sectionLabels?: Record<string, Record<string, string>>;
  /** Display names for the language switcher, keyed by locale tag (e.g. `{ en: "English",
   *  "zh-TW": "繁體中文" }`). Falls back to the raw tag when a name is missing. */
  localeNames?: Record<string, string>;
  /**
   * Per-locale tab titles. Tab STRUCTURE (which tabs, which folders) is declared once in the root
   * meta.json; this localizes only the displayed title, keyed by the tab's English title (the stable
   * key). Same shape as sectionLabels: locale → englishTitle → display
   * (e.g. `{ "ja-JP": { Guides: "ガイド" } }`).
   */
  tabLabels?: Record<string, Record<string, string>>;
  /**
   * Where the client loads Mermaid from to render ```mermaid code fences. Lazy-imported in the
   * browser (and only on pages that actually contain a diagram), so it never enters the worker
   * bundle. Defaults to `https://esm.sh/mermaid@11`; override to pin a version or self-host.
   */
  mermaidCdn?: string;
  /** Deploy target passed to June (target, worker/function name, custom domain). */
  deploy?: { target?: "workers" | "vercel" | "deno"; name?: string; domain?: string };
  /**
   * Canonical site URL (e.g. "https://kura.build"). When set, og:image and canonical tags use
   * absolute URLs so social media crawlers can fetch them. Falls back to relative paths when absent.
   */
  siteUrl?: string;
  /**
   * i18n routing config — passed to June and to createDocs(). Define locales and paths here
   * so both the server router and the docs framework share a single source of truth.
   * Re-exported as KuraI18nConfig from @kurajs/docs for type-safe inline definitions.
   */
  i18n?: KuraI18nConfig;
  /**
   * Pass-through to defineJune() for advanced June features not yet surfaced by Kura.
   * Example: `june: { clientRouter: true }`. Avoid using this for fields Kura already
   * covers (site, deploy, agent, i18n) — those are merged automatically by kuraJuneConfig().
   */
  june?: Record<string, unknown>;
}

/** Identity helper — gives `kura.config.ts` full type-checking + inference. */
export function defineKura(config: KuraConfig): KuraConfig {
  return config;
}

/**
 * Build a June config from a KuraConfig. Called by the thin `june.config.ts` shim so the
 * user only ever edits `kura.config.ts`. Handles site/deploy/agent wiring automatically;
 * advanced june options flow through via `config.june`.
 *
 * Usage in june.config.ts:
 *   import { kuraJuneConfig } from "@kurajs/docs";
 *   import kuraConfig from "./kura.config.ts";
 *   import { DOCS } from "./app/_content";
 *   export default kuraJuneConfig(kuraConfig, { DOCS });
 */
export function kuraJuneConfig<T extends DocLike>(
  config: KuraConfig,
  content: { DOCS: readonly T[] },
): unknown {
  // Lazy import so @junejs/core is only resolved at runtime (peer dep — always present in a
  // running Kura app, because @kurajs/cli brings in @junejs/cli which brings in @junejs/core).
  // Using a dynamic shape avoids a hard compile-time dep on @junejs/core types here.
  const { site, deploy, i18n, june = {} } = config;
  return {
    ...(site ? { site } : {}),
    ...(deploy ? { deploy } : {}),
    ...(i18n ? { i18n } : {}),
    agent: { enabled: true, llms: kuraLlms({ DOCS: content.DOCS }) },
    ...june,
  };
}
