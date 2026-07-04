// The sidebar active-item reveal — evaluated against the REAL shipped inline script (no mirror):
// SIDEBAR_SYNC_JS runs in a happy-dom window with stubbed geometry, and we assert the container-
// scoped scroll math, the visible/hidden no-ops, and that aria-current sync still works.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { SIDEBAR_SYNC_JS } from "../../src/ui.tsx";

type Rect = { top: number; bottom: number; height: number };
function run(opts: { path: string; navRect: Rect; itemRect: Rect; clientHeight: number; scrollTop?: number }) {
  const win = new Window({ url: `https://x.dev${opts.path}` });
  const doc = win.document;
  doc.body.innerHTML = `
    <aside class="sidebar" id="docs-nav">
      <a href="/other">Other</a>
      <a href="/user-guide/09-webui">WebUI</a>
    </aside>
    <main data-june-outlet></main>`;
  const nav = doc.getElementById("docs-nav")! as unknown as HTMLElement & { scrollTop: number };
  nav.scrollTop = opts.scrollTop ?? 0;
  Object.defineProperty(nav, "clientHeight", { value: opts.clientHeight });
  (nav as unknown as { getBoundingClientRect: () => Rect }).getBoundingClientRect = () => opts.navRect;
  const item = doc.querySelector('a[href="/user-guide/09-webui"]')! as unknown as { getBoundingClientRect: () => Rect };
  item.getBoundingClientRect = () => opts.itemRect;
  // happy-dom has no window.eval — run the SAME shipped script with the window's globals injected
  new Function("document", "location", "MutationObserver", SIDEBAR_SYNC_JS)(doc, win.location, win.MutationObserver);
  return { nav, doc };
}

test("active link below the fold: the sidebar (not the page) scrolls it to center", () => {
  // nav viewport 0..600 (h=600), item at 1400..1430 → delta = 1400 - 0 - (600-30)/2 = 1115
  const { nav, doc } = run({
    path: "/user-guide/09-webui",
    navRect: { top: 0, bottom: 600, height: 600 },
    itemRect: { top: 1400, bottom: 1430, height: 30 },
    clientHeight: 600,
  });
  expect(doc.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("/user-guide/09-webui"); // sync still works
  expect(nav.scrollTop).toBe(1115);
});

test("already visible: no movement (soft-nav keeps its scroll position)", () => {
  const { nav } = run({
    path: "/user-guide/09-webui",
    navRect: { top: 0, bottom: 600, height: 600 },
    itemRect: { top: 200, bottom: 230, height: 30 },
    clientHeight: 600,
    scrollTop: 480,
  });
  expect(nav.scrollTop).toBe(480);
});

test("hidden sidebar (mobile: all-zero rects): no-op, no NaN", () => {
  const { nav } = run({
    path: "/user-guide/09-webui",
    navRect: { top: 0, bottom: 0, height: 0 },
    itemRect: { top: 0, bottom: 0, height: 0 },
    clientHeight: 0,
  });
  expect(nav.scrollTop).toBe(0);
});

test("no active link on this page: untouched", () => {
  const { nav } = run({
    path: "/nowhere",
    navRect: { top: 0, bottom: 600, height: 600 },
    itemRect: { top: 1400, bottom: 1430, height: 30 },
    clientHeight: 600,
  });
  expect(nav.scrollTop).toBe(0);
});
