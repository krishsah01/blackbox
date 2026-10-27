import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, type Memory } from "../src/store.ts";

const tick = () => {
  let n = 0;
  return () => `2026-10-27T10:00:${String(n++).padStart(2, "0")}.000Z`;
};

const commit = (sha: string, title: string, body = ""): Memory => ({
  ref: `commit:${sha}`,
  kind: "commit",
  ts: "2026-10-27T06:42:01.000Z",
  title,
  body,
  source: "git:/repo",
});

test("memories and links round-trip through the event log", () => {
  const s = new Store(":memory:", { now: tick() });
  const r1 = s.addMemory(commit("f3ce464", "Start Blackbox"));
  assert.equal(r1.added, true);
  const r2 = s.addLink({
    src: "commit:f3ce464",
    dst: "file:README.md",
    rel: "touches",
    how: "recorded",
    evidence: "A",
    by: "intake:git",
    ts: "2026-10-27T06:42:01.000Z",
  });
  assert.equal(r2.added, true);
  assert.equal(s.eventCount(), 2);
  assert.equal(s.memory("commit:f3ce464")?.title, "Start Blackbox");
  assert.deepEqual(
    s.links({ dst: "file:README.md" }).map((l) => l.src),
    ["commit:f3ce464"],
  );
  s.close();
});

test("appending the same memory twice adds one event", () => {
  const s = new Store(":memory:", { now: tick() });
  assert.equal(s.addMemory(commit("abc", "one")).added, true);
  assert.equal(s.addMemory(commit("abc", "one")).added, false);
  assert.equal(s.eventCount(), 1);
  s.close();
});

test("events cannot be updated or deleted", () => {
  const s = new Store(":memory:", { now: tick() });
  s.addMemory(commit("abc", "one"));
  assert.throws(() => s.db.exec("UPDATE events SET payload = '{}'"), /append-only/);
  assert.throws(() => s.db.exec("DELETE FROM events"), /append-only/);
  assert.equal(s.eventCount(), 1);
  s.close();
});

test("secrets are redacted before they reach the log, denylist first", () => {
  const s = new Store(":memory:", { now: tick(), denylist: ["plumage-7"] });
  const r = s.addMemory(commit("abc", "add key plumage-7", "META_API_KEY=abcdef123456 mail a@b.co"));
  assert.deepEqual(
    r.hits.map((h) => h.kind).sort(),
    ["assignment", "email", "erased"],
  );
  const m = s.memory("commit:abc")!;
  assert.equal(m.title, "add key [redacted:erased]");
  assert.equal(m.body, "META_API_KEY=[redacted:assignment] mail [redacted:email]");
  // The raw log holds the redacted text too; nothing else was ever written.
  const raw = JSON.stringify(s.events());
  assert.doesNotMatch(raw, /plumage-7|abcdef123456|a@b\.co/);
  s.close();
});

test("rebuild replays the log into identical derived tables", () => {
  const s = new Store(":memory:", { now: tick() });
  s.addMemory(commit("a1", "first"));
  s.addMemory({ ...commit("a2", "second"), ts: "2026-10-28T00:00:00.000Z" });
  s.addLink({ src: "commit:a2", dst: "commit:a1", rel: "parent", how: "recorded", evidence: "a1", by: "intake:git", ts: "2026-10-28T00:00:00.000Z" });
  const before = { m: s.memories(), l: s.links() };
  assert.equal(s.rebuild(), 3);
  assert.deepEqual({ m: s.memories(), l: s.links() }, before);
  s.close();
});

test("memory queries filter by kind and time window", () => {
  const s = new Store(":memory:", { now: tick() });
  s.addMemory({ ...commit("a1", "day one"), ts: "2026-10-27T12:00:00.000Z" });
  s.addMemory({ ...commit("a2", "day two"), ts: "2026-10-28T12:00:00.000Z" });
  s.addMemory({ ref: "branch:main", kind: "branch", ts: "2026-10-28T12:00:00.000Z", title: "main", body: "", source: "git:/repo" });
  assert.deepEqual(
    s.memories({ since: "2026-10-27T00:00:00.000Z", until: "2026-10-28T00:00:00.000Z" }).map((m) => m.title),
    ["day one"],
  );
  assert.deepEqual(s.memories({ kind: "branch" }).map((m) => m.ref), ["branch:main"]);
  assert.equal(s.newest(), "2026-10-28T12:00:00.000Z");
  s.close();
});

test("unknown memory kinds are refused", () => {
  const s = new Store(":memory:", { now: tick() });
  assert.throws(() => s.addMemory({ ...commit("x", "x"), kind: "wish" as never }), /unknown memory kind/);
  s.close();
});

test("a pointer link (branch at commit) keeps one current target; the log keeps every position", () => {
  const s = new Store(":memory:", { now: tick() });
  const at = (sha: string, ts: string) => s.addLink({ src: "branch:main", dst: `commit:${sha}`, rel: "at", how: "recorded", evidence: sha, by: "intake:git", ts });
  at("a1", "2026-10-27T01:00:00.000Z");
  at("a2", "2026-10-27T02:00:00.000Z");
  assert.deepEqual(s.links({ src: "branch:main", rel: "at" }).map((l) => l.dst), ["commit:a2"]);
  assert.equal(s.eventCount(), 2);
  s.rebuild();
  assert.deepEqual(s.links({ src: "branch:main", rel: "at" }).map((l) => l.dst), ["commit:a2"]);
  s.close();
});

test("a memory re-added under a new key is a new version; the derived row is the newest", () => {
  const s = new Store(":memory:", { now: tick() });
  const b = (sha: string) => ({ ref: "branch:main", kind: "branch" as const, ts: "2026-10-27T01:00:00.000Z", title: "main", body: `at ${sha}`, source: "git:/repo" });
  assert.equal(s.addMemory(b("a1"), "branch:main@a1").added, true);
  assert.equal(s.addMemory(b("a1"), "branch:main@a1").added, false);
  assert.equal(s.addMemory(b("a2"), "branch:main@a2").added, true);
  assert.equal(s.memory("branch:main")?.body, "at a2");
  assert.equal(s.eventCount(), 2);
  s.close();
});
