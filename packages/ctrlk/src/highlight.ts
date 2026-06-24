// Query-term highlighting, as a pure function so it's testable without a DOM and reusable
// by any renderer. The default DOM renderer turns matched segments into <mark> elements
// (built via textContent, never innerHTML — so user/content text is never parsed as markup).

export interface HighlightSegment {
  text: string;
  /** True when this segment matched one of the query tokens. */
  match: boolean;
}

/**
 * Split `text` into consecutive segments, marking the spans that match any `token`
 * (case-insensitive). Overlapping/adjacent matches are merged. Tokens should be the terms the
 * search engine actually matched on (e.g. BM25's per-locale tokens) so CJK/accented matches
 * line up with scoring rather than a naive whitespace re-split.
 *
 * Returns a single unmatched segment when there are no tokens or no hits — so a renderer can
 * always map over the result uniformly.
 */
export function highlight(text: string, tokens: readonly string[]): HighlightSegment[] {
  const terms = tokens.map((t) => t.toLowerCase()).filter(Boolean);
  if (!text || terms.length === 0) return [{ text, match: false }];

  const hay = text.toLowerCase();
  // Collect every [start, end) match range across all tokens.
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = hay.indexOf(term, from);
      if (at < 0) break;
      ranges.push([at, at + term.length]);
      from = at + term.length;
    }
  }
  if (ranges.length === 0) return [{ text, match: false }];

  // Merge overlapping/touching ranges so we never emit empty or nested marks.
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  // Walk the merged ranges, interleaving the unmatched gaps. Slice the ORIGINAL text to keep case.
  const out: HighlightSegment[] = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) out.push({ text: text.slice(cursor, s), match: false });
    out.push({ text: text.slice(s, e), match: true });
    cursor = e;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), match: false });
  return out;
}
