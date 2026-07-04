// Locale-scoped search — the S-matrix unit rows. The locale MODEL under test: a locale's view is
// the MERGED set (its translations + untranslated defaults, June's docs(locale) lister); scoping a
// search means results come from that view — translated pages match in their language, untranslated
// pages stay findable via the default text, and a translated page's default-language text never
// leaks into the locale's results.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createSearch } from "../src/search.ts";
import type { DocLike } from "../src/nav.ts";
import type { Embedder } from "@kurajs/core";

const E = (slug: string, title: string, body: string, locale?: string): DocLike =>
  ({ slug, data: { title, section: "" }, body, html: "", original: "", ...(locale ? { locale } : {}) }) as unknown as DocLike;

// en defaults + a zh-TW variant for "vec" only ("guide" is untranslated).
const EN = [E("guide", "Install guide", "installation guide covers setup and prerequisites"), E("vec", "Vector search", "the vector search engine builds an index")];
const ZH_VEC = E("vec", "向量搜尋", "本文介紹向量搜尋引擎如何運作與索引建立", "zh-TW");
const entriesFor = (l: string): DocLike[] => (l === "zh-TW" ? [EN[0]!, ZH_VEC] : EN);
const I18N = { defaultLocale: "en", entriesFor, knownLocales: ["en", "zh-TW"] };

describe("keyword scoping (S01/S02/S05-keyword)", () => {
  const s = createSearch({ entries: EN, ...I18N });
  test("S01 a CJK query scoped to zh-TW hits the zh variant; scoped to en it does not", async () => {
    const zh = await s.search("向量搜尋", { locale: "zh-TW", mode: "keyword" });
    assert.equal(zh[0]?.slug, "vec");
    assert.equal(zh[0]?.locale, "zh-TW");
    const en = await s.search("向量搜尋", { locale: "en", mode: "keyword" });
    assert.equal(en.some((h) => h.locale === "zh-TW"), false);
  });
  test("S02 untranslated pages stay findable in a locale's view (default-text fallback)", async () => {
    const hits = await s.search("installation prerequisites", { locale: "zh-TW", mode: "keyword" });
    assert.equal(hits[0]?.slug, "guide");
    assert.equal(hits[0]?.locale, undefined); // the default entry, served as fallback
  });
  test("S05k a translated slug's default-language text does not leak into the locale's view", async () => {
    // "vector engine" only matches vec's EN body; in the zh-TW view vec is the zh variant.
    const hits = await s.search("vector engine", { locale: "zh-TW", mode: "keyword" });
    assert.equal(hits.some((h) => h.slug === "vec"), false);
  });
});

describe("defaults + degradation (S03/S04/S07)", () => {
  test("S03 REGRESSION (red pre-fix): a CJK-default-locale site tokenizes its own corpus correctly", async () => {
    const zhSite = [E("intro", "介紹", "本文介紹向量搜尋引擎如何運作"), E("faq", "常見問題", "常見問題與疑難排解")];
    const s = createSearch({ entries: zhSite, defaultLocale: "zh-TW", knownLocales: ["zh-TW"] });
    const hits = await s.search("向量搜尋", { mode: "keyword" });
    assert.equal(hits[0]?.slug, "intro"); // pre-fix: locale-less entries latin-tokenized → no hit
  });
  test("S04 defaultLocale is an identity default for latin sites", async () => {
    const plain = createSearch({ entries: EN });
    const withDefault = createSearch({ entries: EN, defaultLocale: "en" });
    for (const q of ["installation", "vector search engine", "guide setup"]) {
      assert.deepEqual(
        JSON.stringify(await withDefault.search(q, { mode: "keyword" })),
        JSON.stringify(await plain.search(q, { mode: "keyword" })),
      );
    }
  });
  test("S07 unknown locales behave as unset (declared tags only; bounded caches)", async () => {
    const s = createSearch({ entries: EN, ...I18N });
    const base = JSON.stringify(await s.search("vector", { mode: "keyword" }));
    for (const bogus of ["xx", "ZH-TW", "zh", "../../etc", ""]) {
      assert.equal(JSON.stringify(await s.search("vector", { locale: bogus, mode: "keyword" })), base);
    }
  });
});

describe("corpus-shaped entries + tokens (S08/S09)", () => {
  test("S08 heading-sectioned html entries yield anchored hits (the static-client seam, DOM-free)", async () => {
    const entry = {
      slug: "page",
      data: { title: "頁面" },
      locale: "zh-TW",
      html: "<h2>安裝步驟</h2><p>先安裝相依套件與環境設定</p><h2>疑難排解</h2><p>常見錯誤與修復方式</p>",
      body: "",
      original: "",
    } as unknown as DocLike;
    const s = createSearch({ entries: [entry], defaultLocale: "en", knownLocales: ["en", "zh-TW"], entriesFor: () => [entry] });
    const hits = await s.search("安裝相依", { locale: "zh-TW", mode: "keyword" });
    assert.equal(hits[0]?.headingId, "安裝步驟");
    assert.ok(hits[0]?.html?.includes("相依套件"));
  });
  test("S09 tokensOf matches the scoped index's terms (highlight parity, CJK)", () => {
    const s = createSearch({ entries: EN, ...I18N });
    const toks = s.tokensOf("向量搜尋引擎", "zh-TW");
    assert.ok(toks.length >= 2, `CJK segmented: ${JSON.stringify(toks)}`);
  });
});

// Deterministic fake embedder (pattern from search.test.ts): a text's vector marks the keyword
// "markers" it contains, plus a baseline dim so no vector is all-zero.
function fakeEmbedder(markers: string[]): Embedder {
  const dim = markers.length + 1;
  return {
    id: "fake",
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((t) => {
        const lc = t.toLowerCase();
        const v = new Float32Array(dim);
        v[markers.length] = 0.1;
        markers.forEach((m, i) => { if (lc.includes(m)) v[i] = 1; });
        const norm = Math.hypot(...v) || 1;
        for (let i = 0; i < dim; i++) v[i] /= norm;
        return v;
      });
    },
  };
}

describe("hybrid scoping (S05/S06)", () => {
  test("S05 scoped hybrid: translated slug's default chunks excluded, untranslated defaults kept; unscoped byte-compatible", async () => {
    const a = E("a", "Alpha", "alpha concepts explained");
    const aJa = E("a", "アルファ", "アルファの概念", "ja");
    const b = E("b", "Beta", "alpha appears here too");
    const all = [a, b, aJa]; // the kb sees every chunk (mirrors the frozen index)
    const mk = () =>
      createSearch({
        entries: all,
        indexBytes: new Uint8Array(0),
        embedder: fakeEmbedder(["alpha"]),
        warm: false,
        defaultLocale: "en",
        knownLocales: ["en", "ja"],
        entriesFor: (l) => (l === "ja" ? [aJa, b] : [a, b]),
      });
    const ja = await mk().search("alpha", { locale: "ja" });
    assert.equal(ja.some((h) => h.slug === "a" && h.locale !== "ja"), false); // no EN 'a' leak
    assert.equal(ja.some((h) => h.slug === "b"), true); // untranslated fallback kept
    const unscoped = await mk().search("alpha", {});
    assert.equal(unscoped.some((h) => h.slug === "a" && !h.locale), true); // default view unchanged
  });
  test("S06 recall floor: a locale chunk below the unscoped cutoff survives scoping (filter + over-fetch)", async () => {
    // 40 EN pages (cosine ~1.0, all TRANSLATED) dominate the raw ranking; the ja page ranks ~41st
    // (cosine ~0.7). Unscoped depth = topK*4 = 12 never reaches it. Scoped to ja: the EN chunks of
    // translated slugs are filtered OUT, and the 64-deep fetch is what brings the ja page in at all.
    const many: DocLike[] = Array.from({ length: 40 }, (_, i) => E(`p-${i}`, `Alpha ${i}`, "alpha alpha"));
    const manyJa: DocLike[] = many.map((e) => E(e.slug, "アルファ", "アルファの説明", "ja"));
    const jaPage = E("ja-page", "アルファとベータ", "alpha beta together", "ja");
    const mk = () =>
      createSearch({
        entries: many,
        indexBytes: new Uint8Array(0),
        embedder: fakeEmbedder(["alpha", "beta"]),
        warm: false,
        defaultLocale: "en",
        knownLocales: ["en", "ja"],
        entriesFor: (l) => (l === "ja" ? [...manyJa, jaPage] : many),
      });
    // The kb must contain every chunk (mirrors the frozen all-locale index): build it from all.
    const sAll = createSearch({
      entries: [...many, ...manyJa, jaPage],
      indexBytes: new Uint8Array(0),
      embedder: fakeEmbedder(["alpha", "beta"]),
      warm: false,
      defaultLocale: "en",
      knownLocales: ["en", "ja"],
      entriesFor: (l) => (l === "ja" ? [...manyJa, jaPage] : many),
    });
    const unscoped = await sAll.search("alpha", { topK: 3 });
    assert.equal(unscoped.some((h) => h.slug === "ja-page"), false); // buried below the cutoff
    const ja = await sAll.search("alpha", { locale: "ja", topK: 3 });
    assert.equal(ja.some((h) => h.slug === "ja-page" && h.locale === "ja"), true); // rescued when scoped
    void mk;
  });
});


describe("tokenization-locale normalization (review follow-up)", () => {
  test("with DECLARED locales, an unknown tag tokenizes as unset (no arbitrary tokenizer-cache keys)", () => {
    const s = createSearch({ entries: EN, ...I18N });
    assert.deepEqual(s.tokensOf("向量搜尋引擎", "bogus-tag"), s.tokensOf("向量搜尋引擎", undefined));
  });
  test("WITHOUT declarations (legacy callers), the raw locale still drives tokenization", () => {
    const s = createSearch({ entries: EN });
    assert.ok(s.tokensOf("向量搜尋引擎", "zh-TW").length >= 2); // CJK segmentation preserved
  });
});
