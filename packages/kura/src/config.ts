import type { Embedder } from "./embedder.ts";

export interface KuraConfig {
  /** Embedding engine. Pick an adapter: transformers() (local) or workersAI() (cloud). */
  embedder: Embedder;
  /** At or below this corpus size, search is exact brute-force. Default 10000. */
  exactThreshold?: number;
  // future: content globs, chunking strategy, deploy target, ...
}

/** Identity helper that gives `kura.config.ts` full type-checking + inference. */
export function defineConfig(config: KuraConfig): KuraConfig {
  return config;
}
