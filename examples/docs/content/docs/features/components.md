---
title: Components
description: The curated MDX components Kura ships — callouts, cards, steps, and tabs.
---

# Components

Kura ships a small set of curated components you can use in any `.md` or `.mdx` page. They render to
static HTML at build time and are styled by the docs theme, so they follow light/dark automatically.

## Callouts

Use `<Callout>` to draw attention. The `type` prop sets the tone — `note`, `tip`, `warning`, `danger`.

<Callout type="note" title="Note">
  The default tone. Good for asides and extra context.
</Callout>

<Callout type="tip" title="Tip">
  Use `meta.json` to set a section title and order its pages.
</Callout>

<Callout type="warning" title="Heads up">
  `kura build --no-embed` needs the embedder configured.
</Callout>

<Callout type="danger" title="Careful">
  Deleting `content/docs/` removes every page.
</Callout>

## Cards

`<Card>` is a bordered block; add `href` to make the whole card a link.

<Card title="Quickstart" href="/docs/getting-started/quickstart">
  Scaffold a site and write your first page in three steps.
</Card>

## Steps

Wrap an ordered list in `<Steps>` for a guided sequence.

<Steps>

1. Create the project with `npm create kura@latest`.
2. Drop Markdown files under `content/docs/`.
3. Run `npm run dev` and open the site.

</Steps>

## Tabs

`<Tabs>` switches between panels client-side; each `<Tab>` takes a `label`.

<Tabs>
  <Tab label="npm">
    Run `npm install` to add dependencies.
  </Tab>
  <Tab label="pnpm">
    Run `pnpm install` to add dependencies.
  </Tab>
  <Tab label="bun">
    Run `bun install` to add dependencies.
  </Tab>
</Tabs>

## Custom components

Override any tag or curated component with your own. Point `mdxComponents` at a module whose default
export is a components map — or just drop an `app/mdx-components.ts` file and Kura auto-detects it
(Next.js-style). Your exports merge **over** the curated defaults, so the built-ins keep working
unless you replace them.

```ts
// kura.config.ts
import { defineKura } from "@kurajs/docs";

export default defineKura({
  mdxComponents: "./app/mdx-components.ts",
});
```

```ts
// app/mdx-components.ts — resolve every Markdown image against a CDN/asset manifest at build time
import { createElement } from "react";
import manifest from "./image-manifest.json";

export default {
  img: (props: { src?: string; alt?: string }) => {
    const asset = manifest[props.src ?? ""];
    return createElement("img", {
      src: asset?.url ?? props.src,
      alt: props.alt,
      width: asset?.width,
      height: asset?.height,
      style: asset?.placeholder ? { background: asset.placeholder } : undefined,
    });
  },
};
```

The override runs everywhere the docs render — `kura build`, `kura dev`, and the runtime fallback all
read the same precompiled HTML. A few things to know:

<Callout type="note" title="Module path, not an inline map">
  `mdxComponents` is a **path** (a string). `kura index` reads your config as text and never executes
  it, then imports the module itself — so an inline object wouldn't survive. `kura.toml` projects use
  `mdx_components = "./app/mdx-components.ts"`.
</Callout>

<Callout type="warning" title="MDX mode only">
  Components are a JSX/MDX feature. In `markdown: "commonmark"` there is no component layer, so the
  map is ignored — use a rehype-level transform there instead.
</Callout>
