import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.ts";
import { ask, parseWindow, render } from "../src/ask.ts";

const NOW = new Date(2026, 9, 27, 15, 0, 0); // local 2026-10-27 15:00

test("parseWindow understands today, yesterday and a date", () => {
  assert.equal(parseWindow("what happened today", NOW)?.name, "2026-10-27");
  assert.equal(parseWindow("what happened yesterday?", NOW)?.name, "2026-10-26");
  assert.equal(parseWindow("what happened on 2026-10-25", NOW)?.name, "2026-10-25");
  assert.equal(parseWindow("why is the sky blue", NOW), undefined);
});

test("what happened today is answered from memories with citations and a computed label", () => {
  const s = new Store(":memory:");
  const inDay = new Date(2026, 9, 27, 2, 42, 1).toISOString();
  const otherDay = new Date(2026, 9, 26, 12, 0, 0).toISOString();
  s.addMemory({ ref: "commit:aaa1111", kind: "commit", ts: inDay, title: "Start Blackbox", body: "", source: "git:r", meta: { short: "aaa1111", files: ["A README.md", "A .gitignore"] } });
  s.addMemory({ ref: "commit:bbb2222", kind: "commit", ts: otherDay, title: "earlier", body: "", source: "git:r" });
  s.addMemory({ ref: "branch:main", kind: "branch", ts: inDay, title: "main", body: "at aaa1111", source: "git:r" });

  const a = ask(s, "what happened today", NOW);
  assert.equal(a.label, "supported");
  assert.equal(a.lead, "On 2026-10-27: 1 commit, 1 branch.");
  assert.deepEqual(a.steps.map((st) => st.cites[0]), ["commit:aaa1111", "branch:main"]);
  assert.match(a.steps[0]!.text, /commit aaa1111: Start Blackbox \(2 files\)/);
  assert.equal(a.inputs.memories_in_window, 2);
  assert.match(render(a), /\[commit:aaa1111\]/);
  s.close();
});

test("an empty window is labeled insufficient evidence, not invented", () => {
  const s = new Store(":memory:");
  const a = ask(s, "what happened on 2026-10-20", NOW);
  assert.equal(a.label, "insufficient evidence");
  assert.equal(a.steps.length, 0);
  assert.match(a.lead, /Nothing is recorded for 2026-10-20/);
  s.close();
});

test("questions the engine cannot answer yet are refused honestly", () => {
  const s = new Store(":memory:");
  const a = ask(s, "how many files are there", NOW);
  assert.equal(a.label, "insufficient evidence");
  assert.match(a.refusal ?? "", /Answerable today/);
  s.close();
});
