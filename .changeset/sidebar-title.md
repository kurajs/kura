---
"@kurajs/docs": patch
---

Add a frontmatter `sidebarTitle`: a short label for the navigation chrome while the page keeps its full `title`. The sidebar (folder, `section` and `config.nav` models alike, folder index pages included, and a nested folder's header when its index page sets one) and the prev/next pager show `sidebarTitle`; the H1, the page `<title>`, search hits and `/llms.txt` keep `title`. Help centers whose titles are long questions ("How do I set up a bundle discount for two courses?") can now list them as "Bundle discount" without shortening the heading readers and search engines see.

A `config.nav` page label (`{ slug, title }`) still wins over `sidebarTitle`, and a blank or non-string value falls back to `title`.
