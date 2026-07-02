import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, createSearch } from "../src/search.ts";

// HTML-sourced search: the index is built from rendered HTML — clean text for BM25, and each
// section keeps its HTML for a rich (formatted) preview. See search.ts htmlToText/splitHtmlByHeadings.

test("htmlToText: strips tags, decodes entities, collapses whitespace, drops script/style", () => {
  assert.equal(htmlToText("<p>Hello <code>x&amp;y</code></p>\n<table><tr><td>A</td><td>B</td></tr></table>"), "Hello x&y A B");
  assert.equal(htmlToText("<style>.x{}</style><script>bad()</script><p>ok</p>"), "ok");
  assert.equal(htmlToText("a &lt;b&gt; &quot;c&quot; &#39;d&#39;"), "a <b> \"c\" 'd'");
});

const entries = [
  {
    slug: "feishu",
    html: "<h1>Feishu</h1><p>intro</p><h2>Configuration</h2><p>Set <code>FEISHU_APP_ID</code>.</p>" +
      "<table><thead><tr><th>Key</th></tr></thead><tbody><tr><td>feishu.appId</td></tr></tbody></table>",
    data: { title: "Feishu" },
  },
] as never[];

test("createSearch(html): hits carry rendered section HTML + a clean plaintext snippet", async () => {
  const s = createSearch({ entries });
  const hits = await s.search("configuration", { mode: "keyword" });
  const h = hits[0]!;
  assert.equal(h.slug, "feishu");
  assert.equal(h.headingId, "configuration"); // id from the SAME slugger as processHtml → deep-link matches
  assert.ok(h.html!.includes("<code>FEISHU_APP_ID</code>"), "preview keeps the rendered markup");
  assert.ok(h.html!.includes("<table"), "preview keeps the table");
  assert.ok(!/[<>]/.test(h.text), "the text snippet is clean plaintext (no tags)"); // fallback excerpt
});

test("createSearch(html): index text is clean — a code identifier inside markup is searchable", async () => {
  const s = createSearch({ entries });
  const hits = await s.search("FEISHU_APP_ID", { mode: "keyword" });
  assert.equal(hits[0]?.slug, "feishu"); // the token inside <code> is indexed as plain text
});
