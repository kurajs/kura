---
"@kurajs/docs": patch
"@kurajs/cli": patch
---

List the docs in `/llms.txt` from the docs route instead of a hand-built list, on June versions that support it. `kura.docRoute.llms` returns one entry per doc for June's route `llms` export (`@junejs/server` ≥1.0.0-dev.29): sections follow the sidebar groups, in sidebar order, each link carries the page's frontmatter `description`, and pages the sidebar leaves out are listed under "Docs". Only the default locale is listed.

The generated docs route now exports `llms`, and the CLI checks which `@junejs/server` its `june` bin resolves. On a June that reads the export, the generated config passes `kuraJuneConfig(…, { routeLlms: true })`, which drops the flat "## Docs" list `kuraLlms` used to add, so no doc is listed twice. On older June the export is ignored and the flat list stays, so llms.txt is unchanged there.

The home route (which renders the first doc) and the search page (a query UI) now declare `llms: false` and are left out of `/llms.txt` on June versions that read it; the generated routes export it.

Sites with hand-written route files can opt in by adding `export const llms = kura.docRoute.llms;` to the docs route and passing `{ routeLlms: true }` to `kuraJuneConfig`, once they run June ≥1.0.0-dev.29.
