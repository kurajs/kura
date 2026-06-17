// The embedder contract. Adapters (local Transformers.js, Cloudflare Workers AI,
// external API, ...) implement this. The core stays zero-dependency: it only
// depends on this interface, never on a concrete embedder.
export interface Embedder {
  /** Model identifier, e.g. "Xenova/bge-m3" or "@cf/baai/bge-m3". Used for parity checks. */
  readonly id: string;
  /** Embedding dimension, e.g. 1024 for bge-m3. */
  readonly dim: number;
  /** Embed a batch of texts into normalized vectors (same order as input). */
  embed(texts: string[]): Promise<Float32Array[]>;
}
