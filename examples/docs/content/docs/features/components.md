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
