---
"@kurajs/docs": patch
---

Fix footer deploy-root links. The `llms.txt` link was hardcoded `/llms.txt`, so on a site deployed under a subpath (e.g. GitHub Pages `/openab`) it 404'd instead of resolving to `/openab/llms.txt` — llms.txt lives at the deploy root, not under the docs basePath or a locale, so it now gets the deploy prefix. The `MCP` link (a server route that a static build never emits) is now hidden on static targets instead of pointing at a dead `/mcp`.
