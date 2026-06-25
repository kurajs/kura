// UI string labels (Kura owns these — June defers the message catalog to a future
// @junejs/i18n). en-US is the source/default; apps override per locale via config.labels.
export type Labels = {
  onThisPage: string;
  navigation: string;
  searchPlaceholder: string;
  copyMarkdown: string;
  copyMarkdownHint: string;
  viewMarkdown: string;
  viewMarkdownHint: string;
  openInChatGPT: string;
  openInChatGPTHint: string;
  openInClaude: string;
  openInClaudeHint: string;
  previous: string;
  next: string;
  search: string;
  noResults: string;
  notTranslated: string;
  /** Prefix for the optional last-updated line (config.lastUpdated), e.g. "Last updated on". */
  lastUpdated: string;
};

export const DEFAULT_LABELS: Labels = {
  onThisPage: "On this page",
  navigation: "Navigation",
  searchPlaceholder: "Search docs…  (press /)",
  copyMarkdown: "Copy Markdown",
  copyMarkdownHint: "Copy this page as Markdown for LLMs",
  viewMarkdown: "View as Markdown",
  viewMarkdownHint: "View this page as plain text",
  openInChatGPT: "Open in ChatGPT",
  openInChatGPTHint: "Ask ChatGPT about this page",
  openInClaude: "Open in Claude",
  openInClaudeHint: "Ask Claude about this page",
  previous: "Previous",
  next: "Next",
  search: "Search",
  noResults: "No results.",
  notTranslated: "Not yet translated — showing the default language.",
  lastUpdated: "Last updated on",
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
