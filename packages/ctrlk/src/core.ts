// The headless ⌘K state machine. No DOM — pure logic over CtrlkState, so it unit-tests
// under `node --test` without a browser. The default renderer (dom.ts) subscribes to it;
// any other renderer (React, Svelte, your own) can too.
import type { Ctrlk, CtrlkGroup, CtrlkItem, CtrlkOptions, CtrlkSelectEvent, CtrlkState } from "./types.ts";

const DEFAULT_DEBOUNCE = 120;

/**
 * Default static-mode scorer: case-insensitive match over `title` + `keywords`. A contiguous
 * substring beats a scattered subsequence, and among substring hits an earlier, shorter match
 * ranks higher (more specific). Returns 0 for no match. Replace via {@link CtrlkOptions.filter}.
 */
export function defaultFilter(item: CtrlkItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const hay = (item.title + " " + (item.keywords?.join(" ") ?? "")).toLowerCase();
  const idx = hay.indexOf(q);
  if (idx >= 0) return 1000 - idx - hay.length * 0.01; // contiguous substring: strongest signal
  // Subsequence fallback: every query char appears in order somewhere in the haystack.
  let at = 0;
  for (const ch of q) {
    at = hay.indexOf(ch, at);
    if (at < 0) return 0;
    at++;
  }
  return 1 - hay.length * 0.001; // weak match, deprioritized vs any substring hit
}

/** Bucket items by `group`, preserving first-seen group order; ungrouped items fall under "". */
function bucket<D>(items: CtrlkItem<D>[]): CtrlkGroup<D>[] {
  const order: string[] = [];
  const map = new Map<string, CtrlkItem<D>[]>();
  for (const it of items) {
    const g = it.group ?? "";
    let arr = map.get(g);
    if (!arr) { arr = []; map.set(g, arr); order.push(g); }
    arr.push(it);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

/**
 * Create a headless ⌘K controller. Provide `search` for an async source (debounced, abortable)
 * or `items` + `filter` for a static, locally-filtered command list. Subscribe to drive a UI.
 */
export function createCtrlk<D = unknown>(options: CtrlkOptions<D> = {}): Ctrlk<D> {
  const debounceMs = options.debounce ?? DEFAULT_DEBOUNCE;
  const loop = options.loop ?? true; // wrap arrow nav around the ends (false → clamp)
  const subs = new Set<(s: CtrlkState<D>) => void>();
  let staticItems = options.items ?? []; // the static-mode pool (swappable via setItems)
  let state: CtrlkState<D> = { open: false, query: "", loading: false, items: [], groups: [], activeIndex: -1, value: null, error: null };

  let timer: ReturnType<typeof setTimeout> | null = null;
  let ac: AbortController | null = null;
  let runSeq = 0; // monotonic guard: only the most recent async run may apply its result
  let pendingValue: string | null = options.value ?? null; // initial highlight, honored on first results

  const emit = () => { const snap = state; for (const fn of [...subs]) fn(snap); };
  const set = (patch: Partial<CtrlkState<D>>) => { state = { ...state, ...patch }; emit(); };
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

  // Set the highlighted row by index, deriving `value` (its id) and firing onValueChange on change.
  const commitActive = (index: number) => {
    const value = index >= 0 ? state.items[index]?.id ?? null : null;
    const changed = value !== state.value;
    set({ activeIndex: index, value });
    if (changed) options.onValueChange?.(value);
  };

  // Replace the result set. `resetActive` (query-driven runs) highlights the first row — except an
  // initial `value` is honored once; otherwise the current highlight is kept if it survived (so a
  // host-driven setItems doesn't yank the user's selection).
  const applyItems = (items: CtrlkItem<D>[], resetActive: boolean) => {
    const want = resetActive ? pendingValue : state.value ?? pendingValue;
    pendingValue = null;
    let index = want != null ? items.findIndex((it) => it.id === want) : -1;
    if (index < 0) index = items.length ? 0 : -1;
    const value = index >= 0 ? items[index]!.id : null;
    const changed = value !== state.value;
    state = { ...state, items, groups: bucket(items), activeIndex: index, value, loading: false, error: null };
    emit();
    if (changed) options.onValueChange?.(value);
  };

  const runStatic = (q: string) => {
    if (options.shouldFilter === false) { applyItems(staticItems.slice(), true); return; } // already ranked
    if (!q.trim()) { applyItems((options.empty ?? staticItems).slice(), true); return; }
    const filter = options.filter ?? defaultFilter;
    applyItems(
      staticItems.map((it) => ({ it, s: filter(it, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.it),
      true,
    );
  };

  const runAsync = async (q: string) => {
    // Empty query never hits the network — show the configured suggestions (or nothing).
    if (!q.trim()) { ac?.abort(); applyItems((options.empty ?? []).slice(), true); return; }
    const seq = ++runSeq;
    ac?.abort();
    const controller = new AbortController();
    ac = controller;
    set({ loading: true });
    try {
      const items = await options.search!(q, controller.signal);
      if (seq === runSeq) applyItems(items, true); // ignore out-of-order/stale resolves
    } catch (err) {
      if (seq === runSeq && !controller.signal.aborted) set({ loading: false, error: err as Error });
    }
  };

  const schedule = (q: string) => {
    clearTimer();
    if (!options.search) { runStatic(q); return; } // local filter is cheap — run synchronously
    if (!q.trim()) { runAsync(q); return; } // empty → suggestions, no need to debounce
    timer = setTimeout(() => runAsync(q), debounceMs);
  };

  const open = () => { if (!state.open) { set({ open: true }); options.onOpenChange?.(true); schedule(state.query); } };
  // Closing invalidates any in-flight async run (bump the seq) so a late resolve/reject can't
  // apply stale results — or set an error — onto a palette the user already dismissed.
  const close = () => { if (state.open) { clearTimer(); runSeq++; ac?.abort(); set({ open: false, loading: false }); options.onOpenChange?.(false); } };

  return {
    getState: () => state,
    subscribe(fn) { subs.add(fn); fn(state); return () => { subs.delete(fn); }; },
    open,
    close,
    toggle() { state.open ? close() : open(); },
    setQuery(q) { if (q !== state.query) { set({ query: q }); schedule(q); } },
    move(delta) {
      const n = state.items.length;
      if (!n) return;
      let i: number;
      if (state.activeIndex < 0) i = delta > 0 ? 0 : n - 1;
      else if (loop) i = (state.activeIndex + delta + n) % n;
      else i = Math.max(0, Math.min(n - 1, state.activeIndex + delta));
      commitActive(i);
    },
    setActive(index) {
      const n = state.items.length;
      if (n) commitActive(Math.max(0, Math.min(n - 1, index)));
    },
    setValue(id) {
      if (id == null) { commitActive(-1); return; }
      const i = state.items.findIndex((it) => it.id === id);
      if (i >= 0) commitActive(i);
    },
    setItems(items) {
      staticItems = items;
      applyItems(items, false); // host-supplied (e.g. externally filtered) → keep the active row if present
    },
    select(item?: CtrlkItem<D>, ev?: CtrlkSelectEvent) {
      const it = item ?? state.items[state.activeIndex];
      if (it) options.onSelect?.(it, ev);
    },
    destroy() { clearTimer(); ac?.abort(); subs.clear(); },
  };
}
