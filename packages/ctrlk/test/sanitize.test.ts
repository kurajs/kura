import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { sanitizeHtml } from "../src/dom.ts";

// sanitizeHtml cleans TRUSTED, build-generated HTML before innerHTML (defense in depth). It takes a
// `doc`, so a happy-dom document tests it without global registration.
const doc = new (Window as unknown as { new (): { document: Document } })().document;
const clean = (html: string) => sanitizeHtml(html, doc);

test("keeps safe formatted markup (tables, code, links, lists)", () => {
  const html = "<p>Set <code>APP_ID</code>.</p><table><tr><td>a</td></tr></table><ul><li>x</li></ul><a href=\"/docs\">link</a>";
  const out = clean(html);
  assert.ok(out.includes("<code>APP_ID</code>"));
  assert.ok(out.includes("<table"));
  assert.ok(out.includes('href="/docs"'));
});

test("drops <script>/<style>/<iframe> and their content", () => {
  const out = clean("<p>ok</p><script>steal()</script><style>.x{}</style><iframe src=\"//evil\"></iframe>");
  assert.ok(out.includes("<p>ok</p>"));
  assert.ok(!/script|steal|<style|<iframe/i.test(out));
});

test("strips on* event handlers and javascript: URLs", () => {
  const out = clean("<a href=\"javascript:alert(1)\" onclick=\"alert(2)\">x</a><img src=\"x\" onerror=\"alert(3)\">");
  assert.ok(!/onclick|onerror|javascript:/i.test(out));
  assert.ok(out.includes("x")); // the link text survives, only the dangerous bits are removed
});
