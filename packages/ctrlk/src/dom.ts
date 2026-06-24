// The built-in default renderer: mount a styled, accessible ⌘K dialog driven by a headless
// controller (core.ts). Vanilla DOM, no framework. It owns the global hotkey, the dialog
// keyboard model, focus trap + restore, scroll-lock, ARIA (dialog + combobox/listbox/option
// with aria-activedescendant), query-term highlighting, and empty/loading states. Swap row
// markup via `renderItem`, theme via the `--ctrlk-*` CSS vars (styles.ts).
import type { Ctrlk, CtrlkItem, CtrlkState } from "./types.ts";
import { highlight } from "./highlight.ts";
import { injectStyles } from "./styles.ts";

export interface MountLabels {
  placeholder?: string;
  /** Shown when a non-empty query returns nothing. */
  empty?: string;
  loading?: string;
  /** Shown when the query is empty and there are no suggestions. */
  initial?: string;
  selectHint?: string;
  openHint?: string;
  closeHint?: string;
}

export interface MountOptions<D = unknown> {
  /** Where to append the dialog. Default `document.body`. */
  target?: HTMLElement;
  /** Open on ⌘K / Ctrl+K and `/`. Default true. A predicate fully customizes the chord. */
  hotkey?: boolean | ((e: KeyboardEvent) => boolean);
  /** Element(s) or a selector whose click opens the palette (e.g. the nav search box). */
  trigger?: Element | Iterable<Element> | string | null;
  labels?: MountLabels;
  /** Highlight tokens for the current state (e.g. the search engine's matched terms).
   *  Default: the query split on whitespace. */
  tokensOf?: (state: CtrlkState<D>) => string[];
  /** Override a row's markup. Required ARIA/handlers are still applied to the returned element. */
  renderItem?: (item: CtrlkItem<D>, ctx: { active: boolean; tokens: string[] }) => HTMLElement;
  /** Inject the default stylesheet. Default true. */
  injectStyles?: boolean;
  /** Force the hotkey-hint platform; default auto-detect from the UA. */
  platform?: "mac" | "other";
  /** ARIA label for the dialog. Default "Search". */
  ariaLabel?: string;
}

export interface MountHandle {
  /** Remove listeners + DOM and tear down the controller subscription. */
  destroy(): void;
}

const DEFAULT_LABELS: Required<MountLabels> = {
  placeholder: "Search…",
  empty: "No results",
  loading: "Searching…",
  initial: "Type to search",
  selectHint: "Select",
  openHint: "Open",
  closeHint: "Close",
};

const SEARCH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;
const PAGE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`;

function detectMac(force?: "mac" | "other"): boolean {
  if (force) return force === "mac";
  if (typeof navigator === "undefined") return false;
  const n = `${(navigator as { platform?: string }).platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad|ipod/i.test(n);
}

/** The closed-state hotkey hint to render on a trigger ("⌘K" on macOS, "Ctrl K" elsewhere). */
export function platformHotkeyLabel(platform?: "mac" | "other"): string {
  return detectMac(platform) ? "⌘K" : "Ctrl K";
}

const isTypingTarget = (el: EventTarget | null): boolean => {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || n.isContentEditable;
};

/**
 * Mount the default ⌘K UI for a controller. Returns a handle to tear it down. No-op (returns
 * an inert handle) when there is no document, so it's safe to import in SSR bundles.
 */
export function mountCtrlk<D = unknown>(ctrl: Ctrlk<D>, opts: MountOptions<D> = {}): MountHandle {
  if (typeof document === "undefined") return { destroy() {} };
  const doc = document;
  const labels = { ...DEFAULT_LABELS, ...opts.labels };
  const tokensOf = opts.tokensOf ?? ((s: CtrlkState<D>) => s.query.toLowerCase().split(/\s+/).filter(Boolean));
  if (opts.injectStyles !== false) injectStyles(doc);

  // --- build the static shell once ---
  const overlay = doc.createElement("div");
  overlay.className = "ctrlk-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "presentation");

  const dialog = doc.createElement("div");
  dialog.className = "ctrlk-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", opts.ariaLabel ?? "Search");

  const header = doc.createElement("div");
  header.className = "ctrlk-header";
  const searchIcon = doc.createElement("span");
  searchIcon.innerHTML = SEARCH_SVG; // static, trusted markup
  const input = doc.createElement("input");
  input.className = "ctrlk-input";
  input.type = "text";
  input.placeholder = labels.placeholder;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");
  const listId = "ctrlk-list";
  input.setAttribute("aria-controls", listId);
  const escKbd = doc.createElement("kbd");
  escKbd.className = "ctrlk-esc";
  escKbd.textContent = "ESC";
  header.append(searchIcon.firstChild!, input, escKbd);

  const list = doc.createElement("div");
  list.className = "ctrlk-list";
  list.id = listId;
  list.setAttribute("role", "listbox");

  const footer = doc.createElement("div");
  footer.className = "ctrlk-footer";
  footer.append(
    hint(["↑", "↓"], labels.selectHint),
    hint(["↵"], labels.openHint),
    spacer(hint(["esc"], labels.closeHint)),
  );

  dialog.append(header, list, footer);
  overlay.append(dialog);
  (opts.target ?? doc.body).append(overlay);

  function hint(keys: string[], text: string): HTMLElement {
    const span = doc.createElement("span");
    span.className = "ctrlk-hint";
    for (const k of keys) { const kbd = doc.createElement("kbd"); kbd.textContent = k; span.append(kbd); }
    span.append(doc.createTextNode(text));
    return span;
  }
  function spacer(el: HTMLElement): HTMLElement { el.classList.add("ctrlk-spacer"); return el; }

  // --- rendering ---
  let optionEls: HTMLElement[] = [];
  let lastItems: CtrlkItem<D>[] | null = null;
  let wasOpen = false;
  let returnFocus: HTMLElement | null = null;

  function fillHighlighted(el: HTMLElement, text: string, tokens: string[]): void {
    el.textContent = "";
    for (const seg of highlight(text, tokens)) {
      if (seg.match) { const m = doc.createElement("mark"); m.textContent = seg.text; el.append(m); }
      else el.append(doc.createTextNode(seg.text));
    }
  }

  function defaultRow(item: CtrlkItem<D>, tokens: string[]): HTMLElement {
    const row = doc.createElement(item.href ? "a" : "div");
    if (item.href) (row as HTMLAnchorElement).href = item.href;
    const icon = doc.createElement("span");
    icon.className = "ctrlk-option-icon";
    if (item.icon === "hash") icon.textContent = "#";
    else if (item.icon && item.icon !== "page") icon.textContent = item.icon;
    else icon.innerHTML = PAGE_SVG; // static, trusted
    const body = doc.createElement("div");
    body.className = "ctrlk-option-body";
    const title = doc.createElement("div");
    title.className = "ctrlk-option-title";
    fillHighlighted(title, item.title, tokens);
    body.append(title);
    if (item.description) {
      const path = doc.createElement("div");
      path.className = "ctrlk-option-path";
      fillHighlighted(path, item.description, tokens);
      body.append(path);
    }
    if (item.excerpt) {
      const ex = doc.createElement("div");
      ex.className = "ctrlk-option-excerpt";
      fillHighlighted(ex, item.excerpt, tokens);
      body.append(ex);
    }
    row.append(icon, body);
    return row;
  }

  function activate(item: CtrlkItem<D>, ev: MouseEvent | KeyboardEvent): void {
    ctrl.select(item, { metaKey: ev.metaKey, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey });
    ctrl.close();
    if (item.href) location.assign(item.href);
  }

  function rebuildList(state: CtrlkState<D>): void {
    const tokens = tokensOf(state);
    list.textContent = "";
    optionEls = [];

    if (!state.items.length) {
      const div = doc.createElement("div");
      div.className = "ctrlk-state";
      div.textContent = state.loading ? labels.loading : state.query.trim() ? labels.empty : labels.initial;
      list.append(div);
      return;
    }

    let flat = 0;
    for (const group of state.groups) {
      if (group.label) {
        const gl = doc.createElement("div");
        gl.className = "ctrlk-group-label";
        gl.setAttribute("role", "presentation");
        gl.textContent = group.label;
        list.append(gl);
      }
      for (const item of group.items) {
        const index = flat++;
        const base = opts.renderItem ? opts.renderItem(item, { active: false, tokens }) : defaultRow(item, tokens);
        base.classList.add("ctrlk-option");
        base.id = `ctrlk-opt-${index}`;
        base.setAttribute("role", "option");
        base.setAttribute("aria-selected", "false");
        base.dataset.index = String(index);
        base.addEventListener("click", (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let the browser open links natively
          e.preventDefault();
          activate(item, e);
        });
        base.addEventListener("mousemove", () => { if (state.activeIndex !== index) ctrl.setActive(index); });
        list.append(base);
        optionEls.push(base);
      }
    }
  }

  function syncActive(state: CtrlkState<D>): void {
    optionEls.forEach((el, i) => el.setAttribute("aria-selected", i === state.activeIndex ? "true" : "false"));
    const active = optionEls[state.activeIndex];
    if (active) { input.setAttribute("aria-activedescendant", active.id); active.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }

  function render(state: CtrlkState<D>): void {
    overlay.hidden = !state.open;
    input.setAttribute("aria-expanded", String(state.open && state.items.length > 0));

    if (state.open && !wasOpen) {
      returnFocus = doc.activeElement as HTMLElement | null;
      doc.documentElement.classList.add("ctrlk-open");
      if (input.value !== state.query) input.value = state.query;
      input.focus();
    } else if (!state.open && wasOpen) {
      doc.documentElement.classList.remove("ctrlk-open");
      lastItems = null; // force a fresh list next open
      if (returnFocus && doc.contains(returnFocus)) returnFocus.focus();
    }
    wasOpen = state.open;
    if (!state.open) return;

    // Keep the input text in sync when the query changed programmatically (not from typing).
    if (input.value !== state.query) input.value = state.query;
    if (state.items !== lastItems) { rebuildList(state); lastItems = state.items; }
    syncActive(state);
  }

  // --- wiring ---
  const unsubscribe = ctrl.subscribe(render);

  const onInput = () => ctrl.setQuery(input.value);
  input.addEventListener("input", onInput);

  const onDialogKeydown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); ctrl.move(1); break;
      case "ArrowUp": e.preventDefault(); ctrl.move(-1); break;
      case "Home": e.preventDefault(); ctrl.setActive(0); break;
      case "End": e.preventDefault(); ctrl.setActive(ctrl.getState().items.length - 1); break;
      case "Enter": {
        const st = ctrl.getState();
        const item = st.items[st.activeIndex];
        if (item) { e.preventDefault(); activate(item, e); }
        break;
      }
      case "Escape": e.preventDefault(); ctrl.close(); break;
      case "Tab": e.preventDefault(); break; // trap focus on the input (combobox pattern)
    }
  };
  dialog.addEventListener("keydown", onDialogKeydown);

  // Close on a click in the backdrop (outside the dialog).
  const onOverlayMousedown = (e: MouseEvent) => { if (e.target === overlay) ctrl.close(); };
  overlay.addEventListener("mousedown", onOverlayMousedown);

  // Global hotkey: ⌘K / Ctrl+K toggles; "/" opens when not already typing.
  const hotkeyEnabled = opts.hotkey ?? true;
  const onGlobalKeydown = (e: KeyboardEvent) => {
    if (typeof hotkeyEnabled === "function") { if (hotkeyEnabled(e)) { e.preventDefault(); ctrl.toggle(); } return; }
    if (!hotkeyEnabled) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ctrl.toggle(); return; }
    if (e.key === "/" && !ctrl.getState().open && !isTypingTarget(e.target)) { e.preventDefault(); ctrl.open(); }
  };
  doc.addEventListener("keydown", onGlobalKeydown);

  // Triggers: clicking opens the palette (and never submits a wrapping form).
  const triggers: Element[] = [];
  if (opts.trigger) {
    const els = typeof opts.trigger === "string"
      ? Array.from(doc.querySelectorAll(opts.trigger))
      : opts.trigger instanceof Element ? [opts.trigger] : Array.from(opts.trigger);
    for (const el of els) { triggers.push(el); el.addEventListener("click", onTriggerClick); }
  }
  function onTriggerClick(e: Event) { e.preventDefault(); ctrl.open(); }

  return {
    destroy() {
      unsubscribe();
      input.removeEventListener("input", onInput);
      dialog.removeEventListener("keydown", onDialogKeydown);
      overlay.removeEventListener("mousedown", onOverlayMousedown);
      doc.removeEventListener("keydown", onGlobalKeydown);
      for (const el of triggers) el.removeEventListener("click", onTriggerClick);
      doc.documentElement.classList.remove("ctrlk-open");
      overlay.remove();
    },
  };
}
