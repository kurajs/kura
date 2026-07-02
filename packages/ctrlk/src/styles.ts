// Default renderer styles, as a string injected once into a <style id="ctrlk-styles">.
// Self-contained: everything is driven by `--ctrlk-*` custom properties with sensible
// light/dark defaults, so a host (e.g. Kura docs) can theme it by setting those vars —
// `.ctrlk-overlay { --ctrlk-accent: var(--accent); }` — without touching this sheet.

export const STYLE_ID = "ctrlk-styles";

export const CSS = `
.ctrlk-overlay {
  --ctrlk-bg: #fff;
  --ctrlk-fg: #1a1a1a;
  --ctrlk-muted: #6b7280;
  --ctrlk-border: #e5e7eb;
  --ctrlk-active: #f3f4f6;
  --ctrlk-accent: #2563eb;
  --ctrlk-mark: #facc15;
  --ctrlk-mark-fg: #1a1a1a;
  --ctrlk-shadow: 0 16px 48px rgba(0,0,0,.18);
  --ctrlk-radius: 14px;
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 12vh 16px 16px;
  background: rgba(15,17,21,.45);
  backdrop-filter: blur(2px);
}
.ctrlk-overlay[hidden] { display: none; }
@media (prefers-color-scheme: dark) {
  .ctrlk-overlay {
    --ctrlk-bg: #1c1f26; --ctrlk-fg: #f3f4f6; --ctrlk-muted: #9aa1ad;
    --ctrlk-border: #2d323c; --ctrlk-active: #272b34; --ctrlk-accent: #6ea8fe;
    --ctrlk-mark-fg: #1a1a1a; --ctrlk-shadow: 0 16px 48px rgba(0,0,0,.5);
  }
}
.ctrlk-dialog {
  width: 100%; max-width: 640px; max-height: 76vh;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--ctrlk-bg); color: var(--ctrlk-fg);
  border: 1px solid var(--ctrlk-border); border-radius: var(--ctrlk-radius);
  box-shadow: var(--ctrlk-shadow);
  animation: ctrlk-in .12s ease-out;
}
@keyframes ctrlk-in { from { opacity: 0; transform: translateY(-6px) scale(.99); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ctrlk-dialog { animation: none; } }

.ctrlk-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--ctrlk-border); }
.ctrlk-header svg { width: 18px; height: 18px; flex: none; color: var(--ctrlk-muted); }
.ctrlk-input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
  font: inherit; font-size: 1rem; color: var(--ctrlk-fg);
}
.ctrlk-input::placeholder { color: var(--ctrlk-muted); }
.ctrlk-esc {
  flex: none; font-size: .7rem; line-height: 1; padding: 4px 7px; color: var(--ctrlk-muted);
  border: 1px solid var(--ctrlk-border); border-radius: 6px; background: var(--ctrlk-active);
}

.ctrlk-list { overflow-y: auto; overscroll-behavior: contain; padding: 6px; flex: 1; }
.ctrlk-group-label {
  padding: 12px 10px 6px; font-size: .72rem; font-weight: 600; letter-spacing: .04em;
  text-transform: uppercase; color: var(--ctrlk-muted);
}
.ctrlk-option {
  display: flex; gap: 11px; align-items: flex-start; padding: 9px 10px; border-radius: 9px;
  cursor: pointer; color: inherit; text-decoration: none; scroll-margin: 8px;
}
.ctrlk-option[aria-selected="true"] { background: var(--ctrlk-active); }
.ctrlk-option-icon { flex: none; width: 18px; height: 18px; margin-top: 2px; color: var(--ctrlk-muted); display: flex; align-items: center; justify-content: center; font-size: .95rem; }
.ctrlk-option-body { min-width: 0; flex: 1; }
.ctrlk-option-title { font-size: .92rem; font-weight: 500; color: var(--ctrlk-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctrlk-option-path { font-size: .76rem; color: var(--ctrlk-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctrlk-option-excerpt { font-size: .8rem; color: var(--ctrlk-muted); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* Rich HTML preview (rendered section): clamp height + fade, and render tables/code/lists compactly
   so a formatted snippet stays inside the row instead of the raw markdown syntax. */
.ctrlk-option-html { display: block; -webkit-line-clamp: none; max-height: 5.5em; overflow: hidden; -webkit-mask-image: linear-gradient(#000 70%, transparent); mask-image: linear-gradient(#000 70%, transparent); }
.ctrlk-option-html > :first-child { margin-top: 0; } .ctrlk-option-html > :last-child { margin-bottom: 0; }
.ctrlk-option-html p, .ctrlk-option-html ul, .ctrlk-option-html ol, .ctrlk-option-html pre { margin: .15em 0; }
.ctrlk-option-html ul, .ctrlk-option-html ol { padding-left: 1.1em; }
.ctrlk-option-html code { font-size: .92em; background: var(--ctrlk-code-bg, rgba(127,127,127,.16)); border-radius: 3px; padding: 0 .25em; }
.ctrlk-option-html pre { background: var(--ctrlk-code-bg, rgba(127,127,127,.12)); border-radius: 5px; padding: .3em .5em; overflow: hidden; white-space: pre-wrap; }
.ctrlk-option-html pre code { background: none; padding: 0; }
.ctrlk-option-html table { border-collapse: collapse; font-size: .92em; display: block; overflow: hidden; }
.ctrlk-option-html :is(td, th) { border: 1px solid var(--ctrlk-border, rgba(127,127,127,.3)); padding: 1px .4em; text-align: left; white-space: nowrap; }
.ctrlk-option-html a { color: inherit; text-decoration: underline; } .ctrlk-option-html img { display: none; }
.ctrlk-option mark { background: var(--ctrlk-mark); color: var(--ctrlk-mark-fg); border-radius: 2px; padding: 0 1px; }

.ctrlk-state { padding: 36px 16px; text-align: center; color: var(--ctrlk-muted); font-size: .9rem; }

.ctrlk-footer {
  display: flex; gap: 16px; align-items: center; padding: 9px 14px;
  border-top: 1px solid var(--ctrlk-border); color: var(--ctrlk-muted); font-size: .76rem;
}
.ctrlk-footer .ctrlk-hint { display: inline-flex; gap: 5px; align-items: center; }
.ctrlk-footer kbd {
  font: inherit; font-size: .72rem; min-width: 18px; height: 18px; padding: 0 4px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--ctrlk-border); border-radius: 5px; background: var(--ctrlk-active);
}
.ctrlk-footer .ctrlk-spacer { margin-left: auto; }

html.ctrlk-open, body.ctrlk-open { overflow: hidden !important; }
`;

/** Inject the default stylesheet once (no-op on the server or if already present). */
export function injectStyles(doc: Document = document): void {
  if (typeof document === "undefined" && !doc) return;
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  doc.head.appendChild(el);
}
