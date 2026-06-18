// Presentational docs UI (en-US). Plain-prop components — no June/app imports — so they
// stay portable and overridable. The app maps its nav/content into these props.
import type { ReactNode } from "react";
import { docPath, type Toc } from "./nav.ts";
import { themeCss } from "./theme.ts";
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

/** Recursive sidebar rendering as a real list (semantics + a11y): each item is an <li>; a doc → link,
 *  a folder → <details> whose children are a nested <ul>. A folder with an index renders its title as
 *  a link (clicking navigates to the folder's page); the chevron still toggles. */
function SidebarItems({ items, active, href, basePath }: { items: SidebarNode[]; active?: string; href: Href; basePath: string }) {
  return (
    <ul className="items">
      {items.map((n) =>
        "items" in n ? (
          <li key={n.title} className="folder-li">
            <details className="folder" open={n.slug === active || hasActive(n.items, active)}>
              <summary className="folder-title">
                {n.slug ? (
                  <a className={"folder-link" + (n.slug === active ? " active" : "")} href={href(docPath(basePath, n.slug))}>{n.title}</a>
                ) : (
                  <span>{n.title}</span>
                )}
              </summary>
              <SidebarItems items={n.items} active={active} href={href} basePath={basePath} />
            </details>
          </li>
        ) : (
          <li key={n.slug}>
            <a className={"item" + (n.slug === active ? " active" : "")} href={href(docPath(basePath, n.slug))}>
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
  html: string;
  toc: Toc;
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  /** True when this locale has no variant for the page and the default language is shown. */
  notTranslated?: boolean;
};
export type SearchHit = { slug: string; title: string; section: string; text: string; score: number };

/** The 3-column chrome: top bar · sidebar · content · ToC. Injects the theme. */
export function DocsShell({ site, sidebar, tabs, active, toc, basePath = "/docs", labels = DEFAULT_LABELS, href = (p) => p, localeSwitch, children }: {
  site?: SiteInfo;
  sidebar: SidebarGroup[];
  tabs?: TabLink[];
  active?: string;
  toc?: Toc;
  basePath?: string;
  labels?: Labels;
  href?: Href;
  localeSwitch?: LocaleLink[];
  children: ReactNode;
}) {
  const brand = site?.brand ?? site?.name ?? "Kura";
  return (
    <>
      {/* Resolve + apply the theme on <html> BEFORE the styles below paint — no flash. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_JS }} />
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <header className="topbar">
        <a className="brand" href={href("/")}>{brand} <span className="sub">Docs</span></a>
        <form method="get" action={href("/search")}>
          <input className="search-box" name="q" placeholder={labels.searchPlaceholder} aria-label={labels.search} />
        </form>
        <nav className="links">
          {localeSwitch && localeSwitch.length > 1 && (
            <span className="locale-switch">
              {localeSwitch.map((l) => (
                <a key={l.locale} className={"locale" + (l.active ? " active" : "")} href={l.href} hrefLang={l.locale}>{l.name}</a>
              ))}
            </span>
          )}
          <button type="button" className="theme-toggle" data-theme-toggle aria-label="Toggle theme" />
          <a href="/llms.txt">llms.txt</a>
          <a href="/mcp">MCP</a>
        </nav>
      </header>
      {tabs && tabs.length > 0 && (
        <nav className="tabbar">
          <div className="tabbar-inner">
            {tabs.map((t) => (
              <a key={t.title} className={"tab" + (t.active ? " active" : "")} href={t.href}>{t.title}</a>
            ))}
          </div>
        </nav>
      )}
      <div className="shell">
        <aside className="sidebar">
          {sidebar.map((s, i) => (
            <div className="group" key={s.title || `g${i}`}>
              {s.title && <p className="group-title">{s.title}</p>}
              <SidebarItems items={s.items} active={active} href={href} basePath={basePath} />
            </div>
          ))}
        </aside>
        <main className="content">{children}</main>
        <aside className="toc">
          {toc && toc.length > 0 && (
            <>
              <p className="toc-title">{labels.onThisPage}</p>
              {toc.map((h) => (
                <a key={h.id} className={`lvl-${h.level}`} href={`#${encodeURIComponent(h.id)}`}>{h.text}</a>
              ))}
            </>
          )}
        </aside>
      </div>
      <script dangerouslySetInnerHTML={{ __html: FOCUS_JS + THEME_TOGGLE_JS }} />
    </>
  );
}

/** A full doc page: breadcrumb · page actions (copy md / open in LLM) · prose · pager. */
export function DocsPage({ site, sidebar, tabs, doc, basePath = "/docs", labels = DEFAULT_LABELS, href = (p) => p, localeSwitch }: { site?: SiteInfo; sidebar: SidebarGroup[]; tabs?: TabLink[]; doc: DocView; basePath?: string; labels?: Labels; href?: Href; localeSwitch?: LocaleLink[] }) {
  const md = href(docPath(basePath, `${doc.slug}.md`));
  const prompt = encodeURIComponent(`Please read this doc and answer my questions: ${doc.title}`);
  return (
    <DocsShell site={site} sidebar={sidebar} tabs={tabs} active={doc.slug} toc={doc.toc} basePath={basePath} labels={labels} href={href} localeSwitch={localeSwitch}>
      <div className="breadcrumb">{doc.section ? `${doc.section} / ` : ""}{doc.title}</div>
      {doc.notTranslated && <div className="not-translated">{labels.notTranslated}</div>}
      <div className="page-actions">
        <button className="btn primary" data-copy-md={md}>{labels.copyMarkdown}</button>
        <a className="btn" href={md}>{labels.viewMarkdown}</a>
        <a className="btn" href={`https://chatgpt.com/?q=${prompt}`} target="_blank" rel="noreferrer">{labels.openInChatGPT}</a>
        <a className="btn" href={`https://claude.ai/new?q=${prompt}`} target="_blank" rel="noreferrer">{labels.openInClaude}</a>
      </div>
      <article className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
      <nav className="pager">
        {doc.prev ? <a href={href(docPath(basePath, doc.prev.slug))}><div className="dir">← {labels.previous}</div><div className="ttl">{doc.prev.title}</div></a> : <span />}
        {doc.next ? <a className="next" href={href(docPath(basePath, doc.next.slug))}><div className="dir">{labels.next} →</div><div className="ttl">{doc.next.title}</div></a> : <span />}
      </nav>
      <script dangerouslySetInnerHTML={{ __html: COPY_JS + CODE_JS + TABS_JS }} />
    </DocsShell>
  );
}

/** Search results list (used inside a DocsShell). */
export function SearchResults({ query, hits, basePath = "/docs", labels = DEFAULT_LABELS, href = (p) => p }: { query: string; hits: SearchHit[]; basePath?: string; labels?: Labels; href?: Href }) {
  return (
    <div className="results">
      <h1 style={{ fontSize: "1.4rem" }}>{query ? `${labels.search}: “${query}”` : labels.search}</h1>
      {query && hits.length === 0 && <p style={{ color: "var(--muted)" }}>{labels.noResults}</p>}
      {hits.map((h, i) => (
        <a key={i} className="result" href={href(docPath(basePath, h.slug))}>
          <div className="meta"><span>{h.section} · {h.title}</span><span>cos {h.score}</span></div>
          <p style={{ margin: ".3rem 0 0", color: "#444" }}>{h.text.slice(0, 140)}…</p>
        </a>
      ))}
    </div>
  );
}

// Runs FIRST (before the stylesheet) to set <html data-theme> with no flash. Pref is one of
// system | light | dark; "system" follows prefers-color-scheme.
const THEME_INIT_JS = `(function(){try{var p=localStorage.getItem('kura-theme')||'system';var d=document.documentElement;d.setAttribute('data-theme-pref',p);d.setAttribute('data-theme',(p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme:dark)').matches))?'dark':'light');}catch(e){}})();`;
// The topbar toggle cycles system → light → dark, persists the pref, and tracks the OS while on system.
const THEME_TOGGLE_JS = `(function(){var b=document.querySelector('[data-theme-toggle]');if(!b)return;var d=document.documentElement,order=['system','light','dark'],icon={system:'🖥',light:'☀',dark:'☾'};function pref(){return d.getAttribute('data-theme-pref')||'system';}function res(p){return p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';}function set(p){d.setAttribute('data-theme-pref',p);d.setAttribute('data-theme',res(p));try{localStorage.setItem('kura-theme',p);}catch(e){}b.textContent=icon[p];b.setAttribute('title','Theme: '+p);}set(pref());b.addEventListener('click',function(){set(order[(order.indexOf(pref())+1)%order.length]);});try{matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){if(pref()==='system')d.setAttribute('data-theme',res('system'));});}catch(e){}})();`;
const FOCUS_JS = `document.addEventListener('keydown',function(e){if(e.key==='/' && !/INPUT|TEXTAREA/.test((document.activeElement||{}).tagName||'')){e.preventDefault();var s=document.querySelector('.search-box');if(s)s.focus();}});`;
const COPY_JS = `document.querySelectorAll('[data-copy-md]').forEach(function(b){b.addEventListener('click',async function(){try{var r=await fetch(b.getAttribute('data-copy-md'));var t=await r.text();await navigator.clipboard.writeText(t);var o=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=o;},1500);}catch(e){alert('Copy failed: '+e);}});});`;
const CODE_JS = `document.querySelectorAll('.prose pre').forEach(function(pre){if(pre.querySelector('.copy-code'))return;var b=document.createElement('button');b.className='copy-code';b.textContent='Copy';b.addEventListener('click',async function(){var c=pre.querySelector('code');try{await navigator.clipboard.writeText(c?c.innerText:pre.innerText);var o=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=o;},1200);}catch(e){}});pre.appendChild(b);});`;
const TABS_JS = `document.querySelectorAll('.tabs').forEach(function(t){t.querySelectorAll('.tab-btn').forEach(function(b){b.addEventListener('click',function(){var i=b.getAttribute('data-tab');t.querySelectorAll('.tab-btn').forEach(function(x){x.classList.toggle('active',x.getAttribute('data-tab')===i);});t.querySelectorAll('.tab-panel').forEach(function(p){p.hidden=p.getAttribute('data-tab')!==i;});});});});`;
