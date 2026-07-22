// Nav-tab visibility sync vs the content <Tabs> component — the REAL shell markup
// (DocsLayoutShell) and REAL content Tabs (mdxComponents.Tabs) run against the REAL shipped
// inline script in a happy-dom window, so the attribute contract between them is what's under
// test. Regression: both features used data-tab, and sync()'s document-wide [data-tab] query hid
// every content tab button/panel (their numeric index never equals the active nav-tab key),
// collapsing each <Tabs> block to an empty box on load and after every soft-nav re-run.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { DocsLayoutShell, SIDEBAR_SYNC_JS, type NavTab } from "../../src/ui.tsx";
import { mdxComponents } from "../../src/mdx.tsx";

const { Tabs, Tab } = mdxComponents;

const NAV_TABS: NavTab[] = [
  { key: "開始", title: "開始", href: "/getting-started", groups: [{ title: "開始", items: [{ slug: "getting-started/sdk", title: "SDK" }] }] },
  { key: "功能", title: "功能", href: "/features", groups: [{ title: "功能", items: [{ slug: "features/search", title: "Search" }] }] },
];

function run(path: string, mutate?: (doc: InstanceType<typeof Window>["document"]) => void) {
  // Real shell + real content Tabs, exactly as a docs page ships them.
  const html = renderToStaticMarkup(
    <DocsLayoutShell navTabs={NAV_TABS} basePath="" searchStatic>
      <Tabs>
        <Tab label="NPM">npm install</Tab>
        <Tab label="CDN">script tag</Tab>
      </Tabs>
    </DocsLayoutShell>,
  );
  const win = new Window({ url: `https://x.dev${path}` });
  const doc = win.document;
  doc.body.innerHTML = html;
  mutate?.(doc);
  // happy-dom has no window.eval — run the SAME shipped script with the window's globals injected
  new Function("document", "location", "MutationObserver", SIDEBAR_SYNC_JS)(doc, win.location, win.MutationObserver);
  return doc;
}

const hidden = (doc: ReturnType<typeof run>, sel: string) =>
  [...doc.querySelectorAll(sel)].map((el) => (el as unknown as { hidden: boolean }).hidden);

test("the shell markup and sync script agree on an attribute that is NOT the content Tabs' data-tab", () => {
  const shellHtml = renderToStaticMarkup(<DocsLayoutShell navTabs={NAV_TABS} basePath="" searchStatic>x</DocsLayoutShell>);
  expect(shellHtml).toContain("data-nav-tab=");
  expect(SIDEBAR_SYNC_JS).toContain("[data-nav-tab]");
  // data-tab in the shell belongs to nothing: only tabbar links carry data-tab-key.
  expect(shellHtml).not.toMatch(/data-tab="/);
});

test("sync shows the active nav-tab's sidebar group and hides the other", () => {
  const doc = run("/getting-started/sdk");
  expect(hidden(doc, "[data-nav-tab]")).toEqual([false, true]);
  expect(doc.querySelector('[data-tabbar] a[aria-current="page"]')?.textContent?.trim()).toBe("開始");
});

test("content <Tabs> keeps its SSR state: buttons visible, active panel shown, inactive panel hidden", () => {
  const doc = run("/getting-started/sdk");
  expect(hidden(doc, ".tab-btn")).toEqual([false, false]);
  expect(hidden(doc, ".tab-panel")).toEqual([false, true]);
});

test("a user-selected content tab survives a sync re-run (soft-nav MutationObserver)", () => {
  // State after the user clicked the second content tab; sync must not touch it.
  const doc = run("/getting-started/sdk", (d) => {
    d.querySelectorAll(".tab-panel").forEach((p, i) => ((p as unknown as { hidden: boolean }).hidden = i !== 1));
  });
  expect(hidden(doc, ".tab-panel")).toEqual([true, false]);
  expect(hidden(doc, ".tab-btn")).toEqual([false, false]);
});

test("navigating into the other nav tab flips the sidebar group visibility", () => {
  const doc = run("/features/search");
  expect(hidden(doc, "[data-nav-tab]")).toEqual([true, false]);
  expect(doc.querySelector('[data-tabbar] a[aria-current="page"]')?.textContent?.trim()).toBe("功能");
});
