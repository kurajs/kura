/** A tokenizer turns text into an ordered list of normalized terms. */
export type Tokenizer = (text: string) => string[];

/**
 * Picks a tokenizer for a given language tag (e.g. "ja", "zh-TW"). Lets one index
 * tokenize each document by its own locale and each query by the query locale — so
 * a multilingual corpus gets per-language treatment without separate indexes.
 */
export type TokenizerResolver = (lang?: string) => Tokenizer;

/** A char filter preprocesses raw text before segmentation (e.g. strip markup). */
export type CharFilter = (text: string) => string;
/** A token filter post-processes the token list (e.g. lowercase, drop stop words). */
export type TokenFilter = (tokens: string[]) => string[];

/**
 * Default tokenizer for space-delimited / alphabetic scripts (Latin, Cyrillic,
 * Greek, …): lowercase, then split on any run of non-letter / non-number
 * characters. Unicode-aware, so accented letters survive.
 *
 * This does NOT segment space-free scripts (Chinese, Japanese, Thai): those
 * collapse to one token per run. For CJK, inject a tokenizer from
 * `@kurajs/tokenizers` (via `tokenize` or {@link byLocale}).
 */
export const latinTokenizer: Tokenizer = (text) =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Build a {@link TokenizerResolver} from a language → tokenizer map. Lookup tries
 * the exact tag, then the primary subtag ("zh-TW" → "zh"), then `default`
 * (falling back to {@link latinTokenizer}).
 */
export function byLocale(map: Record<string, Tokenizer> & { default?: Tokenizer }): TokenizerResolver {
  // BCP 47 language tags are case-insensitive, so normalize both the keys and the lookup
  // to lowercase — byLocale({ "zh-TW": t })("zh-tw") must resolve.
  const fallback = map.default ?? latinTokenizer;
  const byTag = new Map<string, Tokenizer>();
  for (const [k, v] of Object.entries(map)) if (k !== "default") byTag.set(k.toLowerCase(), v);
  return (lang) => {
    if (!lang) return fallback;
    const l = lang.toLowerCase();
    return byTag.get(l) ?? byTag.get(l.split("-")[0]!) ?? fallback;
  };
}

export interface PipelineSpec {
  /** Run before segmentation, in order (e.g. strip MDX). */
  pre?: CharFilter | CharFilter[];
  /** The tokenizer that splits text into terms. Default {@link latinTokenizer}. */
  segment?: Tokenizer;
  /** Run after segmentation, in order (e.g. {@link lowercase}, {@link stopwords}). */
  filters?: TokenFilter | TokenFilter[];
}

/**
 * Compose char filters → a segmenter → token filters into a single {@link Tokenizer}.
 * This is how a domain (code, product SKUs, legal) gets a custom analysis chain
 * without a bespoke tokenizer.
 */
export function pipeline(spec: PipelineSpec): Tokenizer {
  const pre = spec.pre ? (Array.isArray(spec.pre) ? spec.pre : [spec.pre]) : [];
  const segment = spec.segment ?? latinTokenizer;
  const filters = spec.filters ? (Array.isArray(spec.filters) ? spec.filters : [spec.filters]) : [];
  return (text) => {
    let t = text;
    for (const f of pre) t = f(t);
    let tokens = segment(t);
    for (const f of filters) tokens = f(tokens);
    return tokens;
  };
}

/** Token filter: lowercase every token. */
export const lowercase: TokenFilter = (tokens) => tokens.map((t) => t.toLowerCase());

/** Token filter: drop tokens shorter than `n` characters. */
export function minLength(n: number): TokenFilter {
  return (tokens) => tokens.filter((t) => t.length >= n);
}

/** Token filter: remove stop words (compared case-insensitively). */
export function stopwords(words: Iterable<string>): TokenFilter {
  const set = new Set([...words].map((w) => w.toLowerCase()));
  return (tokens) => tokens.filter((t) => !set.has(t.toLowerCase()));
}
