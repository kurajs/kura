---
title: The content model
description: How Kura turns a folder of Markdown into a navigable, projectable site.
---

# The content model

Kura's content is just files. A folder of Markdown under `content/docs/` becomes the
site; the folder structure becomes the sidebar. There are three roles, mirroring the
model proven by tools like Mintlify:

- **Sections** — the top-level folders. They render as bold, non-clickable headings
  that group the pages beneath them. A section is a *label*, not a page. Its title and
  child order come from the folder's `meta.json`.
- **Pages** — the Markdown files. Each is a clickable sidebar item and a route.
- **Folders** (nested) — a folder *inside* a section is a collapsible group. If it has
  an `index.md`, that file is the folder's own page: the group header links to it and
  expands the children (folder-as-page).

## Giving a section a landing page

A section is a label, so it has no page of its own. When you want a "start here" page
for a section, add an `index.md` to the section folder and title it **Overview** (or
anything distinct from the section name) — it shows up as the section's first item:

```
content/docs/features/meta.json        # { "title": "Features", "pages": ["index", "search"] }
content/docs/features/index.md         # title: Overview  → the section's landing page
content/docs/features/search/index.md  # a nested folder-as-page (header links here)
```

Sidebar:

```
Features            ← section label (not a link)
  Overview          ← features/index.md
  Search ›          ← nested folder-as-page
```

Sections without an `index.md` are simply labels with their pages listed below — that
is the common case, and perfectly fine.

There is no central config that can drift from the files — the tree *is* the source.
