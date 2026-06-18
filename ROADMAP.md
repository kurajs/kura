# Roadmap

A preview of what's planned for [Kura](https://kura.build) — the knowledgebase for humans and agents.
No dates; this is direction, not a commitment. Feedback and issues welcome.

## Planned

- **Ask — the reader agent.** The runtime half of the Kura Agent (persona: Mori): answers your site's
  visitors, grounded in your docs over MCP. Pairs with [Curator](https://github.com/kurajs/curator)
  (the maintainer half, already shipping).
- **Semantic search on the edge with no local ML.** A `workersAI()` embedder (`@cf/baai/bge-m3`) so
  semantic search runs on Cloudflare Workers without bundling the local model — lexical stays the
  zero-dependency default.
- **Pick a deploy target at scaffold time.** `npm create kura my-docs --target vercel|deno|workers`,
  so the generated app is wired for your platform from the first command (today it defaults to
  Cloudflare Workers; switching is a one-line `june.config.ts` change).

## Exploring

- **Curator audit mode.** A scheduled, diff-less pass that re-checks every page against its `sources:`
  (today Curator is change-driven), to catch drift that no single PR touched.
- **Version-independent builds.** Make `kura index` import the generated content module on any Node
  ≥ 22.6 (not just 22.18+), so deploy environments need no Node pin.

---

Shipping today: docs framework (sidebar/ToC/search/MDX), four projections (HTML/Markdown/JSON/MCP),
i18n, lexical + semantic search, Cloudflare/Vercel/Deno deploy, and **Curator** (AI-maintained docs).
