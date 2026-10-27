import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../src/store.ts";
import { intakeGit, readCommits } from "../src/intake/git.ts";
import { intakeDocs, readDocVersions } from "../src/intake/docs.ts";
import { declaredRelations, intakeDecisionsFromVersions, parseDecisions } from "../src/intake/decisions.ts";

const D1 = `## Settled

### D1. Separate project, fresh repository (2026-10-27)

**Decision.** Own repo.

**Why.** Judges can diff.
`;
const D2 = `
### D2. Models: hybrid (2026-10-27)

**Decision.** Local by default.
`;
const D3 = `
### D3. All LLM work hosted (2026-10-28)

**Decision.** Revises the local half of D2 and narrows D1. See also D1.

## Open

- a question
`;

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "blackbox-docs-"));
  const env = (date: string) => ({
    ...process.env,
    GIT_AUTHOR_NAME: "T",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "T",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
  const g = (date: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: env(date) });
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  writeFileSync(join(dir, "DECISIONS.md"), D1);
  writeFileSync(join(dir, "notes.txt"), "not a doc\n");
  g("2026-10-27T06:00:00-04:00", "add", ".");
  g("2026-10-27T06:00:00-04:00", "commit", "-q", "-m", "Seed D1");
  writeFileSync(join(dir, "DECISIONS.md"), D1 + D2);
  g("2026-10-27T07:00:00-04:00", "add", ".");
  g("2026-10-27T07:00:00-04:00", "commit", "-q", "-m", "Add D2");
  writeFileSync(join(dir, "DECISIONS.md"), D1 + D2 + D3);
  writeFileSync(join(dir, "README.md"), "# r\n");
  g("2026-10-28T06:00:00-04:00", "add", ".");
  g("2026-10-28T06:00:00-04:00", "commit", "-q", "-m", "Add D3 and README");
  return dir;
}

test("parseDecisions reads ids, titles, dates, bodies and sections", () => {
  const ds = parseDecisions(D1 + D2 + D3);
  assert.deepEqual(ds.map((d) => d.id), ["D1", "D2", "D3"]);
  assert.equal(ds[0]!.title, "Separate project, fresh repository");
  assert.equal(ds[0]!.date, "2026-10-27");
  assert.match(ds[0]!.body, /Judges can diff/);
  assert.equal(ds[2]!.section, "Settled");
  assert.doesNotMatch(ds[2]!.body, /a question/, "the Open section is not part of D3");
});

test("declaredRelations: revises and narrows beat plain cites", () => {
  const d = parseDecisions(D3)[0]!;
  const rels = declaredRelations(d).map((r) => `${r.rel} ${r.id}`);
  assert.deepEqual(rels, ["revises D2", "narrows D1"]);
  assert.match(declaredRelations(d)[0]!.span, /Revises the local half of D2/);
});

test("every committed version of a doc is a memory; decisions are versioned by wording", async () => {
  const repo = makeRepo();
  try {
    const versions = await readDocVersions(repo);
    assert.deepEqual(
      versions.map((v) => `${v.path}@${v.sha.slice(0, 2)}`.slice(0, 12)).map((s) => s.split("@")[0]),
      ["DECISIONS.md", "DECISIONS.md", "DECISIONS.md", "README.md"],
    );
    assert.equal(versions[1]!.prevSha, versions[0]!.sha);

    const s = new Store(":memory:");
    const commits = await readCommits(repo);
    await intakeGit(s, repo);
    const dr = await intakeDocs(s, repo, commits);
    assert.equal(dr.versions, 4);
    const decs = s.memories({ kind: "doc-version" }).filter((m) => m.meta?.path === "DECISIONS.md");
    assert.equal(decs.length, 3);
    // file:DECISIONS.md points at exactly one current version, the newest.
    const current = s.links({ src: "file:DECISIONS.md", rel: "current" });
    assert.equal(current.length, 1);
    assert.equal(current[0]!.dst, decs[2]!.ref);
    assert.equal(s.links({ src: decs[2]!.ref, rel: "supersedes" })[0]?.dst, decs[1]!.ref);
    assert.equal(s.links({ dst: decs[0]!.ref, rel: "wrote" })[0]?.src, `commit:${versions[0]!.sha}`);

    const r = intakeDecisionsFromVersions(s, versions.filter((v) => v.path === "DECISIONS.md"), `git:${repo}`);
    assert.equal(r.decisions, 3);
    assert.equal(r.versions, 3, "unchanged wording across versions is not a new version");
    const d1 = s.memory("decision:D1")!;
    assert.equal(d1.ts, new Date("2026-10-27T06:00:00-04:00").toISOString(), "a decision's moment is the commit that first recorded it");
    assert.equal(d1.meta?.date, "2026-10-27");
    assert.equal(s.memory("decision:D3")?.title, "D3. All LLM work hosted");

    const d3links = s.links({ src: "decision:D3" }).map((l) => `${l.rel} ${l.dst}`);
    assert.ok(d3links.includes("revises decision:D2"));
    assert.ok(d3links.includes("narrows decision:D1"));
    assert.ok(d3links.some((x) => x.startsWith("recorded-in doc:DECISIONS.md@")));
    assert.ok(!d3links.includes("cites decision:D1"), "a narrowed decision is not also a plain cite");

    // Idempotent.
    const again = intakeDecisionsFromVersions(s, versions.filter((v) => v.path === "DECISIONS.md"), `git:${repo}`);
    assert.equal(again.versions, 0);
    assert.equal(again.links, 0);
    s.close();
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
