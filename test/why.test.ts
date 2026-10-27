import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, type Link } from "../src/store.ts";
import { ask } from "../src/ask.ts";
import { keywords, resolveTarget, why } from "../src/why.ts";

function brain(): Store {
  const s = new Store(":memory:");
  const ts = "2026-10-27T06:42:00.000Z";
  const link = (src: string, dst: string, rel: string, evidence: string, how: Link["how"] = "recorded") =>
    s.addLink({ src, dst, rel, how, evidence, by: "test", ts });
  s.addMemory({ ref: "decision:D1", kind: "decision", ts, title: "D1. Separate project, fresh repository", body: "**Decision.** Own repo.\n\n**Why.** Judges can diff against the old code.", source: "t" });
  s.addMemory({ ref: "decision:D7", kind: "decision", ts, title: "D7. Models: hybrid", body: "**Why.** Privacy.", source: "t" });
  s.addMemory({ ref: "decision:D11", kind: "decision", ts: "2026-10-27T07:30:00.000Z", title: "D11. All LLM work hosted", body: "**Decision.** Revises D7.\n\n**Why.** The owner has the credit.", source: "t" });
  s.addMemory({ ref: "doc:DECISIONS.md@aaa", kind: "doc-version", ts, title: "DECISIONS.md @ aaa", body: "...", source: "t" });
  s.addMemory({ ref: "commit:aaa1111111", kind: "commit", ts, title: "Seed decisions", body: "", source: "t" });
  s.addMemory({ ref: "commit:bbb2222222", kind: "commit", ts: "2026-10-27T07:40:00.000Z", title: "Gate before phrasing. Acts on D11.", body: "", source: "t" });
  link("decision:D1", "doc:DECISIONS.md@aaa", "recorded-in", "### D1.");
  link("decision:D7", "doc:DECISIONS.md@aaa", "recorded-in", "### D7.");
  link("commit:aaa1111111", "doc:DECISIONS.md@aaa", "wrote", "A");
  link("decision:D11", "decision:D7", "revises", '"Revises D7"');
  link("commit:bbb2222222", "decision:D11", "cites", '"Acts on D11"');
  link("commit:bbb2222222", "file:src/gate.ts", "touches", "A");
  return s;
}

test("keywords drop stop words and short words", () => {
  assert.deepEqual(keywords("Why is the repo separate from One Connect?"), ["repo", "separate", "one", "connect"]);
});

test("resolveTarget: explicit decision, path, sha, then keyword match marked inferred", () => {
  const s = brain();
  assert.equal(resolveTarget(s, "why D7")?.ref, "decision:D7");
  assert.equal(resolveTarget(s, "why does src/gate.ts exist?")?.ref, "file:src/gate.ts");
  assert.equal(resolveTarget(s, "why bbb2222")?.ref, "commit:bbb2222222");
  const t = resolveTarget(s, "why is the repo separate from the old project?");
  assert.equal(t?.ref, "decision:D1");
  assert.equal(t?.how, "inferred");
  assert.equal(resolveTarget(s, "why is the sky blue"), undefined);
  s.close();
});

test("a why-chain from a file walks to the decision over recorded links and is supported", () => {
  const s = brain();
  const a = why(s, "why is src/gate.ts like this?");
  assert.equal(a.label, "supported");
  assert.match(a.lead, /file:src\/gate\.ts traces to D11, D7 over 4 recorded links/);
  assert.match(why(s, "why D11").lead, /^D11 rests on D7; /);
  assert.match(why(s, "why D1").lead, /^D1 stands on its own record; 2 recorded links\.$/);
  const texts = a.steps.map((st) => st.text);
  assert.match(texts[1]!, /^touches \(recorded, A\): commit bbb2222 .*Gate before phrasing/);
  assert.match(texts[2]!, /cites \(recorded, "Acts on D11"\): D11\. All LLM work hosted \(2026-10-27\): The owner has the credit\./);
  assert.match(texts[3]!, /revises \(recorded, "Revises D7"\): D7\. Models: hybrid/);
  assert.equal(a.steps[0]!.cites.length, 0, "a file is not a memory; the target line cites nothing");
  assert.ok(a.steps.slice(1).every((st) => st.cites.length === 1));
  assert.equal(a.inputs.decisions_reached, 2);
  s.close();
});

test("a keyword-resolved target lowers the label and says so", () => {
  const s = brain();
  const a = ask(s, "why is the repo separate from the old project?");
  assert.equal(a.label, "insufficient evidence");
  assert.equal(a.inputs.target_how, "inferred");
  assert.match(a.steps[0]!.text, /^inferred target \(question words "repo", "separate"/);
  assert.match(a.steps[1]!.text, /recorded-in .*DECISIONS\.md @ aaa/);
  assert.match(a.steps[2]!.text, /wrote .*commit aaa1111 .*Seed decisions/);
  s.close();
});

test("a why question about nothing known is refused", () => {
  const s = brain();
  const a = ask(s, "why is the sky blue?");
  assert.equal(a.label, "insufficient evidence");
  assert.match(a.refusal ?? "", /Name a decision/);
  s.close();
});
