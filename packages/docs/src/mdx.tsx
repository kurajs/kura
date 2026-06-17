// BUILD-TIME ONLY (imported by `kura index`, never by the runtime/app bundle): compile
// MDX -> static HTML with Kura's curated components. Uses @mdx-js (eval) + react-dom/server,
// which is fine in Node at build but NOT allowed on Cloudflare Workers — that's why the
// rendered HTML is frozen at build and loaded at runtime instead of compiling per request.
import { evaluate } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Children, isValidElement, type ReactElement, type ReactNode } from "react";
import * as runtime from "react/jsx-runtime";

// --- curated components (class-based; styled by @kurajs/docs themeCss) ---
function Callout({ type = "note", title, children }: { type?: string; title?: string; children?: ReactNode }) {
  return createElement(
    "div",
    { className: `callout callout-${type}` },
    title ? createElement("p", { className: "callout-title" }, title) : null,
    createElement("div", { className: "callout-body" }, children),
  );
}
function Card({ title, href, children }: { title?: string; href?: string; children?: ReactNode }) {
  const inner = [
    title ? createElement("p", { className: "card-title", key: "t" }, title) : null,
    createElement("div", { className: "card-body", key: "b" }, children),
  ];
  return href ? createElement("a", { className: "card", href }, inner) : createElement("div", { className: "card" }, inner);
}
function Steps({ children }: { children?: ReactNode }) {
  return createElement("div", { className: "steps" }, children);
}

// <Tabs><Tab label="A">…</Tab><Tab label="B">…</Tab></Tabs>
// Renders to static HTML (buttons + panels); a small client script toggles them.
function Tab({ children }: { label?: string; children?: ReactNode }) {
  return createElement("div", null, children);
}
function Tabs({ children }: { children?: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<{ label?: string; children?: ReactNode }>[];
  const buttons = tabs.map((t, i) =>
    createElement("button", { type: "button", className: "tab-btn" + (i === 0 ? " active" : ""), "data-tab": String(i), key: `b${i}` }, t.props.label ?? `Tab ${i + 1}`),
  );
  const panels = tabs.map((t, i) =>
    createElement("div", { className: "tab-panel", "data-tab": String(i), hidden: i !== 0 || undefined, key: `p${i}` }, t.props.children),
  );
  return createElement("div", { className: "tabs" }, createElement("div", { className: "tab-list" }, buttons), ...panels);
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
