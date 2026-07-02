---
"@kurajs/docs": patch
"@kurajs/cli": patch
---

Add a GitHub Pages (static) deploy target.

Set `deploy: { target: "github-pages", basePath: "/<project>" }` in `kura.config.ts`
to build a fully prerendered static site into `dist/static/` — no server, deployable
to GitHub Pages or any file host.

- Maps to June's built-in static target; the deploy subpath becomes June's `basePath`
  so assets + links resolve under a project subpath.
- `docRoute.staticPaths` enumerates every doc page (× locale) so the dynamic docs
  route prerenders to one HTML file each; sidebar/pager/tab/search links carry the
  deploy subpath.
- On a static target the dynamic OG image route is omitted and `og:image` is dropped
  (no server to render it). Requires `@junejs/core` ≥ 0.0.49 / `@junejs/server` ≥ 0.0.54.
