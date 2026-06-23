// Reciprocal Rank Fusion — combine several ranked result lists into one ranking
// without needing comparable scores. Each item contributes 1/(k + rank) for every
// list it appears in, so items ranked well in multiple lists rise to the top. The
// classic k=60 makes fusion robust to any single list's score scale (Cormack 2009).
//
// This is how Kura blends keyword (BM25) precision with semantic / cross-lingual
// recall: BM25 scores and cosine similarities aren't comparable, but their ranks are.

export interface RrfList<T> {
  /** Hits in rank order, best first. */
  hits: readonly T[];
  /** Relative weight of this list's contribution. Default 1. */
  weight?: number;
}

export interface RrfOptions {
  /** Rank-smoothing constant; larger flattens the contribution of top ranks. Default 60. */
  k?: number;
  /** Truncate the fused result to this many items. Default: keep all. */
  topK?: number;
}

/**
 * Fuse ranked lists by id. The representative item kept for an id is the first one
 * seen across the lists in the order given — so pass the list whose payload you'd
 * rather display (e.g. the keyword snippet) first.
 */
export function rrf<T>(lists: readonly RrfList<T>[], idOf: (hit: T) => string, opts: RrfOptions = {}): T[] {
  const k = opts.k ?? 60;
  const score = new Map<string, number>();
  const rep = new Map<string, T>();
  for (const list of lists) {
    const weight = list.weight ?? 1;
    for (let rank = 0; rank < list.hits.length; rank++) {
      const hit = list.hits[rank];
      const id = idOf(hit);
      score.set(id, (score.get(id) ?? 0) + weight / (k + rank + 1));
      if (!rep.has(id)) rep.set(id, hit);
    }
  }
  const fused = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const sliced = opts.topK != null ? fused.slice(0, opts.topK) : fused;
  return sliced.map(([id]) => rep.get(id) as T);
}
