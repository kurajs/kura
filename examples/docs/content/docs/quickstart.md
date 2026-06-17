---
title: Quickstart
description: Create and run your first Kura knowledgebase in three steps.
section: Get started
order: 2
---

# Quickstart

## Install

Create a new project with the scaffolder:

```bash
npm create kura my-docs
cd my-docs
npm install
```

## Add content

Drop Markdown files into `content/docs/` and describe each page with frontmatter:

```md
---
title: My first page
section: Get started
order: 1
---

# My first page

Write your content here.
```

## Run

```bash
npm run dev
```

Open `http://localhost:3000` and you have a sidebar, a table of contents, search, and a
`.md` plus `/mcp` for every page.
