import type { Embedder } from "@kurajs/core";
import { pipeline } from "@huggingface/transformers";

export interface TransformersOptions {
  /** HF model id. Default "Xenova/bge-m3" (parity with Cloudflare `@cf/baai/bge-m3`). */
  model?: string;
  /** Embedding dimension. Default 1024 (bge-m3). */
  dim?: number;
  /** ONNX weight precision. Default "q8" (small + fast on CPU). */
  dtype?: "fp32" | "fp16" | "q8" | "int8" | "uint8";
  /** Pooling for the dense embedding. Default "cls" (bge family). */
  pooling?: "cls" | "mean";
}

/**
 * Local embedder backed by Transformers.js (ONNX Runtime) — runs the model in JS,
 * no Python, no cloud API. Model loads lazily on first embed and is cached.
 *
 * On CPU we embed one text at a time: batching pads every sequence to the batch's
 * longest, which is *slower* for variable-length text (see prototypes/vector-bench).
 */
export function transformers(opts: TransformersOptions = {}): Embedder {
  const model = opts.model ?? "Xenova/bge-m3";
  const dim = opts.dim ?? 1024;
  const dtype = opts.dtype ?? "q8";
  const pooling = opts.pooling ?? "cls";

  let extractor: Promise<any> | null = null;
  const load = () => (extractor ??= pipeline("feature-extraction", model, { dtype }));

  return {
    id: model,
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      const ex = await load();
      const out: Float32Array[] = [];
      for (const text of texts) {
        const t = await ex(text, { pooling, normalize: true });
        if (t.data.length !== dim) {
          throw new Error(`kura-transformers: model "${model}" produced ${t.data.length} dims, expected ${dim}`);
        }
        out.push(Float32Array.from(t.data as Float32Array));
      }
      return out;
    },
  };
}
