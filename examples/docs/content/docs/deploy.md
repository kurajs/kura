---
title: Deploy
description: One codebase, from local to the Cloudflare edge.
section: Advanced
order: 1
---

# Deploy

## Cloudflare Workers

To publish the site to Cloudflare Workers, run:

```bash
june deploy
```

The build produces a portable Worker bundle that runs directly on edge nodes. The same
codebase deploys to Vercel or Deno Deploy with no changes.

<Tabs>
<Tab label="Cloudflare">

The default target. `june deploy` produces a Worker bundle and uploads it; SQLite maps to D1.

</Tab>
<Tab label="Vercel">

Configure the `vercel()` adapter and `june deploy` goes through the Build Output API.

</Tab>
<Tab label="Deno">

Configure the `deno()` adapter to deploy to Deno Deploy.

</Tab>
</Tabs>

## Data-layer mapping

Declare data once; each platform maps it to a native service automatically:

| Resource | Local | Cloudflare |
| --- | --- | --- |
| Database | SQLite | D1 |
| Embeddings | Transformers.js | Workers AI |

> SQLite ↔ D1, local bge-m3 ↔ Workers AI — one model, one set of SQL, identical behavior in
> local development and cloud production.
