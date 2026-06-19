// UI string labels (Kura owns these — June defers the message catalog to a future
// @junejs/i18n). en-US is the source/default; apps override per locale via config.labels.
export type Labels = {
  onThisPage: string;
  navigation: string;
  searchPlaceholder: string;
  copyMarkdown: string;
  viewMarkdown: string;
  openInChatGPT: string;
  openInClaude: string;
  previous: string;
  next: string;
  search: string;
  noResults: string;
  notTranslated: string;
};

export const DEFAULT_LABELS: Labels = {
  onThisPage: "On this page",
  navigation: "Navigation",
  searchPlaceholder: "Search docs…  (press /)",
  copyMarkdown: "Copy Markdown",
  viewMarkdown: "View as Markdown",
  openInChatGPT: "Open in ChatGPT",
  openInClaude: "Open in Claude",
  previous: "Previous",
  next: "Next",
  search: "Search",
  noResults: "No results.",
  notTranslated: "Not yet translated — showing the default language.",
};

export function resolveLabels(locale: string | undefined, overrides?: Record<string, Partial<Labels>>): Labels {
  return { ...DEFAULT_LABELS, ...(locale ? overrides?.[locale] : undefined) };
}

/** Resolve one localized label from a `locale → key → label` map, falling back to the key itself.
 *  The key is a STABLE English string (e.g. a tab/section title) that doubles as the default label —
 *  same convention as sectionLabels and tabLabels. */
export function pickLabel(
  map: Record<string, Record<string, string>> | undefined,
  locale: string | undefined,
  key: string,
): string {
  return (locale ? map?.[locale]?.[key] : undefined) ?? key;
}
