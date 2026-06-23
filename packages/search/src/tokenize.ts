/** A tokenizer turns text into an ordered list of normalized terms. */
export type Tokenizer = (text: string) => string[];

/**
 * Default tokenizer for space-delimited / alphabetic scripts (Latin, Cyrillic,
 * Greek, …): lowercase, then split on any run of non-letter / non-number
 * characters. Unicode-aware, so accented letters survive.
 *
 * This does NOT segment space-free scripts (Chinese, Japanese, Thai): those
 * collapse to one token per run. For CJK, inject a bigram/segmenting tokenizer
 * from `@kurajs/tokenizers` via the `tokenize` option.
 */
export const latinTokenizer: Tokenizer = (text) =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
