import type { Tokenizer } from "@kurajs/search";

// Character classes. Han/Hiragana/Katakana/Hangul are the space-free scripts we
// bigram; everything else that is a letter or number is treated as a normal word.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORD = /[\p{L}\p{N}]/u;

/**
 * Dictionary-free CJK tokenizer: emits overlapping character bigrams for runs of
 * CJK characters (搜尋引擎 → 搜尋, 尋引, 引擎), and whole lowercased words for runs
 * of Latin letters / digits (so mixed text like "iPhone 15 手機" works). A lone CJK
 * character is emitted as a unigram.
 *
 * Bigrams trade a larger index for guaranteed recall and zero dictionary / license
 * baggage — the robust default for CJK keyword search, and a safe fallback where
 * `Intl.Segmenter` is unavailable.
 */
export function cjkBigram(): Tokenizer {
  return (text) => {
    const chars = Array.from(text); // code points (handles CJK ext surrogate pairs)
    const out: string[] = [];
    let i = 0;
    while (i < chars.length) {
      const ch = chars[i]!;
      if (CJK.test(ch)) {
        let j = i;
        while (j < chars.length && CJK.test(chars[j]!)) j++;
        const run = chars.slice(i, j);
        if (run.length === 1) out.push(run[0]!);
        else for (let k = 0; k < run.length - 1; k++) out.push(run[k]! + run[k + 1]!);
        i = j;
      } else if (WORD.test(ch)) {
        let j = i;
        while (j < chars.length && WORD.test(chars[j]!) && !CJK.test(chars[j]!)) j++;
        out.push(chars.slice(i, j).join("").toLowerCase());
        i = j;
      } else {
        i++;
      }
    }
    return out;
  };
}
