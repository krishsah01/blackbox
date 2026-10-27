import { test } from "node:test";
import assert from "node:assert/strict";
import { containsErased, redact, redactDeep } from "../src/redact.ts";

test("known key shapes are replaced and labeled", () => {
  const r = redact("token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab and AKIAABCDEFGHIJKLMNOP");
  assert.equal(r.text, "token [redacted:known-key] and [redacted:known-key]");
  assert.deepEqual(r.hits, [{ kind: "known-key", count: 2 }]);
  assert.equal(r.changed, true);
});

test("assignments keep the key name and drop the value", () => {
  const r = redact('META_API_KEY=abcd1234efgh and "password": "hunter22x"');
  assert.equal(r.text, 'META_API_KEY=[redacted:assignment] and "password": "[redacted:assignment]"');
  assert.equal(r.hits.find((h) => h.kind === "assignment")?.count, 2);
});

test("private key blocks go whole", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\nabc\n-----END RSA PRIVATE KEY-----";
  const r = redact(`before ${pem} after`);
  assert.equal(r.text, "before [redacted:private-key] after");
});

test("emails and bearer tokens", () => {
  const r = redact("mail krish@example.com with Authorization: Bearer abcDEF123456789xyz");
  assert.equal(r.text, "mail [redacted:email] with Authorization: Bearer [redacted:bearer]");
});

test("git SHAs and ordinary prose survive", () => {
  const sha = "f3ce464a1b2c3d4e5f60718293a4b5c6d7e8f901";
  const text = `commit ${sha} Start Blackbox: README and .gitignore on 2026-10-27`;
  const r = redact(text);
  assert.equal(r.text, text);
  assert.equal(r.changed, false);
});

test("long mixed-class tokens are caught, hex is not", () => {
  const r = redact("x aB3dE6fG9hI2jK5lM8nO1pQ4rS7tU0vW3xY6z y 0123456789abcdef0123456789abcdef0123456789");
  assert.equal(r.text, "x [redacted:token] y 0123456789abcdef0123456789abcdef0123456789");
});

test("erased values are replaced wherever they appear, longest first", () => {
  const r = redact("the key is plumage-7 and plumage-7-long too", { denylist: ["plumage-7", "plumage-7-long"] });
  assert.equal(r.text, "the key is [redacted:erased] and [redacted:erased] too");
  assert.deepEqual(r.hits, [{ kind: "erased", count: 2 }]);
  assert.equal(containsErased(r.text, ["plumage-7"]), false);
  assert.equal(containsErased("still plumage-7 here", ["plumage-7"]), true);
});

test("markers are never redacted twice", () => {
  const once = redact("API_KEY=verysecretvalue");
  const twice = redact(once.text);
  assert.equal(twice.text, once.text);
  assert.equal(twice.changed, false);
});

test("redactDeep walks objects and arrays, leaves keys and numbers alone", () => {
  const { value, hits } = redactDeep({
    title: "fix",
    n: 3,
    notes: ["mail a@b.co", { token: "token=abcdefgh12" }],
  });
  assert.deepEqual(value, {
    title: "fix",
    n: 3,
    notes: ["mail [redacted:email]", { token: "token=[redacted:assignment]" }],
  });
  assert.equal(hits.length, 2);
});
