// Presentational docs UI (en-US). Plain-prop components — no June/app imports — so they stay portable
// and overridable. The app maps its nav/content into these props.
//
// Styling: Tailwind utilities (June ships Tailwind built-in; the app imports "@kurajs/docs/css", which
// scans this file's compiled output and supplies the design tokens — bg/fg/accent/… follow the dark
// var swap automatically). The few things utilities can't express cleanly — pseudo-element chevrons,
// the typography plugin's .prose, JS-toggled state, the mobile drawer — live in that preset's small
// component block. Hook classes that the preset/scripts target: `folder`/`folder-title`, `chevron`,
// `no-scrollbar`, `nav-bar-context`, `drawer-backdrop`, `copy-code`, `has-tabs`, `prose`, `tab-*`.
import type { ReactNode } from "react";
import { docPath, type Toc } from "./nav.ts";
import { DEFAULT_LABELS, type Labels } from "./labels.ts";

export type SiteInfo = { name?: string; brand?: string };
/** A sidebar entry: a doc link, or a collapsible folder group (`items`). A group may also carry a
 *  `slug` — its index page (folder-as-page): the header links there AND toggles the children. */
export type SidebarNode = { slug: string; title: string } | { title: string; items: SidebarNode[]; slug?: string };
export type SidebarGroup = { title: string; items: SidebarNode[] };

/** Does a subtree contain (or itself link to) the active page? (Folders auto-open when they do.) */
function hasActive(items: SidebarNode[], active?: string): boolean {
  return items.some((n) => ("items" in n ? n.slug === active || hasActive(n.items, active) : n.slug === active));
}

// One sidebar row (leaf link or folder summary): 36px tall (24px line + 6px×2), rounded, small text.
// Color/state is applied per-row (active vs idle) so there's no later-wins specificity fight.
const ROW = "flex items-center gap-1.5 leading-6 px-2 py-1.5 rounded-md text-sm";

/** Recursive sidebar rendering as a real list (semantics + a11y): each item is an <li>; a doc → link,
 *  a folder → <details> whose children are a nested <ul>. A folder with an index renders its title as
 *  a link (clicking navigates to the folder's page); the chevron still toggles. The `folder`/
 *  `folder-title` classes are the component-CSS hooks (chevron ::after + marker hide live in preset). */
function SidebarItems({ items, active, href, basePath, nested = false }: { items: SidebarNode[]; active?: string; href: Href; basePath: string; nested?: boolean }) {
  return (
    <ul className={"flex flex-col gap-px" + (nested ? " mt-px ml-2 pl-2.5 border-l border-border" : "")}>
      {items.map((n) =>
        "items" in n ? (
          <li key={n.title}>
            <details className="folder" open={n.slug === active || hasActive(n.items, active)}>
              <summary className={`${ROW} folder-title text-fg-soft cursor-pointer hover:bg-hover`}>
                {/* Active state is driven by aria-current (CSS), so it works in the persistent
                    segment shell where the layout doesn't know the current page — the client sync
                    sets it after each soft-nav (and the server sets it here on a full load). */}
                {n.slug ? (
                  <a className="flex-1 min-w-0 text-inherit" aria-current={n.slug === active ? "page" : undefined} href={href(docPath(basePath, n.slug))}>{n.title}</a>
                ) : (
                  <span className="flex-1 min-w-0">{n.title}</span>
                )}
              </summary>
              <SidebarItems items={n.items} active={active} href={href} basePath={basePath} nested />
            </details>
          </li>
        ) : (
          <li key={n.slug}>
            <a className={`${ROW} text-fg-soft hover:bg-hover`} aria-current={n.slug === active ? "page" : undefined} href={href(docPath(basePath, n.slug))}>
              {n.title}
            </a>
          </li>
        ),
      )}
    </ul>
  );
}
/** Localizes an internal route path to the active locale (identity when i18n is off). */
export type Href = (path: string) => string;
/** One entry in the language switcher: this page's URL in another locale. */
export type LocaleLink = { locale: string; name: string; href: string; active: boolean };
/** One tab in the top tab bar: a group of sections; `href` points at the tab's first page. */
export type TabLink = { title: string; href: string; active: boolean };
export type DocView = {
  slug: string;
  title: string;
  section: string;
  /** Per-page description from frontmatter (`description:` field), used for meta description + OG. */
  description?: string;
  html: string;
  toc: Toc;
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  /** True when this locale has no variant for the page and the default language is shown. */
  notTranslated?: boolean;
};
export type SearchHit = { slug: string; title: string; section: string; text: string; score: number };

// Compact inline icons (lucide-style, currentColor). `className` lets a call site tune size/color
// (e.g. the page-action menu rows want a muted, top-aligned glyph).
const IconCopy = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
const IconFile = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M16 21H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l4 4v12a2 2 0 0 1-2 2z" /><path d="M9 13h6M9 17h4" /></svg>
);
const IconChat = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></svg>
);
const IconExternal = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
);

/** The 3-column chrome: top bar · sidebar · content · ToC. */
export function DocsShell({ site, sidebar, tabs, active, toc, basePath = "/docs", pageTitle, labels = DEFAULT_LABELS, href = (p) => p, localeSwitch, children }: {
  site?: SiteInfo;
  sidebar: SidebarGroup[];
  tabs?: TabLink[];
  active?: string;
  toc?: Toc;
  basePath?: string;
  /** Current page title — shown as context on the mobile "Navigation" bar (Tab / page). */
  pageTitle?: string;
  labels?: Labels;
  href?: Href;
  localeSwitch?: LocaleLink[];
  children: ReactNode;
}) {
  const brand = site?.brand ?? site?.name ?? "Kura";
  const currentLang = localeSwitch?.find((l) => l.active) ?? localeSwitch?.[0];
  const activeTab = tabs?.find((t) => t.active);
  const navContext = [activeTab?.title, pageTitle].filter(Boolean).join(" / ");
  const hasTabs = !!(tabs && tabs.length > 0);
  // With a tab bar, the sticky sidebar/ToC start below topbar(56) + tabbar(44); otherwise below the
  // topbar only. (≤768 the sidebar is a fixed drawer — the preset overrides these.)
  const stickyTop = hasTabs ? "top-[100px] h-[calc(100vh-100px)]" : "top-14 h-[calc(100vh-56px)]";
  const tocTop = hasTabs ? "top-[100px] max-h-[calc(100vh-100px)]" : "top-14 max-h-[calc(100vh-56px)]";
  return (
    <>
      {/* Resolve + apply the theme on <html> BEFORE first paint — no flash. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_JS }} />
      <header className="sticky top-0 z-20 flex items-center gap-4 h-14 px-5 bg-topbar-bg backdrop-blur-sm border-b border-border max-md:px-4 max-md:gap-2.5">
        <a className="flex items-center gap-1.5 font-bold text-[1.05rem]" href={href("/")}>{brand} <span className="font-normal text-muted text-[.85rem]">Docs</span></a>
        <form className="ml-auto max-md:ml-2 max-md:flex-1 max-md:min-w-0" method="get" action={href("/search")}>
          {/* Real, submittable field for the no-JS floor; @kurajs/docs/client upgrades it into the
              ⌘K palette (reading the data-* below for the JSON endpoint + locale-resolved doc base). */}
          <input className="w-[280px] max-w-[40vw] px-3 py-2 text-[.9rem] border border-border rounded-lg bg-surface-2 text-fg max-md:w-full max-md:max-w-none search-box" name="q" placeholder={labels.searchPlaceholder} aria-label={labels.search} data-search-endpoint={`${href("/search")}.json`} data-doc-base={href(docPath(basePath, ""))} />
        </form>
        <nav className="flex items-center gap-4 text-muted text-[.9rem]">
          {localeSwitch && localeSwitch.length > 1 && currentLang && (
            <details className="relative" data-menu>
              <summary className="chevron cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 border border-border rounded-lg text-fg-soft text-[.85rem] whitespace-nowrap hover:text-fg">{currentLang.name}</summary>
              <div className="absolute right-0 top-[calc(100%+.4rem)] min-w-36 flex flex-col gap-px p-1.5 bg-surface border border-border rounded-xl shadow-xl z-30">
                {localeSwitch.map((l) => (
                  <a key={l.locale} className={"px-2 py-1.5 rounded-md text-[.85rem] whitespace-nowrap " + (l.active ? "text-accent font-semibold" : "text-fg-soft hover:bg-hover hover:text-fg")} href={l.href} hrefLang={l.locale}>{l.name}</a>
                ))}
              </div>
            </details>
          )}
        </nav>
      </header>
      {hasTabs && (
        <nav className="sticky top-14 z-[15] h-11 bg-bg border-b border-border max-md:hidden">
          <div className="flex items-stretch gap-6 h-full max-w-[1280px] mx-auto px-5 overflow-x-auto no-scrollbar">
            {tabs!.map((t) => (
              <a key={t.title} className={"flex items-center text-[.9rem] border-b-2 whitespace-nowrap " + (t.active ? "text-fg border-accent" : "text-muted border-transparent hover:text-fg")} href={t.href}>{t.title}</a>
            ))}
          </div>
        </nav>
      )}
      {/* Mobile-only: a labeled bar (shows where you are) that opens the nav drawer. */}
      <button className="hidden max-md:flex items-center gap-2.5 w-full px-4 py-2.5 bg-bg border-0 border-b border-border text-fg-soft text-[.9rem] text-left cursor-pointer focus-visible:outline-none focus-visible:bg-hover" data-drawer-open aria-controls="docs-nav" aria-expanded="false">
        <span className="text-[1.05rem] leading-none" aria-hidden="true">☰</span>
        <span className="font-semibold text-fg flex-none">{labels.navigation}</span>
        {navContext && <span className="nav-bar-context text-muted flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{navContext}</span>}
      </button>
      <div className="drawer-backdrop" data-drawer-close aria-hidden="true" />
      <div className={`grid grid-cols-[248px_minmax(0,1fr)_220px] max-lg:grid-cols-[248px_minmax(0,1fr)] max-md:grid-cols-1 items-start max-w-[1280px] mx-auto${hasTabs ? " has-tabs" : ""}`}>
        <aside className={`sidebar sticky ${stickyTop} overflow-y-auto px-4 py-6 border-r border-border`} id="docs-nav">
          {/* Mobile-only: tab switcher folded into the drawer (the desktop tab bar is hidden ≤768). */}
          {hasTabs && (
            <div className="hidden max-md:flex flex-wrap gap-1.5 mb-4 pb-4 border-b border-border">
              {tabs!.map((t) => (
                <a key={t.title} className={"px-3 py-1 border rounded-full text-[.85rem] " + (t.active ? "bg-accent-soft text-accent border-transparent" : "text-fg-soft border-border")} href={t.href}>{t.title}</a>
              ))}
            </div>
          )}
          {sidebar.map((s, i) => (
            <div className="mb-5" key={s.title || `g${i}`}>
              {s.title && <p className="mb-1.5 ml-2 text-sm font-semibold text-fg">{s.title}</p>}
              <SidebarItems items={s.items} active={active} href={href} basePath={basePath} />
            </div>
          ))}
        </aside>
        <main className="w-auto max-w-none m-0 min-w-0 px-10 pt-8 pb-20 max-md:px-4 max-md:pt-5 max-md:pb-12">
          {/* Mobile/tablet-only: the side ToC is hidden ≤1024, so offer a collapsible "On this page". */}
          {toc && toc.length > 0 && (
            <details className="hidden max-lg:block mb-5 border border-border rounded-xl overflow-hidden">
              <summary className="chevron flex justify-between items-center cursor-pointer px-3.5 py-2.5 text-[.85rem] font-semibold text-fg-soft">{labels.onThisPage}</summary>
              <div className="flex flex-col px-3.5 pt-1 pb-2.5 border-t border-border">
                {toc.map((h) => (
                  <a key={h.id} className={"py-1.5 text-muted text-[.85rem] hover:text-accent" + (h.level === 3 ? " pl-3.5" : "")} href={`#${encodeURIComponent(h.id)}`}>{h.text}</a>
                ))}
              </div>
            </details>
          )}
          {children}
        </main>
        <aside className={`sticky ${tocTop} overflow-y-auto px-4 py-8 max-lg:hidden`}>
          {toc && toc.length > 0 && (
            <>
              <p className="text-[.72rem] font-bold tracking-wider uppercase text-muted mb-2.5">{labels.onThisPage}</p>
              {toc.map((h) => (
                <a key={h.id} className={"block py-1 text-muted text-[.85rem] hover:text-accent" + (h.level === 3 ? " pl-3 text-[.82rem]" : "")} href={`#${encodeURIComponent(h.id)}`}>{h.text}</a>
              ))}
            </>
          )}
        </aside>
      </div>
      <footer className="border-t border-border mt-8">
        <div className="flex items-center justify-between flex-wrap gap-4 max-w-[1280px] mx-auto px-6 py-5 max-md:px-4">
          <nav className="flex items-center gap-[1.1rem] text-[.85rem]">
            {/* Agent surface + theme toggle — secondary controls, out of the topbar. */}
            <a className="text-muted hover:text-fg" href="/llms.txt">llms.txt</a>
            <a className="text-muted hover:text-fg" href="/mcp">MCP</a>
            <button type="button" className="inline-flex items-center justify-center w-[30px] h-[30px] p-0 text-[.95rem] leading-none border border-border rounded-lg bg-surface text-fg cursor-pointer hover:bg-hover" data-theme-toggle aria-label="Toggle theme" />
          </nav>
          <a className="text-muted text-[.85rem] hover:text-accent" href="https://kura.build/" target="_blank" rel="noreferrer">Powered by Kura</a>
        </div>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: FOCUS_JS + THEME_TOGGLE_JS + MENU_JS + DRAWER_JS }} />
    </>
  );
}

/** A full doc page: breadcrumb · page actions (copy md / open in LLM) · prose · pager. */
export function DocsPage({ site, sidebar, tabs, doc, basePath = "/docs", labels = DEFAULT_LABELS, href = (p) => p, localeSwitch, mermaidCdn }: { site?: SiteInfo; sidebar: SidebarGroup[]; tabs?: TabLink[]; doc: DocView; basePath?: string; labels?: Labels; href?: Href; localeSwitch?: LocaleLink[]; mermaidCdn?: string }) {
  const md = href(docPath(basePath, `${doc.slug}.md`));
  const prompt = encodeURIComponent(`Please read this doc and answer my questions: ${doc.title}`);
  const menuItem = "flex items-start gap-2.5 w-full px-2.5 py-2 rounded-lg bg-transparent border-0 text-fg-soft text-left cursor-pointer hover:bg-hover";
  // Title row (Mintlify-style): lift the page's leading <h1> out of the article into a header row so
  // the copy/actions split button sits to its right; strip it from the body to avoid a duplicate.
  // Use the content heading's own markup (falls back to the frontmatter title) so it never diverges.
  const h1 = doc.html.match(/^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i);
  const headingHtml = h1 ? h1[1] : doc.title;
  const bodyHtml = h1 ? doc.html.slice(h1[0].length) : doc.html;
  return (
    <DocsShell site={site} sidebar={sidebar} tabs={tabs} active={doc.slug} toc={doc.toc} basePath={basePath} pageTitle={doc.title} labels={labels} href={href} localeSwitch={localeSwitch}>
      {doc.section && <div className="text-muted text-[.82rem] mb-2">{doc.section}</div>}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="prose"><h1 className="!m-0" dangerouslySetInnerHTML={{ __html: headingHtml }} /></div>
        {/* Split button (Mintlify-style): primary "Copy" + a chevron that opens the actions menu. */}
        <div className="relative inline-flex items-stretch flex-none">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[.85rem] border border-border border-r-0 rounded-l-lg bg-surface text-fg-soft cursor-pointer hover:bg-hover hover:text-fg" data-copy-md={md}><IconCopy />{labels.copyMarkdown}</button>
          <details className="relative inline-flex items-stretch" data-menu>
            <summary className="chevron inline-flex items-center justify-center w-[30px] border border-border rounded-r-lg bg-surface text-muted cursor-pointer hover:bg-hover hover:text-fg" aria-label="More actions" />
            <div className="absolute right-0 top-[calc(100%+.4rem)] z-30 min-w-[17rem] flex flex-col gap-px p-1.5 bg-surface border border-border rounded-xl shadow-xl">
              <button className={menuItem} data-copy-md={md}>
                <IconCopy className="flex-none mt-0.5 text-muted" />
                <span className="flex flex-col min-w-0"><span className="font-semibold text-[.9rem] text-fg">{labels.copyMarkdown}</span><span className="text-[.8rem] text-muted">{labels.copyMarkdownHint}</span></span>
              </button>
              <a className={menuItem} href={md}>
                <IconFile className="flex-none mt-0.5 text-muted" />
                <span className="flex flex-col min-w-0"><span className="inline-flex items-center gap-1 font-semibold text-[.9rem] text-fg">{labels.viewMarkdown} <IconExternal className="text-muted" /></span><span className="text-[.8rem] text-muted">{labels.viewMarkdownHint}</span></span>
              </a>
              <a className={menuItem} href={`https://chatgpt.com/?q=${prompt}`} target="_blank" rel="noreferrer">
                <IconChat className="flex-none mt-0.5 text-muted" />
                <span className="flex flex-col min-w-0"><span className="inline-flex items-center gap-1 font-semibold text-[.9rem] text-fg">{labels.openInChatGPT} <IconExternal className="text-muted" /></span><span className="text-[.8rem] text-muted">{labels.openInChatGPTHint}</span></span>
              </a>
              <a className={menuItem} href={`https://claude.ai/new?q=${prompt}`} target="_blank" rel="noreferrer">
                <IconChat className="flex-none mt-0.5 text-muted" />
                <span className="flex flex-col min-w-0"><span className="inline-flex items-center gap-1 font-semibold text-[.9rem] text-fg">{labels.openInClaude} <IconExternal className="text-muted" /></span><span className="text-[.8rem] text-muted">{labels.openInClaudeHint}</span></span>
              </a>
            </div>
          </details>
        </div>
      </div>
      {doc.notTranslated && <div className="mb-5 px-3.5 py-2.5 text-[.85rem] border border-warn-border border-l-[3px] border-l-amber-600 rounded-r-lg bg-warn-bg text-warn-fg">{labels.notTranslated}</div>}
      <article className="prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <nav className="flex justify-between gap-4 mt-12 pt-6 border-t border-border">
        {doc.prev ? <a className="flex-1 px-4 py-3.5 border border-border rounded-xl hover:border-accent" href={href(docPath(basePath, doc.prev.slug))}><div className="text-muted text-[.78rem]">← {labels.previous}</div><div className="font-semibold text-accent">{doc.prev.title}</div></a> : <span />}
        {doc.next ? <a className="flex-1 px-4 py-3.5 border border-border rounded-xl hover:border-accent text-right" href={href(docPath(basePath, doc.next.slug))}><div className="text-muted text-[.78rem]">{labels.next} →</div><div className="font-semibold text-accent">{doc.next.title}</div></a> : <span />}
      </nav>
      <script dangerouslySetInnerHTML={{ __html: COPY_JS + CODE_JS + TABS_JS + mermaidJs(mermaidCdn ?? MERMAID_CDN) }} />
    </DocsShell>
  );
}

/** Search results list (used inside a DocsShell). */
export function SearchResults({ query, hits, basePath = "/docs", labels = DEFAULT_LABELS, href = (p) => p }: { query: string; hits: SearchHit[]; basePath?: string; labels?: Labels; href?: Href }) {
  return (
    <div className="max-w-[760px] mx-auto my-8 px-6">
      <h1 className="text-[1.4rem] font-display">{query ? `${labels.search}: “${query}”` : labels.search}</h1>
      {query && hits.length === 0 && <p className="text-muted">{labels.noResults}</p>}
      {hits.map((h, i) => (
        <a key={i} className="block border border-border rounded-xl px-4 py-4 mb-3.5 hover:border-accent" href={href(docPath(basePath, h.slug))}>
          <div className="flex justify-between text-muted text-[.8rem]"><span>{h.section} · {h.title}</span><span>score {h.score}</span></div>
          <p className="mt-1 text-fg-soft">{h.text.slice(0, 140)}…</p>
        </a>
      ))}
    </div>
  );
}

// --- Persistent-shell (segment morph) variant ---------------------------------------------------
// One tab's worth of nav: its tab-bar entry + the sidebar groups shown when it's active.
export type NavTab = { key: string; title: string; href: string; groups: SidebarGroup[] };

// Runs once with the persistent shell, then re-syncs after every soft-nav (the outlet's content
// swap). The layout can't know the current page, so the client derives active state from the URL:
// aria-current on the matching sidebar/tab link, the active tab's groups shown (others hidden),
// and the <details> folder containing the active page expanded. Survives morph (delegated/observed).
const SIDEBAR_SYNC_JS = `(function(){
  function trim(p){return p.length>1&&p.endsWith('/')?p.slice(0,-1):p;}
  function sync(){
    var path=trim(location.pathname), tab=null;
    var links=document.querySelectorAll('.sidebar a[href],[data-tabbar] a[href]');
    for(var i=0;i<links.length;i++){var a=links[i],on=trim(a.getAttribute('href'))===path;
      if(on){a.setAttribute('aria-current','page');var g=a.closest('[data-tab]');if(g)tab=g.getAttribute('data-tab');}
      else a.removeAttribute('aria-current');}
    if(tab!=null){
      document.querySelectorAll('[data-tab]').forEach(function(g){g.hidden=g.getAttribute('data-tab')!==tab;});
      document.querySelectorAll('[data-tabbar] a').forEach(function(a){
        if(a.getAttribute('data-tab-key')===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    }
    // expand the folder holding the active page (auto-expand on nav into a closed folder)
    var cur=document.querySelector('.sidebar a[aria-current="page"]');
    if(cur){var d=cur.closest('details.folder');while(d){d.open=true;d=d.parentElement&&d.parentElement.closest('details.folder');}}
    // rewrite the locale-switch links to THIS page's equivalent path (swap the locale prefix)
    var ll=document.querySelectorAll('[data-locale-home]');
    if(ll.length){var lc=document.querySelector('[data-locale-home][data-locale-active]'),cp=lc?lc.getAttribute('data-locale-home'):'/';cp=cp==='/'?'':cp;
      var rest=location.pathname;if(cp&&rest.indexOf(cp)===0)rest=rest.slice(cp.length)||'/';
      ll.forEach(function(a){var h=a.getAttribute('data-locale-home'),p=h==='/'?'':h;a.setAttribute('href',rest==='/'?(p||'/'):(p+rest));});}
    // mobile nav-context: "Active tab / Page title" (the shell can't know the page server-side)
    var nc=document.querySelector('[data-nav-context]');
    if(nc){var at=document.querySelector('[data-tabbar] a[aria-current="page"]'),h1=document.querySelector('main h1');
      nc.textContent=[at&&at.textContent.trim(),h1&&h1.textContent.trim()].filter(Boolean).join(' / ');}
  }
  sync();
  var outlet=document.querySelector('[data-june-outlet]');
  if(outlet) new MutationObserver(sync).observe(outlet,{childList:true,subtree:true});
})();`;

/** The PERSISTENT docs shell (a segment-boundary layout): topbar + tab bar + full sidebar (all tabs'
 *  groups, client-filtered to the active tab) + footer. The page content goes in `children` (wrapped
 *  by <JuneOutlet> upstream). Active page/tab state is client-driven (aria-current), so the shell is
 *  never re-rendered on navigation — only the outlet content swaps. */
export function DocsLayoutShell({ site, navTabs, basePath = "/docs", labels = DEFAULT_LABELS, href = (p) => p, localeSwitch, children }: {
  site?: SiteInfo; navTabs: NavTab[]; basePath?: string; labels?: Labels; href?: Href; localeSwitch?: LocaleLink[]; children: ReactNode;
}) {
  const brand = site?.brand ?? site?.name ?? "Kura";
  const currentLang = localeSwitch?.find((l) => l.active) ?? localeSwitch?.[0];
  const hasTabs = navTabs.length > 1;
  const stickyTop = hasTabs ? "top-[100px] h-[calc(100vh-100px)]" : "top-14 h-[calc(100vh-56px)]";
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_JS }} />
      <header className="sticky top-0 z-20 flex items-center gap-4 h-14 px-5 bg-topbar-bg backdrop-blur-sm border-b border-border max-md:px-4 max-md:gap-2.5">
        <a className="flex items-center gap-1.5 font-bold text-[1.05rem]" href={href("/")}>{brand} <span className="font-normal text-muted text-[.85rem]">Docs</span></a>
        <form className="ml-auto max-md:ml-2 max-md:flex-1 max-md:min-w-0" method="get" action={href("/search")}>
          <input className="w-[280px] max-w-[40vw] px-3 py-2 text-[.9rem] border border-border rounded-lg bg-surface-2 text-fg max-md:w-full max-md:max-w-none search-box" name="q" placeholder={labels.searchPlaceholder} aria-label={labels.search} data-search-endpoint={`${href("/search")}.json`} data-doc-base={href(docPath(basePath, ""))} />
        </form>
        <nav className="flex items-center gap-4 text-muted text-[.9rem]">
          {localeSwitch && localeSwitch.length > 1 && currentLang && (
            <details className="relative" data-menu>
              <summary className="chevron cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 border border-border rounded-lg text-fg-soft text-[.85rem] whitespace-nowrap hover:text-fg">{currentLang.name}</summary>
              <div className="absolute right-0 top-[calc(100%+.4rem)] min-w-36 flex flex-col gap-px p-1.5 bg-surface border border-border rounded-xl shadow-xl z-30">
                {/* Locale switch crosses shells (different-locale sidebar) but shares one layout file
                    (one shell key), so a soft-nav would wrongly keep this locale's sidebar — opt out
                    of the router to force a full load. */}
                {/* href is the locale's home (the layout can't know the page); the client rewrites
                    it to the CURRENT page's equivalent path per locale via data-locale-home. */}
                {localeSwitch.map((l) => (
                  <a key={l.locale} data-june-no-router data-locale-home={l.href} data-locale-active={l.active ? "" : undefined} className={"px-2 py-1.5 rounded-md text-[.85rem] whitespace-nowrap " + (l.active ? "text-accent font-semibold" : "text-fg-soft hover:bg-hover hover:text-fg")} href={l.href} hrefLang={l.locale}>{l.name}</a>
                ))}
              </div>
            </details>
          )}
        </nav>
      </header>
      {hasTabs && (
        <nav data-tabbar className="sticky top-14 z-[15] h-11 bg-bg border-b border-border max-md:hidden">
          <div className="flex items-stretch gap-6 h-full max-w-[1280px] mx-auto px-5 overflow-x-auto no-scrollbar">
            {navTabs.map((t) => (
              <a key={t.key} data-tab-key={t.key} className="flex items-center text-[.9rem] border-b-2 border-transparent text-muted hover:text-fg [&[aria-current=page]]:text-fg [&[aria-current=page]]:border-accent" href={t.href}>{t.title}</a>
            ))}
          </div>
        </nav>
      )}
      <button className="hidden max-md:flex items-center gap-2.5 w-full px-4 py-2.5 bg-bg border-0 border-b border-border text-fg-soft text-[.9rem] text-left cursor-pointer focus-visible:outline-none focus-visible:bg-hover" data-drawer-open aria-controls="docs-nav" aria-expanded="false">
        <span className="text-[1.05rem] leading-none" aria-hidden="true">☰</span>
        <span className="font-semibold text-fg flex-none">{labels.navigation}</span>
        {/* Filled by the sync script — the shell can't know the page; shows "Tab / Page". */}
        <span className="nav-bar-context text-muted flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" data-nav-context />
      </button>
      <div className="drawer-backdrop" data-drawer-close aria-hidden="true" />
      <div className={`grid grid-cols-[248px_minmax(0,1fr)_220px] max-lg:grid-cols-[248px_minmax(0,1fr)] max-md:grid-cols-1 items-start max-w-[1280px] mx-auto${hasTabs ? " has-tabs" : ""}`}>
        <aside className={`sidebar sticky ${stickyTop} overflow-y-auto px-4 py-6 border-r border-border`} id="docs-nav">
          {hasTabs && (
            <div data-tabbar className="hidden max-md:flex flex-wrap gap-1.5 mb-4 pb-4 border-b border-border">
              {navTabs.map((t) => (
                <a key={t.key} data-tab-key={t.key} className="px-3 py-1 border border-border rounded-full text-[.85rem] text-fg-soft [&[aria-current=page]]:bg-accent-soft [&[aria-current=page]]:text-accent [&[aria-current=page]]:border-transparent" href={t.href}>{t.title}</a>
              ))}
            </div>
          )}
          {/* Every tab's groups are rendered; the client shows only the active tab's (data-tab). */}
          {navTabs.map((t, ti) => (
            <div data-tab={t.key} hidden={navTabs.length > 1 && ti !== 0} key={t.key}>
              {t.groups.map((s, i) => (
                <div className="mb-5" key={s.title || `g${i}`}>
                  {s.title && <p className="mb-1.5 ml-2 text-sm font-semibold text-fg">{s.title}</p>}
                  <SidebarItems items={s.items} href={href} basePath={basePath} />
                </div>
              ))}
            </div>
          ))}
        </aside>
        {children}
      </div>
      <footer className="border-t border-border mt-8">
        <div className="flex items-center justify-between flex-wrap gap-4 max-w-[1280px] mx-auto px-6 py-5 max-md:px-4">
          <nav className="flex items-center gap-[1.1rem] text-[.85rem]">
            <a className="text-muted hover:text-fg" href="/llms.txt">llms.txt</a>
            <a className="text-muted hover:text-fg" href="/mcp">MCP</a>
            <button type="button" className="inline-flex items-center justify-center w-[30px] h-[30px] p-0 text-[.95rem] leading-none border border-border rounded-lg bg-surface text-fg cursor-pointer hover:bg-hover" data-theme-toggle aria-label="Toggle theme" />
          </nav>
          <a className="text-muted text-[.85rem] hover:text-accent" href="https://kura.build/" target="_blank" rel="noreferrer">Powered by Kura</a>
        </div>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: FOCUS_JS + THEME_TOGGLE_JS + MENU_JS + DRAWER_JS + SIDEBAR_SYNC_JS }} />
    </>
  );
}

/** The page content for the persistent-shell model — the morph-swapped region. Renders into the
 *  outlet (display:contents), so its <main> + ToC <aside> fill columns 2–3 of the shell grid. */
export function DocBody({ doc, basePath = "/docs", labels = DEFAULT_LABELS, href = (p) => p, mermaidCdn }: {
  doc: DocView; basePath?: string; labels?: Labels; href?: Href; mermaidCdn?: string;
}) {
  const md = href(docPath(basePath, `${doc.slug}.md`));
  const prompt = encodeURIComponent(`Please read this doc and answer my questions: ${doc.title}`);
  const menuItem = "flex items-start gap-2.5 w-full px-2.5 py-2 rounded-lg bg-transparent border-0 text-fg-soft text-left cursor-pointer hover:bg-hover";
  const h1 = doc.html.match(/^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i);
  const headingHtml = h1 ? h1[1] : doc.title;
  const bodyHtml = h1 ? doc.html.slice(h1[0].length) : doc.html;
  const toc = doc.toc;
  return (
    <>
      <main className="w-auto max-w-none m-0 min-w-0 px-10 pt-8 pb-20 max-md:px-4 max-md:pt-5 max-md:pb-12">
        {toc && toc.length > 0 && (
          <details className="hidden max-lg:block mb-5 border border-border rounded-xl overflow-hidden">
            <summary className="chevron flex justify-between items-center cursor-pointer px-3.5 py-2.5 text-[.85rem] font-semibold text-fg-soft">{labels.onThisPage}</summary>
            <div className="flex flex-col px-3.5 pt-1 pb-2.5 border-t border-border">
              {toc.map((h) => (<a key={h.id} className={"py-1.5 text-muted text-[.85rem] hover:text-accent" + (h.level === 3 ? " pl-3.5" : "")} href={`#${encodeURIComponent(h.id)}`}>{h.text}</a>))}
            </div>
          </details>
        )}
        {doc.section && <div className="text-muted text-[.82rem] mb-2">{doc.section}</div>}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="prose"><h1 className="!m-0" dangerouslySetInnerHTML={{ __html: headingHtml }} /></div>
          <div className="relative inline-flex items-stretch flex-none">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[.85rem] border border-border border-r-0 rounded-l-lg bg-surface text-fg-soft cursor-pointer hover:bg-hover hover:text-fg" data-copy-md={md}><IconCopy />{labels.copyMarkdown}</button>
            <details className="relative inline-flex items-stretch" data-menu>
              <summary className="chevron inline-flex items-center justify-center w-[30px] border border-border rounded-r-lg bg-surface text-muted cursor-pointer hover:bg-hover hover:text-fg" aria-label="More actions" />
              <div className="absolute right-0 top-[calc(100%+.4rem)] z-30 min-w-[17rem] flex flex-col gap-px p-1.5 bg-surface border border-border rounded-xl shadow-xl">
                <button className={menuItem} data-copy-md={md}><IconCopy className="flex-none mt-0.5 text-muted" /><span className="flex flex-col min-w-0"><span className="font-semibold text-[.9rem] text-fg">{labels.copyMarkdown}</span><span className="text-[.8rem] text-muted">{labels.copyMarkdownHint}</span></span></button>
                <a className={menuItem} href={md}><IconFile className="flex-none mt-0.5 text-muted" /><span className="flex flex-col min-w-0"><span className="inline-flex items-center gap-1 font-semibold text-[.9rem] text-fg">{labels.viewMarkdown} <IconExternal className="text-muted" /></span><span className="text-[.8rem] text-muted">{labels.viewMarkdownHint}</span></span></a>
                <a className={menuItem} href={`https://chatgpt.com/?q=${prompt}`} target="_blank" rel="noreferrer"><IconChat className="flex-none mt-0.5 text-muted" /><span className="flex flex-col min-w-0"><span className="inline-flex items-center gap-1 font-semibold text-[.9rem] text-fg">{labels.openInChatGPT} <IconExternal className="text-muted" /></span><span className="text-[.8rem] text-muted">{labels.openInChatGPTHint}</span></span></a>
                <a className={menuItem} href={`https://claude.ai/new?q=${prompt}`} target="_blank" rel="noreferrer"><IconChat className="flex-none mt-0.5 text-muted" /><span className="flex flex-col min-w-0"><span className="inline-flex items-center gap-1 font-semibold text-[.9rem] text-fg">{labels.openInClaude} <IconExternal className="text-muted" /></span><span className="text-[.8rem] text-muted">{labels.openInClaudeHint}</span></span></a>
              </div>
            </details>
          </div>
        </div>
        {doc.notTranslated && <div className="mb-5 px-3.5 py-2.5 text-[.85rem] border border-warn-border border-l-[3px] border-l-amber-600 rounded-r-lg bg-warn-bg text-warn-fg">{labels.notTranslated}</div>}
        <article className="prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        <nav className="flex justify-between gap-4 mt-12 pt-6 border-t border-border">
          {doc.prev ? <a className="flex-1 px-4 py-3.5 border border-border rounded-xl hover:border-accent" href={href(docPath(basePath, doc.prev.slug))}><div className="text-muted text-[.78rem]">← {labels.previous}</div><div className="font-semibold text-accent">{doc.prev.title}</div></a> : <span />}
          {doc.next ? <a className="flex-1 px-4 py-3.5 border border-border rounded-xl hover:border-accent text-right" href={href(docPath(basePath, doc.next.slug))}><div className="text-muted text-[.78rem]">{labels.next} →</div><div className="font-semibold text-accent">{doc.next.title}</div></a> : <span />}
        </nav>
        <script dangerouslySetInnerHTML={{ __html: COPY_JS + CODE_JS + TABS_JS + mermaidJs(mermaidCdn ?? MERMAID_CDN) }} />
      </main>
      <aside className="sticky top-14 max-h-[calc(100vh-56px)] overflow-y-auto px-4 py-8 max-lg:hidden">
        {toc && toc.length > 0 && (
          <>
            <p className="text-[.72rem] font-bold tracking-wider uppercase text-muted mb-2.5">{labels.onThisPage}</p>
            {toc.map((h) => (<a key={h.id} className={"block py-1 text-muted text-[.85rem] hover:text-accent" + (h.level === 3 ? " pl-3 text-[.82rem]" : "")} href={`#${encodeURIComponent(h.id)}`}>{h.text}</a>))}
          </>
        )}
      </aside>
    </>
  );
}

// Runs FIRST (before the stylesheet) to set <html data-theme> with no flash. Pref is one of
// system | light | dark; "system" follows prefers-color-scheme.
const THEME_INIT_JS = `(function(){try{var p=localStorage.getItem('kura-theme')||'system';var d=document.documentElement;d.setAttribute('data-theme-pref',p);d.setAttribute('data-theme',(p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme:dark)').matches))?'dark':'light');}catch(e){}})();`;
// The topbar toggle cycles system → light → dark, persists the pref, and tracks the OS while on system.
const THEME_TOGGLE_JS = `(function(){var b=document.querySelector('[data-theme-toggle]');if(!b)return;var d=document.documentElement,order=['system','light','dark'],icon={system:'🖥',light:'☀',dark:'☾'};function pref(){return d.getAttribute('data-theme-pref')||'system';}function res(p){return p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';}function set(p){d.setAttribute('data-theme-pref',p);d.setAttribute('data-theme',res(p));try{localStorage.setItem('kura-theme',p);}catch(e){}b.textContent=icon[p];b.setAttribute('title','Theme: '+p);}set(pref());b.addEventListener('click',function(){set(order[(order.indexOf(pref())+1)%order.length]);});try{matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){if(pref()==='system')d.setAttribute('data-theme',res('system'));});}catch(e){}})();`;
// "/" focuses the search box — the no-JS-module floor. Once @kurajs/docs/client enhances the
// box into the ⌘K palette it sets <html data-ctrlk>, and this hands "/" off to the palette
// (which binds "/" itself) instead of focusing the now-readonly trigger.
const FOCUS_JS = `document.addEventListener('keydown',function(e){if(e.key==='/' && !document.documentElement.dataset.ctrlk && !/INPUT|TEXTAREA/.test((document.activeElement||{}).tagName||'')){e.preventDefault();var s=document.querySelector('.search-box');if(s)s.focus();}});`;
// Dropdown menus (<details data-menu> — language switcher, page-actions): native open; close on
// outside-click / Escape, and after activating an item (a link, or the copy button — deferred so the
// copy handler runs first).
const MENU_JS = `document.addEventListener('click',function(e){var t=e.target;document.querySelectorAll('details[data-menu][open]').forEach(function(d){if(!d.contains(t))d.removeAttribute('open');});var it=t.closest&&t.closest('details[data-menu] a, details[data-menu] [data-copy-md]');if(it){var dd=it.closest('details[data-menu]');if(dd)setTimeout(function(){dd.removeAttribute('open');},0);}});document.addEventListener('keydown',function(e){if(e.key==='Escape')document.querySelectorAll('details[data-menu][open]').forEach(function(d){d.removeAttribute('open');});});`;
// Mobile nav drawer: the "Navigation" bar opens it; backdrop / a nav-link tap (incl. clientRouter
// soft-nav) / Escape close it; <html.drawer-open> drives the slide-in + body scroll-lock. While open,
// focus moves into the drawer and Tab is trapped inside it; closing returns focus to the opener.
const DRAWER_JS = `(function(){var root=document.documentElement;function opener(){return document.querySelector('[data-drawer-open]');}function items(){var d=document.getElementById('docs-nav');if(!d)return[];return[].filter.call(d.querySelectorAll('a[href],button:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'),function(el){return el.offsetParent!==null;});}function set(o){var was=root.classList.contains('drawer-open');root.classList.toggle('drawer-open',o);var b=opener();if(b)b.setAttribute('aria-expanded',o?'true':'false');if(o){var f=items();if(f[0])f[0].focus();}else if(was&&b)b.focus();}document.addEventListener('click',function(e){if(e.target.closest('[data-drawer-open]')){e.preventDefault();set(!root.classList.contains('drawer-open'));return;}if(e.target.closest('[data-drawer-close]')){set(false);return;}if(e.target.closest('#docs-nav a'))set(false);});document.addEventListener('keydown',function(e){if(e.key==='Escape'){set(false);return;}if(e.key==='Tab'&&root.classList.contains('drawer-open')){var f=items();if(!f.length)return;var first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}else if(f.indexOf(document.activeElement)<0){e.preventDefault();first.focus();}}});})();`;
const COPY_JS = `document.querySelectorAll('[data-copy-md]').forEach(function(b){b.addEventListener('click',async function(){try{var r=await fetch(b.getAttribute('data-copy-md'));var t=await r.text();await navigator.clipboard.writeText(t);var o=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=o;},1500);}catch(e){alert('Copy failed: '+e);}});});`;
const CODE_JS = `document.querySelectorAll('.prose pre').forEach(function(pre){if(pre.querySelector('.copy-code'))return;var b=document.createElement('button');b.className='copy-code';b.textContent='Copy';b.addEventListener('click',async function(){var c=pre.querySelector('code');try{await navigator.clipboard.writeText(c?c.innerText:pre.innerText);var o=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=o;},1200);}catch(e){}});pre.appendChild(b);});`;
const TABS_JS = `document.querySelectorAll('.tabs').forEach(function(t){t.querySelectorAll('.tab-btn').forEach(function(b){b.addEventListener('click',function(){var i=b.getAttribute('data-tab');t.querySelectorAll('.tab-btn').forEach(function(x){x.classList.toggle('active',x.getAttribute('data-tab')===i);});t.querySelectorAll('.tab-panel').forEach(function(p){p.hidden=p.getAttribute('data-tab')!==i;});});});});`;
// Render ```mermaid code fences client-side. Self-guards (no `.language-mermaid` → returns before
// importing anything), so pages without diagrams pay nothing and the lib never enters the worker
// bundle. Sources are captured once into placeholder divs; re-rendered on `data-theme` flips so
// diagrams recolor with the theme toggle.
const MERMAID_CDN = "https://esm.sh/mermaid@11";
const mermaidJs = (cdn: string): string =>
  `(function(){var blocks=document.querySelectorAll('code.language-mermaid');if(!blocks.length)return;` +
  `var items=[];blocks.forEach(function(c){var pre=c.closest('pre')||c;var h=document.createElement('div');h.className='mermaid-diagram';pre.replaceWith(h);items.push({src:c.textContent,holder:h});});` +
  `var lib,id=0;function load(){return lib||(lib=import(${JSON.stringify(cdn)}).then(function(m){return m.default;}));}` +
  `function theme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'default';}` +
  `function run(){load().then(function(mermaid){mermaid.initialize({startOnLoad:false,securityLevel:'loose',theme:theme()});items.forEach(function(it){mermaid.render('kura-mmd-'+(id++),it.src).then(function(r){it.holder.innerHTML=r.svg;}).catch(function(e){it.holder.innerHTML='<pre class="mermaid-error">'+String((e&&e.message)||e)+'</pre>';});});}).catch(function(){});}` +
  `run();var cur=document.documentElement.getAttribute('data-theme');` +
  `new MutationObserver(function(){var t=document.documentElement.getAttribute('data-theme');if(t!==cur){cur=t;run();}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});})();`;
