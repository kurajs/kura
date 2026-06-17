// UI string labels (Kura owns these — June defers the message catalog to a future
// @junejs/i18n). en-US is the source/default; apps override per locale via config.labels.
export type Labels = {
  onThisPage: string;
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
