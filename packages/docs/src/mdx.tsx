// BUILD-TIME ONLY (imported by `kura index`, never by the runtime/app bundle): compile
// MDX -> static HTML with Kura's curated components. Uses @mdx-js (eval) + react-dom/server,
// which is fine in Node at build but NOT allowed on Cloudflare Workers — that's why the
// rendered HTML is frozen at build and loaded at runtime instead of compiling per request.
import { evaluate } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Children, isValidElement, type ReactElement, type ReactNode } from "react";
import * as runtime from "react/jsx-runtime";

// --- curated components — Tailwind utilities (the consumer's Tailwind scans this file's compiled
// output via @source). The class literals here MUST be whole, scannable strings (no runtime concat of
// fragments), so the tone map below lists each variant in full. `callout-body`/`steps`/`tab-*` are
// hook classes the preset's component layer styles (child-margin reset / counters / JS-toggled state). ---
const CALLOUT_TONE: Record<string, string> = {
  note: "border-l-accent bg-accent-soft",
  tip: "border-l-green-600 bg-[var(--callout-tip-bg)]",
  warning: "border-l-amber-600 bg-[var(--callout-warn-bg)]",
  danger: "border-l-red-600 bg-[var(--callout-danger-bg)]",
};
function Callout({ type = "note", title, children }: { type?: string; title?: string; children?: ReactNode }) {
  const tone = CALLOUT_TONE[type] ?? "border-l-border bg-surface-2";
  return createElement(
    "div",
    { className: `my-5 px-4 py-3 border border-border border-l-[3px] rounded-r-lg ${tone}` },
    title ? createElement("p", { className: "m-0 mb-1 font-bold text-[.9rem]" }, title) : null,
    createElement("div", { className: "callout-body" }, children),
  );
}
function Card({ title, href, children }: { title?: string; href?: string; children?: ReactNode }) {
  const inner = [
    title ? createElement("p", { className: "m-0 mb-1 font-bold", key: "t" }, title) : null,
    createElement("div", { key: "b" }, children),
  ];
  const cls = "block my-4 px-4 py-4 border border-border rounded-xl bg-surface" + (href ? " hover:border-accent" : "");
  return href ? createElement("a", { className: cls, href }, inner) : createElement("div", { className: cls }, inner);
}
function Steps({ children }: { children?: ReactNode }) {
  return createElement("div", { className: "steps" }, children);
}

// <Tabs><Tab label="A">…</Tab><Tab label="B">…</Tab></Tabs>
// Renders to static HTML (buttons + panels); a small client script toggles `.active` (preset styles it).
function Tab({ children }: { label?: string; children?: ReactNode }) {
  return createElement("div", null, children);
}
function Tabs({ children }: { children?: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<{ label?: string; children?: ReactNode }>[];
  const btn = "tab-btn px-3 py-2 text-[.88rem] border-0 border-b-2 border-transparent bg-transparent text-muted cursor-pointer hover:text-fg";
  const buttons = tabs.map((t, i) =>
    createElement("button", { type: "button", className: btn + (i === 0 ? " active" : ""), "data-tab": String(i), key: `b${i}` }, t.props.label ?? `Tab ${i + 1}`),
  );
  const panels = tabs.map((t, i) =>
    createElement("div", { className: "tab-panel px-4 py-4", "data-tab": String(i), hidden: i !== 0 || undefined, key: `p${i}` }, t.props.children),
  );
  return createElement(
    "div",
    { className: "tabs my-5 border border-border rounded-xl overflow-hidden" },
    createElement("div", { className: "tab-list flex gap-1 px-1.5 pt-1.5 bg-surface-2 border-b border-border" }, buttons),
    ...panels,
  );
}

export const mdxComponents = { Callout, Card, Steps, Tabs, Tab };

const cache = new Map<string, string>();

/** Compile MDX source to a static HTML string (curated components rendered). Cached. */
export async function mdxToHtml(source: string, components: Record<string, unknown> = mdxComponents): Promise<string> {
  const hit = cache.get(source);
  if (hit !== undefined) return hit;
  const mod = await evaluate(source, { ...(runtime as Record<string, unknown>), remarkPlugins: [remarkGfm] } as never);
  const Content = (mod as { default: (props: { components?: unknown }) => unknown }).default;
  const html = renderToStaticMarkup(createElement(Content as never, { components }) as never);
  cache.set(source, html);
  return html;
}
