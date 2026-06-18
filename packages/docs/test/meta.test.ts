import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMeta, validatePages } from "../src/meta.ts";

test("parseMeta: a valid meta parses with no errors", () => {
  const { meta, errors } = parseMeta({ title: "Payments", pages: ["index", "subscriptions"], defaultOpen: true }, "x");
  assert.deepEqual(errors, []);
  assert.deepEqual(meta, { title: "Payments", pages: ["index", "subscriptions"], defaultOpen: true });
});

test("parseMeta: unknown keys are rejected (typo guard)", () => {
  const { errors } = parseMeta({ title: "X", colour: "red" }, "f/meta.json");
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /unknown key "colour"/);
});

test("parseMeta: wrong field types are rejected", () => {
  assert.match(parseMeta({ title: 5 }, "x").errors[0]!, /"title" must be a string/);
  assert.match(parseMeta({ pages: "nope" }, "x").errors[0]!, /"pages" must be an array of strings/);
  assert.match(parseMeta({ pages: ["ok", 2] }, "x").errors[0]!, /"pages" must be an array of strings/);
  assert.match(parseMeta({ defaultOpen: "yes" }, "x").errors[0]!, /"defaultOpen" must be a boolean/);
});

test("parseMeta: non-objects are rejected", () => {
  assert.match(parseMeta(null, "x").errors[0]!, /must be a JSON object/);
  assert.match(parseMeta(["a"], "x").errors[0]!, /must be a JSON object/);
  assert.match(parseMeta("str", "x").errors[0]!, /must be a JSON object/);
});

test("validatePages: a pages entry with no matching child is an error", () => {
  const known = new Set(["index", "subscriptions", "one-time"]);
  const errs = validatePages({ pages: ["index", "subscriptions", "ghost"] }, known, "f/meta.json");
  assert.equal(errs.length, 1);
  assert.match(errs[0]!, /"ghost", which has no matching page or folder/);
});

test("validatePages: all-known pages (and no pages) produce no errors", () => {
  const known = new Set(["index", "a", "b"]);
  assert.deepEqual(validatePages({ pages: ["index", "a", "b"] }, known, "x"), []);
  assert.deepEqual(validatePages({ title: "X" }, known, "x"), []);
});
