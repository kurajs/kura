import type { Tokenizer } from "@kurajs/search";
import { cjkBigram } from "./bigram.ts";

// Minimal local typing for Intl.Segmenter so we don't depend on the TS lib shipping
// it (it's runtime-detected anyway).
interface Segment {
  segment: string;
  isWordLike?: boolean;
}
interface Segmenter {
  segment(input: string): Iterable<Segment>;
}
interface SegmenterCtor {
  new (locale?: string, options?: { granularity?: "grapheme" | "word" | "sentence" }): Segmenter;
}

/** True when the runtime provides `Intl.Segmenter` (Baseline browsers, Node 16+). */
export function hasSegmenter(): boolean {
  return typeof (globalThis as { Intl?: { Segmenter?: unknown } }).Intl?.Segmenter === "function";
}

/**
 * Word-segmenting CJK tokenizer backed by the native `Intl.Segmenter` (the ECMAScript
 * Intl API, dictionary-based via ICU's BreakIterator). Higher precision than bigrams,
 * with the dictionary living in the engine (zero bundle cost). Where `Intl.Segmenter`
 * is unavailable (e.g. some edge runtimes) it falls back to {@link cjkBigram}, so
 * search still works.
 *
 * @param locale e.g. "zh", "zh-TW", "ja", "ko"
 */
export function cjkSegmenter(locale: string, opts: { fallback?: Tokenizer } = {}): Tokenizer {
  const Ctor = (globalThis as { Intl?: { Segmenter?: SegmenterCtor } }).Intl?.Segmenter;
  if (!Ctor) return opts.fallback ?? cjkBigram();
  const seg = new Ctor(locale, { granularity: "word" });
  return (text) => {
    const out: string[] = [];
    for (const s of seg.segment(text)) {
      // `isWordLike` is spec'd for word granularity, but some polyfills/old engines omit it;
      // when it's absent, keep any segment containing a letter or number.
      if (s.isWordLike ?? /[\p{L}\p{N}]/u.test(s.segment)) out.push(s.segment.toLowerCase());
    }
    return out;
  };
}
