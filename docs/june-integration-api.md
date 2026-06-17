# June Integration API — feasibility & naming (Kura's north star)

**Question:** can a package (Kura) make the app's `app/` glue — route files,
`_content.ts`, `actions.ts` — disappear by default, surfacing only when the user wants
to override? (Convention over configuration.)

**Answer:** yes, but not from `injectRoute()` alone. It takes a small **integration
API** with three capabilities. `injectRoute` removes the route files (and, via the
injected route importing the package's actions, the actions too); removing the
*generated* `_content.ts` additionally needs a content-collection + virtual-module
capability. The user's own `content/docs/*.md` never disappears — that's their content.

## What each artifact needs

| artifact | can a package own it? | mechanism in June | effort |
|---|---|---|---|
| `app/docs/[[...slug]]/page.tsx` (routes) | ✅ yes | **route injection**: integration declares `{ path, module }`; router consults injected routes + matches them to a module in node_modules | **medium** |
| `app/actions.ts` (MCP tools) | ✅ yes | the injected route module `import`s the package's actions (side-effect → global registry, which `/mcp` already reads); or an `actions: []` hook | **low** |
| `app/_content.ts` (generated) | ✅ yes | **content collections**: integration declares `{ dir, schema }`; `june gen`/build freezes it to a **virtual module** the package imports — no physical app/ file | **medium-high** |
| `content/docs/*.md` (the markdown) | ❌ no (correct) | stays app-authored — it *is* the user's content | — |
| `kura.config.ts` | ✅ folds away | config moves into the integration call in `june.config.ts` (`kura({...})`), Starlight-style | — |

So the irreducible app surface becomes **`june.config.ts` + `content/docs/*.md`** — nothing else.

## Feasibility per capability

- **Route injection — feasible, medium.** `router.ts` already has a clean
  `URL → (page file, params, chain)` resolver with precedence (static > `[param]` >
  `[...catchAll]`) and supports `[[...slug]]`. Add a second source — virtual routes
  declared by integrations — that the matcher consults *after* `app/` (so a real file
  always wins → "eject to override"). The handler is just a module June imports; it
  already imports route modules dynamically, so an entrypoint in node_modules is fine.
  Must also be honored by dev, build enumeration, prerender, and sitemap.
- **Actions — feasible, low.** Once the integration's route module is in the graph, it
  can `import "@kurajs/docs/actions"` itself; `defineAction` registers into the
  globalThis registry and `/mcp` (mcp.ts) already projects it. No app file needed.
- **Content as a virtual module — feasible, medium-high.** June already freezes
  `content/**` (content.ts, `generateContent` in build.ts). The change: let an
  integration declare a collection (`dir` + `schema`) and emit the frozen result as a
  **virtual module** (e.g. `virtual:kura/content`) instead of a physical `app/_content.ts`.
  Needs virtual-module resolution in both Bun dev and the rolldown build (routine for
  Vite/rolldown, but a new concept for June). Highest-effort piece; offer `--eject` to
  write the physical file for users who want to hack it.

## Convention over configuration (the override model)

Injected routes/content/actions are **defaults**. Precedence rule: **a file in `app/`
beats the injected one.** So a user customizes by *creating* the file (e.g. drop
`app/docs/[[...slug]]/page.tsx` to fork the layout) — exactly "only appears when you
need it." Same for `--eject` of content. This is Astro/Starlight's model.

## End-state (with the integration API)

```ts
// june.config.ts — the whole configuration
import { defineJune } from "@junejs/core/config";
import { kura } from "@kurajs/docs";

export default defineJune({
  integrations: [kura({ sections: ["開始", "核心概念", "進階"] })],
});
```
```
my-docs/
├── june.config.ts
└── content/docs/*.md      ← that's it
```
This is **Starlight-grade zero-boilerplate**, and it's achievable *because June is ours*
— Starlight gets it from Astro's integration API; we'd add the equivalent to June.

## Naming

| thing | options | recommendation |
|---|---|---|
| umbrella concept | Integration · Plugin · Module · Extension | **Integration** — it's literally the Starlight-analogue; users' mental model transfers. ("Plugin" collides with rolldown plugins.) |
| config field | `integrations: [...]` · `use: [...]` · `plugins: [...]` | **`integrations: [kura()]`** (clearest, Astro-proven). `use: [...]` is a nice terse Web-standards/Hono-flavored alternative. |
| the factory a package exports | `kura()` | **`kura()`** — function-first, matches `workers()`/`vercel()`/`sqlite()`. |
| integration shape | imperative hooks (`setup({ injectRoute })`) vs **declarative** object | **declarative** — an integration returns `{ name, routes, content, actions, css }`; matches June's `define*`/config style and is simpler to reason about. Keep an imperative escape hatch later if needed. |
| route capability | `injectRoute()` (Astro) · `addRoute()` · declarative `routes: [{ path, module }]` | **declarative `routes`**; call the capability "route injection". If an imperative hook is added, **`addRoute`** (simpler than `injectRoute`). |
| content capability | `collections` · `content` · `sources` | **`content: [{ dir, schema }]`** ("content collections" — Astro/Starlight term, familiar). |
| actions capability | `actions: [...]` · fold into route import | fold in (route imports them); expose `actions: []` only if a route-less tool is needed. |

So: `defineJune({ integrations: [kura({...})] })`, where `kura()` returns
`{ name, routes, content, actions, css }`.

## Sequencing (do NOT gate Kura on this)

1. **Now:** ship `@kurajs/docs` with **scaffolded thin glue** (one `[[...slug]]` route +
   `actions.ts` re-export + `kura.config.ts`), generated by `create-kura`. Works on
   June *today*, no June changes.
2. **Later (June enhancement):** add the integration API (routes → content → actions, in
   that effort order). When it lands, `create-kura` stops scaffolding glue; existing apps
   delete it and move config into `june.config.ts`. The integration is **additive** — it
   doesn't change how a hand-rolled June app works.

This keeps Kura unblocked while making the zero-boilerplate end-state a clean, additive
June feature.
