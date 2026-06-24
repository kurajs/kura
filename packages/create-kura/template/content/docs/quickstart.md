---
title: Quickstart
description: Add content and run the dev server.
section: Getting started
order: 2
---

# Quickstart

Put Markdown files in `content/docs/` with frontmatter, then run the dev server.

> **Prerequisite:** `kura dev`/`build`/`deploy` run on [Bun](https://bun.sh). Install it once —
> `curl -fsSL https://bun.sh/install | bash` — then use `npm` as usual for everything else.

## Add a page

Create `content/docs/my-page.md`:

    ---
    title: My page
    section: Guides
    order: 1
    ---

    # My page

    Your content here.

The `section` groups it in the sidebar; `order` sorts within a section.

## Run

```bash
npm run dev    # http://localhost:3000
```

`npm run dev` freezes your Markdown (`june gen`) and builds the search index (`kura index`)
before it starts the dev server — there's no separate step. The index powers `/search` and
the `search_docs` MCP tool.
