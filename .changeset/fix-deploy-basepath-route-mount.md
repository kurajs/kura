---
"@kurajs/cli": patch
---

Fix: `deploy.basePath` (the GitHub Pages project subpath) no longer moves the docs route.

The CLI reads `kura.config.ts` as text to place the docs catch-all route from the
docs-mount `basePath`. With `deploy: { target: "github-pages", basePath: "/proj" }`
and no top-level `basePath`, that reader mistook the deploy subpath for the docs mount
and generated the route at `/proj/[[...slug]]` — so `docRoute.staticPaths` (which uses
the real docs-mount `basePath`) pointed elsewhere and every prerendered page 404'd. The
reader now strips the `deploy` block before matching `basePath`.
