---
"@kurajs/docs": patch
---

Fix sidebar nav-tab sync hiding content `<Tabs>` on load: the shell's tab groups
now use `data-nav-tab` instead of `data-tab`, which the content Tabs component owns
for its buttons/panels. Previously, on any site with root-meta nav tabs, `sync()`'s
document-wide `[data-tab]` query set `hidden` on every content tab button and panel
(none match the active nav-tab key), collapsing each `<Tabs>` block to an empty box —
and the outlet MutationObserver re-applied it after every soft-nav.
