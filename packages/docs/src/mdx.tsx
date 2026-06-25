// BUILD-TIME ONLY (imported by `kura index`, never by the runtime/app bundle): compile
// MDX -> static HTML with Kura's curated components. Uses @mdx-js (eval) + react-dom/server,
// which is fine in Node at build but NOT allowed on Cloudflare Workers — that's why the
// rendered HTML is frozen at build and loaded at runtime instead of compiling per request.
import { evaluate } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighter } from "shiki";
import { toHtmlSync as commonmarkToHtmlSync, initSync as initCommonmark } from "@momiji-rs/sparkdown/gfm";
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
    { className: `callout my-5 px-4 py-3 border border-border border-l-[3px] rounded-r-lg ${tone}` },
    title ? createElement("p", { className: "m-0 mb-1 font-bold text-[.9rem]" }, title) : null,
    createElement("div", { className: "callout-body" }, children),
  );
}
// `not-prose` keeps the typography plugin from restyling the card: otherwise the <a> picks up prose
// link color + underline and the <p>s get prose paragraph margins (the big gaps). With it excluded,
// the explicit classes below fully own the look.
function Card({ title, description, href, children }: { title?: string; description?: string; href?: string; children?: ReactNode }) {
  const inner = [
    title ? createElement("p", { className: "m-0 mb-1.5 font-bold text-fg", key: "t" }, title) : null,
    description ? createElement("p", { className: "m-0 text-[.9rem] text-muted leading-snug", key: "d" }, description) : null,
    children ? createElement("div", { className: "mt-2", key: "b" }, children) : null,
  ];
  const cls = "not-prose block my-4 px-4 py-3.5 border border-border rounded-xl bg-surface no-underline" + (href ? " hover:border-accent" : "");
  return href ? createElement("a", { className: cls, href }, inner) : createElement("div", { className: cls }, inner);
}
// Responsive grid of <Card>s. `[&>*]:my-0` cancels each Card's standalone `my-4` (the grid `gap`
// owns the spacing here); `[&>*]:h-full` equalizes cell heights. Whole, scannable class literals.
function Cards({ children }: { children?: ReactNode }) {
  return createElement("div", { className: "not-prose cards grid gap-4 my-5 sm:grid-cols-2 [&>*]:my-0 [&>*]:h-full" }, children);
}
function Steps({ children }: { children?: ReactNode }) {
  return createElement("div", { className: "steps" }, children);
}
// <Steps><Step>…</Step><Step>…</Step></Steps> — each Step carries the `.step` hook the preset
// numbers via `counter-increment` (the `.steps` counter badge sits on its left rule).
function Step({ children }: { children?: ReactNode }) {
  return createElement("div", { className: "step" }, children);
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

export const mdxComponents = { Callout, Card, Cards, Steps, Step, Tabs, Tab };

// Highlighter singleton — created once per build process, shared across all mdxToHtml calls.
// Dual-theme (light + dark): CSS variables strategy so the rendered HTML switches with
// [data-theme="dark"] without any JS or re-render. Curated language list covers typical docs content.
type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;
let _highlighter: Highlighter | null = null;
async function getHighlighter(): Promise<Highlighter> {
  if (!_highlighter) {
    _highlighter = await createHighlighter({
      themes: ["github-light", "github-dark-default"],
      langs: [
        "typescript", "tsx", "javascript", "jsx",
        "bash", "sh", "shell",
        "json", "jsonc", "yaml", "toml",
        "html", "css",
        "markdown", "mdx",
        "python", "go", "rust",
        "sql", "graphql",
        "diff", "text",
      ],
    });
  }
  return _highlighter;
}

const cache = new Map<string, string>();

// --- CommonMark path (markdown: "commonmark" / --commonmark): render with the sparkdown-gfm wasm
// (fast, CommonMark-strict so a literal `{…}` is text, GFM tables/strikethrough/task-lists/autolinks),
// then highlight code blocks with the SAME shiki highlighter the MDX path uses — so both modes get
// identical build-time, dual-theme highlighting. sparkdown emits `<pre><code class="language-X">…escaped…
// </code></pre>` (no class for an un-tagged fence); we swap each block for shiki's output. ---
let sparkInited = false;
const unescapeHtml = (s: string): string =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const CODE_BLOCK = /<pre><code(?: class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g;

function highlightCommonmark(html: string, highlighter: Highlighter, loaded: Set<string>): string {
  return html.replace(CODE_BLOCK, (whole, lang: string | undefined, body: string) => {
    const code = unescapeHtml(body).replace(/\n$/, ""); // drop sparkdown's trailing newline inside <code>
    const useLang = lang && loaded.has(lang) ? lang : "text"; // unknown/absent language → render as plain text
    let out: string;
    try {
      out = highlighter.codeToHtml(code, {
        lang: useLang,
        themes: { light: "github-light", dark: "github-dark-default" },
        defaultColor: false, // CSS vars (--shiki-light/dark) — matches the MDX path's theme switching
      });
    } catch {
      return whole; // any shiki failure → keep the plain (escaped) block rather than drop highlighting
    }
    // Parity with the MDX path's addLanguageClass: tag <code> with the AUTHORED language (even if it fell
    // back to "text" for highlighting), so language-specific styling/tooling still sees it.
    return lang ? out.replace("<code", `<code class="language-${lang}"`) : out;
  });
}

async function renderCommonmark(source: string): Promise<string> {
  if (!sparkInited) {
    initCommonmark(); // synchronous wasm init, idempotent, build-time only
    sparkInited = true;
  }
  const highlighter = await getHighlighter();
  return highlightCommonmark(commonmarkToHtmlSync(source), highlighter, new Set(highlighter.getLoadedLanguages()));
}

/** Compile a doc to a static HTML string. Cached (default components only — see below).
 *  `format`: "mdx" (default) parses JS expressions `{…}` and JSX `<Tag/>` via @mdx-js, so the curated
 *  components (Callout/Tabs/…) render; "md" is plain CommonMark + GFM via the sparkdown-gfm wasm — no
 *  MDX/JSX parsing, so a literal `{…}` is text (a literal `<tag>` is still raw HTML) and the curated JSX
 *  components do NOT render. Both modes highlight code with the same shiki highlighter. Opt into "md"
 *  (markdown: "commonmark") for prose-only docs, to avoid MDX's expression footgun (and for speed). */
export async function mdxToHtml(
  source: string,
  components: Record<string, unknown> = mdxComponents,
  format: "mdx" | "md" = "mdx",
): Promise<string> {
  // The cache key is format+source — it can't capture the `components` mapping identity, so only use
  // the cache for the default components (the only mapping any caller passes in practice). Custom
  // components bypass the cache to stay correct.
  const cacheable = components === mdxComponents;
  const key = `${format}\0${source}`;
  if (cacheable) { const hit = cache.get(key); if (hit !== undefined) return hit; }
  let html: string;
  if (format === "md") {
    html = await renderCommonmark(source); // sparkdown-gfm + shiki; components are irrelevant in CommonMark
  } else {
    const highlighter = await getHighlighter();
    const mod = await evaluate(source, {
      ...(runtime as Record<string, unknown>),
      format,
      remarkPlugins: [remarkGfm],
      rehypePlugins: [[rehypeShikiFromHighlighter, highlighter, {
        themes: { light: "github-light", dark: "github-dark-default" },
        // defaultColor: false → emit CSS vars (--shiki-light / --shiki-dark) instead of inline
        // style on every span. The preset.css switches between them via [data-theme="dark"].
        defaultColor: false,
        addLanguageClass: true,
      }]],
    } as never);
    const Content = (mod as { default: (props: { components?: unknown }) => unknown }).default;
    html = renderToStaticMarkup(createElement(Content as never, { components }) as never);
  }
  if (cacheable) cache.set(key, html);
  return html;
}

/** A page whose MDX failed to compile (e.g. an unfenced `{…}` MDX reads as a JS expression, or a
 *  stray `<tag>`). It's left out of the map → the app falls back to plain-markdown HTML at runtime.
 *  The caller MUST surface these: a silently dropped page is the worst failure mode (no error, no
 *  filename — the author finds out in production). */
export type MdxFailure = { bucket: string; slug: string; error: string };

/** Compile every entry's MDX, bucketed (`default` + one per locale), COLLECTING per-page failures
 *  instead of throwing. Centralizes "render all, report what broke" so the render count and the
 *  loud per-page warning can't drift — and so the silent-drop regression is unit-testable. */
export async function renderMdxBuckets(
  buckets: { bucket: string; entries: { slug: string; body: string }[] }[],
  components: Record<string, unknown> = mdxComponents,
  format: "mdx" | "md" = "mdx",
): Promise<{ map: Record<string, Record<string, string>>; failures: MdxFailure[] }> {
  const map: Record<string, Record<string, string>> = {};
  const failures: MdxFailure[] = [];
  for (const { bucket, entries } of buckets) {
    map[bucket] ??= {};
    for (const e of entries) {
      try {
        map[bucket]![e.slug] = await mdxToHtml(e.body, components, format);
      } catch (err) {
        failures.push({ bucket, slug: e.slug, error: (err as Error).message });
      }
    }
  }
  return { map, failures };
}
