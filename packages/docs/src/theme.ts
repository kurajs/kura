// The default Kura docs theme, shipped as a string and injected by <DocsShell> so it
// works on every target (no CSS-pipeline dependency, Workers-safe). Override via your
// own app/global.css cascading after it.
//
// Dark mode: all surfaces are CSS variables; `[data-theme="dark"]` reassigns them. The
// resolved theme is set on <html data-theme> BEFORE first paint by THEME_INIT_JS (ui.tsx),
// so there's no flash. Default follows the OS (prefers-color-scheme) via the "system" pref.
export const themeCss = `
:root {
  --bg: #ffffff; --fg: #1a1a1a; --fg-soft: #444; --muted: #6b7280; --border: #e7e7ea;
  --accent: #4f46e5; --accent-soft: #eef2ff; --code-bg: #f6f8fa;
  --surface: #ffffff; --surface-2: #fafafa; --hover: #f4f4f5; --topbar-bg: rgba(255,255,255,.85);
  --callout-tip-bg: #f0fdf4; --callout-warn-bg: #fffbeb; --callout-danger-bg: #fef2f2;
  --warn-bg: #fffbeb; --warn-border: #fde68a; --warn-fg: #92400e;
  --sidebar-w: 248px; --toc-w: 220px;
  font-family: system-ui, -apple-system, "Noto Sans TC", "PingFang TC", sans-serif;
}
[data-theme="dark"] {
  --bg: #0b0d12; --fg: #e6edf3; --fg-soft: #c9d1d9; --muted: #8b949e; --border: #21262d;
  --accent: #818cf8; --accent-soft: #1e1b4b; --code-bg: #161b22;
  --surface: #161b22; --surface-2: #11151b; --hover: #1c2128; --topbar-bg: rgba(13,17,23,.85);
  --callout-tip-bg: #0f2a1a; --callout-warn-bg: #2a230f; --callout-danger-bg: #2a1518;
  --warn-bg: #2a230f; --warn-border: #5a4a1e; --warn-fg: #fcd34d;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--fg); }
a { color: inherit; text-decoration: none; }
.topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 1rem; height: 56px; padding: 0 1.25rem; background: var(--topbar-bg); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
.brand { font-weight: 700; font-size: 1.05rem; display: flex; align-items: center; gap: .4rem; }
.brand .sub { font-weight: 400; color: var(--muted); font-size: .85rem; }
.topbar form { margin-left: auto; }
.search-box { width: 280px; max-width: 40vw; padding: .45rem .7rem; font-size: .9rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); color: var(--fg); }
.topbar .links { display: flex; align-items: center; gap: 1rem; color: var(--muted); font-size: .9rem; }
.theme-toggle { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; font-size: .95rem; line-height: 1; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--fg); cursor: pointer; }
.theme-toggle:hover { background: var(--hover); }
.locale-switch { display: inline-flex; align-items: center; gap: .1rem; padding: .1rem; border: 1px solid var(--border); border-radius: 8px; }
.locale-switch .locale { padding: .2rem .55rem; border-radius: 6px; color: var(--muted); font-size: .82rem; }
.locale-switch .locale:hover { color: var(--fg); }
.locale-switch .locale.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.shell { display: grid; grid-template-columns: var(--sidebar-w) minmax(0,1fr) var(--toc-w); align-items: start; max-width: 1280px; margin: 0 auto; }
@media (max-width: 1024px) { .shell { grid-template-columns: var(--sidebar-w) minmax(0,1fr); } .toc { display: none; } }
@media (max-width: 720px) { .shell { grid-template-columns: 1fr; } .sidebar { display: none; } }
.sidebar { position: sticky; top: 56px; height: calc(100vh - 56px); overflow-y: auto; padding: 1.5rem 1rem; border-right: 1px solid var(--border); }
.sidebar .group { margin-bottom: 1.25rem; }
.sidebar .group-title { font-size: .72rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); margin: 0 0 .5rem .5rem; }
.sidebar a.item { display: block; padding: .35rem .55rem; border-radius: 7px; color: var(--fg-soft); font-size: .92rem; }
.sidebar a.item:hover { background: var(--hover); }
.sidebar a.item.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.content { padding: 2rem 2.5rem 5rem; min-width: 0; }
.breadcrumb { color: var(--muted); font-size: .82rem; margin-bottom: 1rem; }
.not-translated { margin: 0 0 1.2rem; padding: .6rem .85rem; font-size: .85rem; border: 1px solid var(--warn-border); border-left: 3px solid #d97706; border-radius: 0 8px 8px 0; background: var(--warn-bg); color: var(--warn-fg); }
.page-actions { display: flex; gap: .5rem; flex-wrap: wrap; margin: 0 0 1.5rem; }
.btn { display: inline-flex; align-items: center; gap: .35rem; padding: .35rem .7rem; font-size: .82rem; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--fg-soft); cursor: pointer; }
.btn:hover { background: var(--hover); }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.prose { line-height: 1.7; font-size: 1rem; }
.prose h1 { font-size: 1.9rem; margin: 0 0 .5rem; }
.prose h2 { font-size: 1.35rem; margin: 2.2rem 0 .8rem; padding-top: .4rem; scroll-margin-top: 72px; }
.prose h3 { font-size: 1.1rem; margin: 1.6rem 0 .6rem; scroll-margin-top: 72px; }
.prose p { margin: .8rem 0; }
.prose ul, .prose ol { padding-left: 1.4rem; }
.prose li { margin: .3rem 0; }
.prose a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.prose blockquote { margin: 1.2rem 0; padding: .7rem 1rem; border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 8px 8px 0; color: var(--fg); }
.prose code { background: var(--code-bg); padding: .12em .35em; border-radius: 5px; font-size: .88em; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.prose pre { position: relative; background: #0d1117; color: #e6edf3; padding: 1rem 1.1rem; border-radius: 10px; overflow-x: auto; margin: 1.2rem 0; }
.prose pre code { background: none; padding: 0; font-size: .85rem; color: inherit; }
.prose table { border-collapse: collapse; width: 100%; margin: 1.2rem 0; font-size: .92rem; }
.prose th, .prose td { border: 1px solid var(--border); padding: .5rem .7rem; text-align: left; }
.prose th { background: var(--surface-2); }
.copy-code { position: absolute; top: .5rem; right: .5rem; padding: .2rem .5rem; font-size: .72rem; border: 1px solid #30363d; border-radius: 6px; background: #161b22; color: #c9d1d9; cursor: pointer; opacity: 0; transition: opacity .15s; }
.prose pre:hover .copy-code { opacity: 1; }
.pager { display: flex; justify-content: space-between; gap: 1rem; margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
.pager a { flex: 1; padding: .9rem 1rem; border: 1px solid var(--border); border-radius: 10px; }
.pager a:hover { border-color: var(--accent); }
.pager .dir { color: var(--muted); font-size: .78rem; }
.pager .ttl { font-weight: 600; color: var(--accent); }
.pager .next { text-align: right; }
.toc { position: sticky; top: 56px; max-height: calc(100vh - 56px); overflow-y: auto; padding: 2rem 1rem; }
.toc .toc-title { font-size: .72rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); margin-bottom: .6rem; }
.toc a { display: block; padding: .2rem 0; color: var(--muted); font-size: .85rem; }
.toc a:hover { color: var(--accent); }
.toc a.lvl-3 { padding-left: .8rem; font-size: .82rem; }
.results { max-width: 760px; margin: 2rem auto; padding: 0 1.5rem; }
.result { border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.1rem; margin-bottom: .9rem; display: block; }
.result:hover { border-color: var(--accent); }
.result .meta { display: flex; justify-content: space-between; color: var(--muted); font-size: .8rem; }
/* MDX curated components */
.callout { margin: 1.2rem 0; padding: .8rem 1rem; border: 1px solid var(--border); border-left-width: 3px; border-radius: 0 8px 8px 0; background: var(--surface-2); }
.callout-title { margin: 0 0 .3rem; font-weight: 700; font-size: .9rem; }
.callout-body > :first-child { margin-top: 0; }
.callout-body > :last-child { margin-bottom: 0; }
.callout-note { border-left-color: #4f46e5; background: var(--accent-soft); }
.callout-tip { border-left-color: #16a34a; background: var(--callout-tip-bg); }
.callout-warning { border-left-color: #d97706; background: var(--callout-warn-bg); }
.callout-danger { border-left-color: #dc2626; background: var(--callout-danger-bg); }
.card { display: block; margin: 1rem 0; padding: 1rem 1.1rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
a.card:hover { border-color: var(--accent); }
.card-title { margin: 0 0 .3rem; font-weight: 700; }
.steps { counter-reset: step; border-left: 2px solid var(--border); margin-left: .5rem; padding-left: 1.5rem; }
.steps > * { position: relative; }
.tabs { margin: 1.2rem 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.tab-list { display: flex; gap: .25rem; padding: .35rem .35rem 0; background: var(--surface-2); border-bottom: 1px solid var(--border); }
.tab-btn { padding: .45rem .8rem; font-size: .88rem; border: none; background: none; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; }
.tab-btn:hover { color: var(--fg); }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.tab-panel { padding: 1rem 1.1rem; }
.tab-panel > :first-child { margin-top: 0; }
.tab-panel > :last-child { margin-bottom: 0; }
`;
