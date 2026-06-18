import type { Embedder } from "@kurajs/core";
import type { Labels } from "./labels.ts";

export interface KuraConfig {
  /** URL prefix for doc pages (default `/docs`). Set `""` to mount docs at the site root. The route
   *  files must be placed to match: `app/docs/[[...slug]]` for `/docs`, `app/[[...slug]]` for root.
   *  Affects generated links only (sidebar, pager, tabs, search results, `.md`); search stays at
   *  `/search`. */
  basePath?: string;
  /** Sidebar group order (sections). */
  sections?: string[];
  /** Site identity shown in the chrome. */
  site?: { name?: string; brand?: string; description?: string };
  /** Embedding engine for search (e.g. transformers()); injected for local↔cloud parity. */
  embedder?: Embedder;
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
  // theme, agent toggles, etc. land here later.
}

/** Identity helper — gives `kura.config.ts` full type-checking + inference. */
export function defineKura(config: KuraConfig): KuraConfig {
  return config;
}
