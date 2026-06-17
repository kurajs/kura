// Headless docs navigation: sidebar tree, prev/next, and ToC extraction — derived
// from a content collection (the app passes its June-frozen DOCS). No June/React import.

export interface DocLike {
  slug: string;
  data: { title?: string; description?: string; section?: string; order?: string | number };
  html: string;
  original: string;
  body: string;
  /** The locale this entry was authored in (June ≥0.0.25); undefined = flat default. */
  locale?: string;
}

export type Toc = { level: number; text: string; id: string }[];

export interface Nav<T extends DocLike = DocLike> {
  groups(): { title: string; items: T[] }[];
  ordered(): T[];
  prevNext(slug: string): { prev: T | null; next: T | null };
}

/** Build the nav from a content collection. `sections` sets sidebar group order. */
export function createNav<T extends DocLike>(opts: { entries: readonly T[]; sections?: string[] }): Nav<T> {
  const order = opts.sections ?? [];
  const groups = () => {
    const m = new Map<string, T[]>();
    for (const d of opts.entries) {
      const s = String(d.data.section ?? "Other");
      const a = m.get(s) ?? [];
      a.push(d);
      m.set(s, a);
    }
    const secs = [...m.entries()].map(([title, items]) => ({
      title,
      items: [...items].sort((a, b) => Number(a.data.order) - Number(b.data.order)),
    }));
    const rank = (t: string) => { const i = order.indexOf(t); return i < 0 ? 1e9 : i; };
    secs.sort((a, b) => rank(a.title) - rank(b.title));
    return secs;
  };
  const ordered = () => groups().flatMap((g) => g.items);
  const prevNext = (slug: string) => {
    const all = ordered();
    const i = all.findIndex((d) => d.slug === slug);
    return { prev: i > 0 ? all[i - 1] : null, next: i >= 0 && i < all.length - 1 ? all[i + 1] : null };
  };
  return { groups, ordered, prevNext };
}

export function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[`*_~]/g, "").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "");
}

/** Inject ids into h2/h3 of rendered HTML and extract the table of contents. */
export function processHtml(html: string): { html: string; toc: Toc } {
  const toc: Toc = [];
  const out = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    const id = slugify(text);
    toc.push({ level: Number(lvl), text, id });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
  return { html: out, toc };
}
