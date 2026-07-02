---
"@kurajs/cli": patch
---

Locale dirs are DECLARED, not guessed — `content/docs/cli/` is a section, not a locale

`kura index`'s walks (meta.json nav, lastUpdated dates, locale discovery) detected locale
mirrors by folder shape (a BCP-47-ish regex), so ANY 2–3-letter top-level folder — `cli/`,
`sdk/`, `api/`, `faq/`, `dev/` … — was silently treated as a locale and dropped.

The locale set now comes from kura.config.ts `i18n` (defaultLocale + `locales` keys), parsed
as text like every other setting. No `i18n` config ⇒ nothing is a locale. The declared set
joins the content hash, so changing it forces a rebuild.

Pair with @junejs/server ≥ 0.0.53 — June's `june gen` applies the same declared-only rule to
the entries themselves (older June still drops such folders from `app/_content.ts`).
