---
title: Quickstart
description: Add content and run the dev server.
section: Getting started
order: 2
---

# Quickstart

Put Markdown files in `content/docs/` with frontmatter, then run the dev server.

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
npm run gen    # generate content + build the search index
npm run dev    # http://localhost:3000
```

`npm run gen` runs `june gen` (freezes your Markdown) and `kura index` (embeds it for
semantic search). The search index powers `/search` and the `search_docs` MCP tool.
