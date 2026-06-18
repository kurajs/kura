---
title: Quickstart
description: Scaffold, write a page, and run your first Kura knowledgebase in three steps.
---

# Quickstart

## 1. Scaffold

```bash
npm create kura@latest my-docs
cd my-docs && npm install
```

## 2. Write a page

Drop a Markdown file in `content/docs/`. Frontmatter sets the title; the folder
structure becomes the sidebar.

```markdown
---
title: Hello
---

# Hello, Kura
```

## 3. Run

```bash
npm run dev
```

Open `http://localhost:3000`. Your page is live at `/docs/hello` — and at
`/docs/hello.md`, `/docs/hello.json`, and `/mcp` for agents.
