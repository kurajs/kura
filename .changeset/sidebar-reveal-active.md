---
"@kurajs/docs": patch
---

Long sidebars reveal the active page on load: the shell's sync script scrolls the sidebar's own container (never the page) so the current item is centered when it is out of view — a full page load no longer resets a long nav to the top. No-ops when the item is already visible (soft-nav keeps its scroll) and on mobile; runs after active-folder expansion so measurements see the final layout.
