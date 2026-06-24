import type { Embedder } from "@kurajs/core";
import { pipeline, env } from "@huggingface/transformers";
import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

// A truncated/incomplete model download (Transformers.js caches partial downloads as if complete, so
// every later build then fails on the same corrupt cache) surfaces as an ONNX parse/deserialize error
// rather than a download error. Detect that shape so we can wipe the cache and re-fetch.
const isCorruptModel = (err: unknown): boolean =>
  /protobuf|deserialize|external initializer|out of bounds|parsing failed/i.test(
    (err as Error)?.message ?? "",
  );

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
  const build = () => pipeline("feature-extraction", model, { dtype });
  // Self-heal a corrupt/incomplete cached model: on the tell-tale ONNX load error, wipe THIS model's
  // cache once and re-download. A transient truncation recovers; a persistent one fails with a clear,
  // actionable message instead of the cryptic "Protobuf parsing failed" (which otherwise recurs on
  // every build forever, since the partial file stays cached).
  const loadOnce = async (): Promise<any> => {
    try {
      return await build();
    } catch (err) {
      if (!isCorruptModel(err)) throw err;
      const cacheRoot = resolve(env.cacheDir ?? ".cache");
      const cached = resolve(cacheRoot, ...model.split("/"));
      // Refuse to delete outside the cache dir: a model id containing `..` would otherwise traverse
      // out via path normalization into arbitrary recursive deletion. If it escapes, rethrow as-is.
      // (Build the prefix from cacheRoot's own trailing sep so a root cacheDir like "/" still works.)
      const prefix = cacheRoot.endsWith(sep) ? cacheRoot : cacheRoot + sep;
      if (cached === cacheRoot || !cached.startsWith(prefix)) throw err;
      await rm(cached, { recursive: true, force: true }); // surface permission/IO errors (not swallowed)
      try {
        return await build();
      } catch (err2) {
        throw new Error(
          `kura-transformers: "${model}" (${dtype}) failed to load even after clearing its cache and ` +
            `re-downloading — the model download looks incomplete. Check network and free disk space, ` +
            `then retry. Underlying error: ${(err2 as Error).message}`,
        );
      }
    }
  };
  const load = () => (extractor ??= loadOnce());

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
