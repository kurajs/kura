# @kurajs/ctrlk

A headless, **zero-dependency** ⌘K command palette with a built-in default renderer.
Vanilla DOM — no React, no Preact, nothing. It mirrors [cmdk](https://cmdk.paco.me)'s
model and accessibility (dialog + combobox/listbox/option, `aria-activedescendant`,
full keyboard) so it drops into any stack — including server-rendered sites with no
client framework — and ships zero runtime bytes beyond itself.

## Batteries-included

```ts
import { createCtrlk, mountCtrlk } from "@kurajs/ctrlk";

const ctrl = createCtrlk({
  // Async source: called (debounced, abortable) on every keystroke.
  search: async (query, signal) => {
    const res = await fetch(`/search.json?q=${encodeURIComponent(query)}`, { signal });
    const { hits } = await res.json();
    return hits.map((h) => ({
      id: h.slug + "#" + h.headingId,
      title: h.heading ?? h.title,
      description: `${h.section} › ${h.title}`, // breadcrumb path
      excerpt: h.text,
      group: h.section,
      icon: h.headingId ? "hash" : "page",
      href: `/docs/${h.slug}` + (h.headingId ? `#${h.headingId}` : ""),
    }));
  },
});

mountCtrlk(ctrl, {
  trigger: ".search-box",            // clicking this opens the palette
  tokensOf: (s) => s.query.split(/\s+/), // or the engine's matched terms, for exact highlight
});
// ⌘K / Ctrl+K and "/" now open it; ↑/↓ navigate, Enter opens, Esc closes.
```

## Static command list

Omit `search` and pass `items` to get cmdk-style local fuzzy filtering:

```ts
const ctrl = createCtrlk({
  items: [
    { id: "new", title: "New file", group: "Actions", keywords: ["create"] },
    { id: "theme", title: "Toggle theme", group: "Actions" },
  ],
  onSelect: (item) => run(item.id),
});
mountCtrlk(ctrl);
```

## Headless

`createCtrlk` is the whole state machine (no DOM): `open/close/toggle`, `setQuery`,
`move`/`setActive`, `select`, and `subscribe`. Drive your own renderer from `getState()`,
or render with your framework of choice — `mountCtrlk` is just the default one.

```ts
const ctrl = createCtrlk({ items });
const stop = ctrl.subscribe((state) => paint(state)); // { open, query, loading, items, groups, activeIndex, error }
```

## Theming

The default renderer is styled entirely through `--ctrlk-*` CSS variables (light/dark
out of the box). Theme it by setting them on `.ctrlk-overlay` — e.g. to inherit a host's
tokens: `.ctrlk-overlay { --ctrlk-accent: var(--accent); --ctrlk-bg: var(--surface); }`.
Pass `renderItem` to fully control row markup, or `injectStyles: false` to ship your own.

## API

- `createCtrlk(options) → Ctrlk` — headless controller. Options: `search` | `items` + `filter`,
  `debounce`, `empty`, `loop` (wrap arrow nav, default true), `shouldFilter` (static mode, default
  true), `value` (initial highlight), `onSelect`, `onValueChange`, `onOpenChange`.
  Controller methods: `open`/`close`/`toggle`, `setQuery`, `move`/`setActive`, `setValue` (by id),
  `setItems` (swap the static pool), `select`, `subscribe`, `getState`, `destroy`. State exposes a
  cmdk-style `value` (the active item id) alongside `activeIndex`.
- `mountCtrlk(ctrl, opts) → { destroy }` — default DOM. Opts: `trigger`, `hotkey`, `labels`,
  `tokensOf`, `renderItem`, `injectStyles`, `platform`, `ariaLabel`, `target`.
- `platformHotkeyLabel()` → `"⌘K"` on macOS, `"Ctrl K"` elsewhere (for a trigger hint).
- `highlight(text, tokens)` → segments for custom renderers.

Zero dependencies. Runs on Node, Bun, Deno, Cloudflare Workers (core), and every browser.
