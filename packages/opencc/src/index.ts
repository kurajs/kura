import type { CharFilter } from "@kurajs/search";
import * as OpenCC from "opencc-js";

/** Canonical variant to fold to. "twp" = Traditional (Taiwan, phrase vocabulary). */
export type ChineseVariant = "twp" | "tw" | "hk" | "cn";

export interface NormalizeOptions {
  /** Fold everything to this variant. Default "twp" (Traditional-Taiwan). */
  to?: ChineseVariant;
  /** Source the OpenCC converter expects; defaults pair with `to` for an idempotent fold. */
  from?: ChineseVariant | "t";
}

/**
 * A {@link CharFilter} that normalizes Chinese to ONE canonical variant via OpenCC's
 * phrase dictionaries — folding both script and regional vocabulary (软件 ↔ 軟體,
 * 网络 ↔ 網路, 程序 ↔ 程式) so keyword search matches across 繁/簡. It is idempotent on
 * text already in the target variant, so it's safe to run at BOTH index and query time
 * (run it at both, or terms won't line up).
 *
 * Opt-in: pulls in `opencc-js` (~5 MB of dictionaries). Most single-variant sites don't
 * need it — the hybrid vector half already bridges 繁/簡 semantically; reach for this when
 * a corpus or audience mixes variants and you want keyword-level cross-variant matching.
 *
 * @example
 *   import { pipeline } from "@kurajs/search";
 *   import { cjkSegmenter } from "@kurajs/tokenizers";
 *   import { normalizeChinese } from "@kurajs/opencc";
 *   const zhTW = pipeline({ pre: [normalizeChinese()], segment: cjkSegmenter("zh-TW") });
 */
export function normalizeChinese(opts: NormalizeOptions = {}): CharFilter {
  const to = opts.to ?? "twp";
  // For a fold-to-X, the converter reads "the other side": fold→Traditional reads
  // Simplified (cn) input and leaves Traditional alone; fold→Simplified reads twp.
  const from = opts.from ?? (to === "cn" ? "twp" : "cn");
  const convert = OpenCC.Converter({ from, to });
  return (text) => convert(text);
}
