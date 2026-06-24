// Browser-only: enhance the docs search box into a ⌘K command palette backed by /search.json.
// Imported from an app's `app/_client.ts` (June bundles it to /_june/client.js and injects a
// module <script>). Pure progressive enhancement — with JS off the nav <form> still GETs
// /search and the full-page results render server-side. Zero React; @kurajs/ctrlk is vanilla DOM.
import { createCtrlk, mountCtrlk, platformHotkeyLabel } from "@kurajs/ctrlk";
import type { CtrlkItem } from "@kurajs/ctrlk";

/** One search hit as the /search.json projection returns it (mirrors SearchHit in search.ts). */
interface SearchHitJSON {
  slug: string;
  title: string;
  section: string;
  text: string;
  score: number;
  locale?: string;
  headingId?: string;
  heading?: string;
}

export interface InitSearchOptions {
  /** Selector for the trigger (the nav search box). Default ".search-box". */
  trigger?: string;
  /** JSON endpoint. Default: the trigger's `data-search-endpoint`, else "/search.json". */
  endpoint?: string;
  /** Locale-resolved doc base for result links (trailing slash). Default: `data-doc-base`, else "/docs/". */
  docBase?: string;
  /** Render the ⌘K / Ctrl K hint on the trigger. Default true. */
  hint?: boolean;
}

/** Enhance the docs search box. Safe to call before DOMContentLoaded (defers itself) and on the
 *  server (no-op). Idempotent per trigger. */
export function initSearch(opts: InitSearchOptions = {}): void {
  if (typeof document === "undefined") return;
  const run = () => setup(opts);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

function setup(opts: InitSearchOptions): void {
  const trigger = document.querySelector<HTMLElement>(opts.trigger ?? ".search-box");
  if (trigger?.dataset.ctrlkReady) return; // already enhanced
  const endpoint = opts.endpoint ?? trigger?.dataset.searchEndpoint ?? "/search.json";
  const docBase = (opts.docBase ?? trigger?.dataset.docBase ?? "/docs/").replace(/\/?$/, "/");

  let tokens: string[] = []; // the engine's matched terms, for exact (CJK-correct) highlight
  const ctrl = createCtrlk<SearchHitJSON>({
    debounce: 120,
    async search(query, signal) {
      // mode=keyword → instant BM25 typeahead (no ~200ms query embed per keystroke).
      const url = `${endpoint}?q=${encodeURIComponent(query)}&mode=keyword`;
      const res = await fetch(url, { signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`search ${res.status}`);
      const data = (await res.json()) as { hits: SearchHitJSON[]; tokens?: string[] };
      tokens = data.tokens ?? [];
      return data.hits.map(toItem(docBase));
    },
  });

  mountCtrlk(ctrl, {
    tokensOf: () => tokens,
    ariaLabel: trigger?.getAttribute("aria-label") ?? "Search",
  });

  // Tell FOCUS_JS (the no-module "/" handler in ui.tsx) to hand "/" off to the palette.
  document.documentElement.dataset.ctrlk = "1";

  if (trigger) {
    // Turn the input into a pure trigger when JS is on: clicking or focusing opens the palette,
    // and it no longer captures keystrokes (you type in the palette). Without JS it stays a
    // normal, submittable search field.
    trigger.dataset.ctrlkReady = "1";
    (trigger as HTMLInputElement).readOnly = true;
    trigger.addEventListener("mousedown", (e) => { e.preventDefault(); ctrl.open(); });
    trigger.addEventListener("focus", () => ctrl.open());
    if (opts.hint !== false) addHint(trigger);
  }
}

function toItem(docBase: string) {
  return (h: SearchHitJSON): CtrlkItem<SearchHitJSON> => ({
    id: `${h.slug}#${h.headingId ?? ""}`,
    title: h.heading || h.title, // the section heading, falling back to the page title
    description: [h.section, h.title].filter(Boolean).join(" › "), // breadcrumb path
    excerpt: h.text,
    group: h.section || "",
    icon: h.headingId ? "hash" : "page",
    href: `${docBase}${h.slug}${h.headingId ? `#${h.headingId}` : ""}`,
    data: h,
  });
}

/** A small platform-aware hotkey hint pinned to the right edge of the search box. */
function addHint(trigger: HTMLElement): void {
  const host = (trigger.closest("form") ?? trigger.parentElement) as HTMLElement | null;
  if (!host || host.querySelector(".ctrlk-trigger-hint")) return;
  const kbd = document.createElement("kbd");
  kbd.className = "ctrlk-trigger-hint";
  kbd.textContent = platformHotkeyLabel();
  kbd.setAttribute("aria-hidden", "true");
  Object.assign(kbd.style, {
    position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
    pointerEvents: "none", fontSize: ".72rem", lineHeight: "1", padding: "3px 6px",
    borderRadius: "5px", border: "1px solid var(--border, #e5e7eb)",
    color: "var(--fg-soft, #6b7280)", background: "var(--surface-2, transparent)",
  });
  host.style.position = "relative";
  (trigger as HTMLElement).style.paddingRight = "3.4rem";
  host.appendChild(kbd);
}
