---
title: The content model
description: How Kura turns a folder of Markdown into a navigable, projectable site.
---

# The content model

Kura's content is just files. A folder of Markdown under `content/docs/` becomes the
site; the folder structure becomes the sidebar.

- A file's frontmatter `title` names the page.
- A folder's `index.md` is the folder's own landing page (the folder header links to it).
- A `meta.json` per folder sets the group title and orders its children.

There is no central config that can drift from the files — the tree *is* the source.
