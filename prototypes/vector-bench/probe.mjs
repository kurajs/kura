import { pipeline } from "@huggingface/transformers";
const t0 = Date.now();
const ex = await pipeline("feature-extraction", "Xenova/bge-m3", { dtype: "q8" });
console.log("load+download:", ((Date.now()-t0)/1000).toFixed(1), "s");
const t1 = Date.now();
const out = await ex(["你好,這是一個測試。", "deploy to cloudflare workers"], { pooling: "cls", normalize: true });
console.log("embed 2 sentences:", Date.now()-t1, "ms | dims:", out.dims);
