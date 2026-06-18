import { defineJune } from "@junejs/core/config";
import { kuraLlms } from "@kurajs/docs/agent";
import { DOCS } from "./app/_content";

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
  // /mcp, /llms.txt, per-page .md/.json projections. llms.txt points agents at Kura's
  // canonical names and lists every doc page (June only knows the catch-all route).
  agent: { enabled: true, llms: kuraLlms({ DOCS }) },
  // EXPERIMENT: soft-swap navigation for large docs — June fetches the next page's HTML and
  // morphs it in (no full reload), so the sidebar/scroll stay put and clicking around feels instant.
  clientRouter: true,
});
