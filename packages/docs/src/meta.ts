// Per-folder navigation metadata — Fumadocs-compatible `meta.json` (drop-in) is the primary format.
// We don't trust the JSON: it's STRICTLY validated at build (`kura index`), so a typo'd key, a wrong
// type, or a `pages` entry that points at no real file fails the build with a precise message —
// the safety of a typed config without forcing anyone to write TypeScript.

export interface MetaConfig {
  /** Folder display name in the sidebar (else the folder name is humanized). */
  title?: string;
  /** Explicit child order, by file/sub-folder name (e.g. ["index", "subscriptions", "trials"]). */
  pages?: string[];
  /** Icon name (validated against the icon set later). */
  icon?: string;
  /** Whether the folder starts expanded (default: open when it contains the active page). */
  defaultOpen?: boolean;
}

/** folder path (relative to the docs root; "" = root) → its meta. */
export type MetaMap = Record<string, MetaConfig>;

/** Merge a locale's per-folder overrides over a base map. Each folder key is shallow-merged, so a
 *  locale can relabel/reorder a folder (`title`, `pages`, …) without restating fields it shares with
 *  the default. Folders the locale never mentions keep the base meta verbatim. Pure — used by the
 *  docs framework to localize folder group titles. */
export function mergeMeta(base: MetaMap | undefined, override: MetaMap): MetaMap {
  const out: MetaMap = { ...base };
  for (const k of Object.keys(override)) out[k] = { ...base?.[k], ...override[k] };
  return out;
}

const ALLOWED = ["title", "pages", "icon", "defaultOpen"] as const;

/** Validate one raw meta object. Returns the typed meta plus a list of human-readable errors
 *  (empty = valid). `where` is a label for messages (e.g. "features/payments/meta.json"). */
export function parseMeta(raw: unknown, where: string): { meta: MetaConfig; errors: string[] } {
  const errors: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { meta: {}, errors: [`${where}: must be a JSON object`] };
  }
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (!(ALLOWED as readonly string[]).includes(k)) errors.push(`${where}: unknown key "${k}" (allowed: ${ALLOWED.join(", ")})`);
  }
  const meta: MetaConfig = {};
  if ("title" in o) {
    if (typeof o.title === "string") meta.title = o.title;
    else errors.push(`${where}: "title" must be a string`);
  }
  if ("pages" in o) {
    if (Array.isArray(o.pages) && o.pages.every((p) => typeof p === "string")) meta.pages = o.pages as string[];
    else errors.push(`${where}: "pages" must be an array of strings`);
  }
  if ("icon" in o) {
    if (typeof o.icon === "string") meta.icon = o.icon;
    else errors.push(`${where}: "icon" must be a string`);
  }
  if ("defaultOpen" in o) {
    if (typeof o.defaultOpen === "boolean") meta.defaultOpen = o.defaultOpen;
    else errors.push(`${where}: "defaultOpen" must be a boolean`);
  }
  return { meta, errors };
}

/** Build-time cross-check: every name in `pages` must be a real child (file or sub-folder) of the
 *  folder. Catches stale/typo'd references that JSON alone can't — the killer check `meta.json` gets
 *  from going through Kura. `known` is the set of valid child names. Returns errors (empty = ok). */
export function validatePages(meta: MetaConfig, known: ReadonlySet<string>, where: string): string[] {
  if (!meta.pages) return [];
  return meta.pages
    .filter((p) => !known.has(p))
    .map((p) => `${where}: "pages" lists "${p}", which has no matching page or folder (have: ${[...known].sort().join(", ") || "none"})`);
}
