import { defineJune } from "@junejs/core/config";

// Locale routing: en is the default (unprefixed, canonical at "/"); ja-JP lives under
// /ja. Shared with kura.config.ts so the docs framework knows the default locale.
export const i18n = {
  defaultLocale: "en",
  locales: {
    en: {},
    "ja-JP": { path: "/ja" },
  },
};

export default defineJune({
  site: {
    name: "Kura Docs",
    titleTemplate: "%s · Kura Docs",
    description: "The knowledgebase for humans and agents.",
  },
  i18n,
  agent: { enabled: true }, // /mcp, /llms.txt, per-page .md/.json projections
});
