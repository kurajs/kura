// Public types for @kurajs/ctrlk. The core (state machine) and the default DOM renderer
// both speak these; a consumer can drive the core directly or mount the renderer.

/** A selectable row. The shape is intentionally open — `data` carries whatever the
 *  consumer needs back in `onSelect`. `id` must be stable and unique (ARIA ids,
 *  selection, dedup all key on it). */
export interface CtrlkItem<D = unknown> {
  /** Stable unique id. */
  id: string;
  /** Primary label. In static-filter mode this (plus `keywords`) is what the query matches. */
  title: string;
  /** Secondary line — e.g. a breadcrumb path ("Guides › Install"). */
  description?: string;
  /** Snippet / matched body text shown under the title. */
  excerpt?: string;
  /** Rich HTML preview shown under the title (rendered + sanitized via innerHTML, taking precedence
   *  over `excerpt`). For TRUSTED, build-generated markup only — never user input. */
  excerptHtml?: string;
  /** Group label. Items sharing a group render under one heading, in first-seen order. */
  group?: string;
  /** Leading glyph/icon hint for the default renderer ("page" | "hash" | custom string). */
  icon?: string;
  /** Extra terms matched in static-filter mode (never shown). */
  keywords?: string[];
  /** Optional destination. The default renderer makes the row a link and Enter navigates here. */
  href?: string;
  /** Arbitrary payload handed back to `onSelect`. */
  data?: D;
}

/** A click/keypress context passed to `onSelect`, so a consumer can honor modifier-clicks
 *  (open in new tab, etc.) without the renderer owning that policy. */
export interface CtrlkSelectEvent {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface CtrlkOptions<D = unknown> {
  /** Async data source, called (debounced) on every query change; return ranked items.
   *  Receives an AbortSignal so stale in-flight requests can be dropped. When set, it takes
   *  precedence over `items`/`filter`. */
  search?: (query: string, signal: AbortSignal) => CtrlkItem<D>[] | Promise<CtrlkItem<D>[]>;
  /** Static item pool, filtered locally by `filter` (cmdk-style). Used when `search` is absent. */
  items?: CtrlkItem<D>[];
  /** Static-mode scorer: returns >0 to keep an item (higher = ranked earlier), 0 to drop it.
   *  Defaults to a case-insensitive substring/subsequence match over title + keywords. */
  filter?: (item: CtrlkItem<D>, query: string) => number;
  /** Milliseconds to wait after the last keystroke before calling `search`. Default 120. */
  debounce?: number;
  /** Rows to show when the query is empty (recent searches, suggestions). Default: none in
   *  async mode, the full pool in static mode. */
  empty?: CtrlkItem<D>[];
  /** Wrap arrow navigation around the list ends. Default true; set false to clamp at the ends. */
  loop?: boolean;
  /** Static mode: run the built-in filter/sort. Set false when `items` are already filtered and
   *  ranked (e.g. you filter externally and feed results via {@link Ctrlk.setItems}). Default true. */
  shouldFilter?: boolean;
  /** Initial highlighted item id. Observe changes via {@link onValueChange}. */
  value?: string;
  /** Invoked when a row is chosen (Enter or click). The default renderer additionally
   *  navigates `item.href` when present and the event has no opening modifier. */
  onSelect?: (item: CtrlkItem<D>, ev?: CtrlkSelectEvent) => void;
  /** Fires when the highlighted item changes — its id, or null when the list is empty. */
  onValueChange?: (value: string | null) => void;
  /** Fires when the palette opens or closes (for URL/analytics sync). */
  onOpenChange?: (open: boolean) => void;
}

/** A group of rows under one heading. The ungrouped bucket has `label === ""`. */
export interface CtrlkGroup<D = unknown> {
  label: string;
  items: CtrlkItem<D>[];
}

/** The full observable state. The renderer is a pure function of this. */
export interface CtrlkState<D = unknown> {
  open: boolean;
  query: string;
  loading: boolean;
  /** Resolved, ordered rows for the current query (post-filter in static mode). */
  items: CtrlkItem<D>[];
  /** `items` bucketed by group, in first-seen order. */
  groups: CtrlkGroup<D>[];
  /** Index into `items` of the highlighted row, or -1 when there are none. */
  activeIndex: number;
  /** Id of the highlighted row (its `item.id`), or null when there are none. Mirrors `activeIndex`
   *  but is stable across reorders — the cmdk-style controlled selection value. */
  value: string | null;
  /** The last async-source error, if any (cleared on the next successful resolve). */
  error: Error | null;
}

/** The headless controller. Drive it from any renderer (or none). */
export interface Ctrlk<D = unknown> {
  getState(): Readonly<CtrlkState<D>>;
  /** Subscribe to state changes. Fires once immediately with the current state. Returns an unsubscribe. */
  subscribe(fn: (state: Readonly<CtrlkState<D>>) => void): () => void;
  open(): void;
  close(): void;
  toggle(): void;
  setQuery(query: string): void;
  /** Move the active row by `delta`, wrapping around the ends. */
  move(delta: number): void;
  /** Set the active row to an absolute index (clamped to range). */
  setActive(index: number): void;
  /** Highlight the row with this id (no-op if absent); null clears the highlight. */
  setValue(id: string | null): void;
  /** Replace the item pool (static mode), keeping the current highlight if it survives. */
  setItems(items: CtrlkItem<D>[]): void;
  /** Choose a row — the given `item`, or the active one — firing `onSelect`. */
  select(item?: CtrlkItem<D>, ev?: CtrlkSelectEvent): void;
  /** Cancel timers/in-flight requests and drop all subscribers. */
  destroy(): void;
}
