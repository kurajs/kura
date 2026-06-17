// Kura knowledgebase retrieval engine.
//
// Pure JS, zero dependencies, runs identically on Node / Bun / Deno / Cloudflare
// Workers. Strategy validated in prototypes/vector-bench:
//   - small corpus (<= exactThreshold): exact f32 brute-force (100% recall)
//   - larger corpus: binary (sign-bit) Hamming prefilter -> f32 rerank
// Vectors are L2-normalized on insert, so cosine similarity == dot product.

export interface KbRecord<M = unknown> {
  /** Stable identifier returned by search. */
  id: string;
  /** Embedding for this record (e.g. bge-m3, 1024-dim). */
  vector: ArrayLike<number>;
  /** Arbitrary payload returned with hits (chunk text, url, frontmatter...). */
  data?: M;
}

export interface KbHit<M = unknown> {
  id: string;
  /** Cosine similarity in [-1, 1]; higher is closer. */
  score: number;
  data: M;
}

import type { Embedder } from "./embedder.ts";

export interface KbOptions {
  /** Embedding dimension (e.g. 1024 for bge-m3). Optional if `embedder` is given. */
  dim?: number;
  /** At or below this corpus size, search is always exact brute-force. Default 10000. */
  exactThreshold?: number;
  /** Embedder adapter (e.g. transformers()) enabling `searchText` and `addText`. */
  embedder?: Embedder;
  /** Low-level escape hatch: a raw embed function. Prefer `embedder`. */
  embed?: (text: string) => Promise<ArrayLike<number>> | ArrayLike<number>;
}

export interface KbSearchOptions {
  /** Number of results. Default 10. */
  topK?: number;
  /**
   * Candidates pulled from the binary prefilter before f32 rerank (ANN path only).
   * Default: max(topK * 20, ceil(0.5% of corpus)). Larger = higher recall, slower.
   */
  rerankDepth?: number;
}

const popcount = (x: number): number => {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
};

export class Kb<M = unknown> {
  readonly dim: number;
  readonly exactThreshold: number;
  private readonly words: number;
  private readonly embedder?: Embedder;
  private readonly embedFn?: KbOptions["embed"];

  private ids: string[] = [];
  private meta: M[] = [];
  private vecs: Float32Array; // flat, capacity * dim (normalized)
  private codes: Uint32Array; // flat, capacity * words (sign bits)
  private idx = new Map<string, number>(); // id -> slot, for dynamic upsert/delete
  private count = 0;
  private capacity = 0;

  constructor(opts: KbOptions) {
    const dim = opts.dim ?? opts.embedder?.dim;
    if (!Number.isInteger(dim) || (dim as number) <= 0) throw new Error("Kb: dim must be a positive integer (or pass an embedder)");
    this.dim = dim as number;
    this.words = (this.dim + 31) >> 5;
    this.exactThreshold = opts.exactThreshold ?? 10000;
    this.embedder = opts.embedder;
    this.embedFn = opts.embed;
    this.vecs = new Float32Array(0);
    this.codes = new Uint32Array(0);
  }

  get size(): number {
    return this.count;
  }

  /** Build a Kb from a full record set in one shot. */
  static from<M>(records: Iterable<KbRecord<M>>, opts: KbOptions): Kb<M> {
    const kb = new Kb<M>(opts);
    kb.add(records);
    return kb;
  }

  /**
   * Insert or update records (upsert by id). New ids append; existing ids are
   * overwritten in place. Either way the change is searchable immediately — there
   * is no index graph to rebuild. Vectors are normalized and binary-coded on write.
   */
  add(records: Iterable<KbRecord<M>>): void {
    const list = Array.isArray(records) ? records : [...records];
    this.ensure(this.count + list.length);
    for (const rec of list) {
      const existing = this.idx.get(rec.id);
      if (existing !== undefined) this.writeAt(existing, rec);
      else { this.writeAt(this.count, rec); this.count++; }
    }
  }

  /** Alias for {@link add} — reads as intent at a dynamic write site. */
  upsert(record: KbRecord<M>): void {
    this.add([record]);
  }

  /** Whether a record with this id exists. */
  has(id: string): boolean {
    return this.idx.has(id);
  }

  /**
   * Remove a record by id (O(1) swap-remove). Returns true if it existed.
   * Searchable state updates immediately.
   */
  delete(id: string): boolean {
    const slot = this.idx.get(id);
    if (slot === undefined) return false;
    const last = this.count - 1;
    if (slot !== last) {
      this.vecs.copyWithin(slot * this.dim, last * this.dim, (last + 1) * this.dim);
      this.codes.copyWithin(slot * this.words, last * this.words, (last + 1) * this.words);
      this.ids[slot] = this.ids[last];
      this.meta[slot] = this.meta[last];
      this.idx.set(this.ids[slot], slot);
    }
    this.ids.pop();
    this.meta.pop();
    this.idx.delete(id);
    this.count--;
    return true;
  }

  // normalize + binary-code `rec` into the given slot, maintaining the id index.
  private writeAt(slot: number, rec: KbRecord<M>): void {
    if (rec.vector.length !== this.dim) {
      throw new Error(`Kb: vector length ${rec.vector.length} != dim ${this.dim} (id=${rec.id})`);
    }
    const vOff = slot * this.dim;
    let ss = 0;
    for (let d = 0; d < this.dim; d++) { const x = rec.vector[d]; this.vecs[vOff + d] = x; ss += x * x; }
    const inv = 1 / (Math.sqrt(ss) || 1);
    const cOff = slot * this.words;
    for (let w = 0; w < this.words; w++) {
      let bits = 0;
      const base = vOff + (w << 5);
      const lim = Math.min(32, this.dim - (w << 5));
      for (let b = 0; b < lim; b++) { this.vecs[base + b] *= inv; if (this.vecs[base + b] > 0) bits |= 1 << b; }
      this.codes[cOff + w] = bits >>> 0;
    }
    this.ids[slot] = rec.id;
    this.meta[slot] = (rec.data as M) ?? (undefined as M);
    this.idx.set(rec.id, slot);
  }

  /** Embed `text` via the configured embedder, then search. */
  async searchText(text: string, opts: KbSearchOptions = {}): Promise<KbHit<M>[]> {
    return this.search(await this.embedQuery(text), opts);
  }

  /** Embed and upsert text records (id + text + optional data). Searchable immediately. */
  async addText(records: { id: string; text: string; data?: M }[]): Promise<void> {
    const vectors = await this.embedTexts(records.map((r) => r.text));
    this.add(records.map((r, i) => ({ id: r.id, vector: vectors[i], data: r.data })));
  }

  private async embedTexts(texts: string[]): Promise<Float32Array[]> {
    if (this.embedder) return this.embedder.embed(texts);
    if (this.embedFn) return Promise.all(texts.map(async (t) => Float32Array.from(await this.embedFn!(t))));
    throw new Error("Kb: no embedder configured; pass `embedder` (or `embed`) in options");
  }
  private async embedQuery(text: string): Promise<Float32Array> {
    return (await this.embedTexts([text]))[0];
  }

  /** k-NN search by query vector (cosine). */
  search(query: ArrayLike<number>, opts: KbSearchOptions = {}): KbHit<M>[] {
    if (query.length !== this.dim) throw new Error(`Kb: query length ${query.length} != dim ${this.dim}`);
    const topK = Math.max(1, Math.min(opts.topK ?? 10, this.count));
    if (this.count === 0) return [];

    // normalize query
    const q = new Float32Array(this.dim);
    let ss = 0;
    for (let d = 0; d < this.dim; d++) { q[d] = query[d]; ss += q[d] * q[d]; }
    const inv = 1 / (Math.sqrt(ss) || 1);
    for (let d = 0; d < this.dim; d++) q[d] *= inv;

    const ids = this.count <= this.exactThreshold ? this.exact(q, topK) : this.ann(q, topK, opts.rerankDepth);
    return ids.map(([i, score]) => ({ id: this.ids[i], score, data: this.meta[i] }));
  }

  // exact f32 brute-force -> [index, score][]
  private exact(q: Float32Array, topK: number): [number, number][] {
    return this.rerankTopK(q, topK, null, this.count);
  }

  // binary prefilter -> f32 rerank
  private ann(q: Float32Array, topK: number, rerankDepth?: number): [number, number][] {
    const depth = Math.min(
      this.count,
      rerankDepth ?? Math.max(topK * 20, Math.ceil(this.count * 0.005)),
    );
    // pack query sign bits
    const qc = new Uint32Array(this.words);
    for (let w = 0; w < this.words; w++) {
      let bits = 0;
      const base = w << 5;
      const lim = Math.min(32, this.dim - base);
      for (let b = 0; b < lim; b++) if (q[base + b] > 0) bits |= 1 << b;
      qc[w] = bits >>> 0;
    }
    // hamming distance + counting-sort to pull the `depth` closest candidates
    const dists = new Int32Array(this.count);
    const counts = new Int32Array(this.dim + 2);
    for (let i = 0; i < this.count; i++) {
      let h = 0;
      const co = i * this.words;
      for (let w = 0; w < this.words; w++) h += popcount((this.codes[co + w] ^ qc[w]) >>> 0);
      dists[i] = h;
      counts[h]++;
    }
    let acc = 0;
    for (let d = 0; d <= this.dim; d++) { const c = counts[d]; counts[d] = acc; acc += c; }
    const order = new Int32Array(this.count);
    for (let i = 0; i < this.count; i++) order[counts[dists[i]]++] = i;
    return this.rerankTopK(q, topK, order, depth);
  }

  // rerank `limit` candidates (order==null => all indices 0..limit) by f32 cosine, keep topK
  private rerankTopK(q: Float32Array, topK: number, order: Int32Array | null, limit: number): [number, number][] {
    const ids = new Int32Array(topK).fill(-1);
    const sc = new Float64Array(topK).fill(-Infinity);
    let filled = 0;
    for (let j = 0; j < limit; j++) {
      const i = order ? order[j] : j;
      const off = i * this.dim;
      let dot = 0;
      for (let d = 0; d < this.dim; d++) dot += this.vecs[off + d] * q[d];
      if (dot > sc[topK - 1]) {
        let p = topK - 1;
        while (p > 0 && sc[p - 1] < dot) { sc[p] = sc[p - 1]; ids[p] = ids[p - 1]; p--; }
        sc[p] = dot;
        ids[p] = i;
        if (filled < topK) filled++;
      }
    }
    const out: [number, number][] = [];
    for (let p = 0; p < filled; p++) out.push([ids[p], sc[p]]);
    return out;
  }

  private ensure(n: number): void {
    if (n <= this.capacity) return;
    let cap = Math.max(this.capacity || 16, 16);
    while (cap < n) cap *= 2;
    const v = new Float32Array(cap * this.dim);
    v.set(this.vecs.subarray(0, this.count * this.dim));
    this.vecs = v;
    const c = new Uint32Array(cap * this.words);
    c.set(this.codes.subarray(0, this.count * this.words));
    this.codes = c;
    this.capacity = cap;
  }

  /**
   * Serialize to a compact binary buffer (for build-time freeze and loading as a
   * static asset on Workers). Layout: [u32 jsonLen][json][pad to 4][f32 vecs][u32 codes].
   */
  serialize(): Uint8Array {
    const header = JSON.stringify({ v: 1, dim: this.dim, count: this.count, exactThreshold: this.exactThreshold, ids: this.ids, data: this.meta });
    const json = new TextEncoder().encode(header);
    const jsonPad = (json.length + 3) & ~3;
    const vecsBytes = this.count * this.dim * 4;
    const codesBytes = this.count * this.words * 4;
    const total = 4 + jsonPad + vecsBytes + codesBytes;
    const buf = new ArrayBuffer(total);
    new DataView(buf).setUint32(0, json.length, true);
    new Uint8Array(buf, 4, json.length).set(json);
    new Float32Array(buf, 4 + jsonPad, this.count * this.dim).set(this.vecs.subarray(0, this.count * this.dim));
    new Uint32Array(buf, 4 + jsonPad + vecsBytes, this.count * this.words).set(this.codes.subarray(0, this.count * this.words));
    return new Uint8Array(buf);
  }

  /** Load a Kb from a buffer produced by {@link serialize}. */
  static load<M>(bytes: Uint8Array, opts?: { embedder?: Embedder; embed?: KbOptions["embed"] }): Kb<M> {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const jsonLen = new DataView(buf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jsonLen)));
    const jsonPad = (jsonLen + 3) & ~3;
    const kb = new Kb<M>({ dim: header.dim, exactThreshold: header.exactThreshold, embedder: opts?.embedder, embed: opts?.embed });
    const words = (header.dim + 31) >> 5;
    const vecsBytes = header.count * header.dim * 4;
    kb.ids = header.ids;
    kb.meta = header.data;
    kb.count = header.count;
    kb.capacity = header.count;
    kb.vecs = new Float32Array(buf, 4 + jsonPad, header.count * header.dim);
    kb.codes = new Uint32Array(buf, 4 + jsonPad + vecsBytes, header.count * words);
    for (let i = 0; i < kb.count; i++) kb.idx.set(kb.ids[i], i);
    return kb;
  }
}
