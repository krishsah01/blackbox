import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../src/store.ts";
import { citedDecisions, intakeGit, readCommits } from "../src/intake/git.ts";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "blackbox-git-"));
  const g = (...args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Tester",
        GIT_AUTHOR_EMAIL: "t@example.com",
        GIT_COMMITTER_NAME: "Tester",
        GIT_COMMITTER_EMAIL: "t@example.com",
        GIT_AUTHOR_DATE: "2026-10-27T06:42:01-04:00",
        GIT_COMMITTER_DATE: "2026-10-27T06:42:01-04:00",
      },
    });
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  writeFileSync(join(dir, "README.md"), "# t\n");
  g("add", "README.md");
  g("commit", "-q", "-m", "Start: README\n\nAPI_KEY=supersecret123 must not survive. Acts on D1.");
  writeFileSync(join(dir, "DECISIONS.md"), "D1\n");
  writeFileSync(join(dir, "README.md"), "# t\nmore\n");
  g("add", ".");
  g("commit", "-q", "-m", "Seed decisions (D1, D7)");
  g("branch", "side");
  return dir;
}

test("citedDecisions finds each id once with a quoted span", () => {
  const out = citedDecisions("Acts on D3 and D7; D3 again. Not D12345 or XD4.");
  assert.deepEqual(
    out.map((d) => d.id),
    ["D3", "D7"],
  );
  assert.match(out[0]!.span, /Acts on D3 and D7/);
});

test("commits and branches become memories with recorded links", async () => {
  const repo = makeRepo();
  try {
    const commits = await readCommits(repo);
    assert.equal(commits.length, 2);
    assert.equal(commits[0]!.subject, "Seed decisions (D1, D7)");
    assert.deepEqual(commits[0]!.files.map((f) => `${f.status} ${f.path}`).sort(), ["A DECISIONS.md", "M README.md"]);

    const s = new Store(":memory:");
    const r = await intakeGit(s, repo);
    assert.equal(r.commits, 2);
    assert.equal(r.branches, 2); // main and side
    assert.ok(r.redactions >= 1, "the API_KEY assignment was redacted");

    const first = commits[1]!;
    const m = s.memory(`commit:${first.sha}`)!;
    assert.equal(m.kind, "commit");
    assert.equal(m.ts, "2026-10-27T10:42:01.000Z");
    assert.match(m.body, /API_KEY=\[redacted:assignment\]/);
    assert.doesNotMatch(JSON.stringify(s.events()), /supersecret123/);

    const second = commits[0]!;
    const links = s.links({ src: `commit:${second.sha}` });
    assert.deepEqual(
      links.map((l) => `${l.rel} ${l.dst}`).sort(),
      [
        `cites decision:D1`,
        `cites decision:D7`,
        `parent commit:${first.sha}`,
        `touches file:DECISIONS.md`,
        `touches file:README.md`,
      ],
    );
    assert.ok(links.every((l) => l.how === "recorded" && l.by === "intake:git"));
    assert.equal(s.links({ src: "branch:side", rel: "at" })[0]?.dst, `commit:${second.sha}`);

    // Second run: nothing new.
    const again = await intakeGit(s, repo);
    assert.equal(again.commits, 0);
    assert.equal(again.links, 0);
    assert.equal(again.skipped, 4);

    // A commit moves main: the branch memory follows the tip and the old "at" is no longer current.
    writeFileSync(join(repo, "x.txt"), "x\n");
    execFileSync("git", ["-C", repo, "add", "x.txt"]);
    execFileSync("git", ["-C", repo, "commit", "-q", "-m", "third"], { env: { ...process.env, GIT_AUTHOR_DATE: "2026-10-27T07:00:00-04:00", GIT_COMMITTER_DATE: "2026-10-27T07:00:00-04:00" } });
    const third = (await readCommits(repo))[0]!;
    const moved = await intakeGit(s, repo);
    assert.equal(moved.commits, 1);
    assert.equal(moved.branches, 1, "main is a new version");
    assert.equal(s.memory("branch:main")?.body, `at ${third.sha.slice(0, 7)}`);
    assert.deepEqual(s.links({ src: "branch:main", rel: "at" }).map((l) => l.dst), [`commit:${third.sha}`]);
    s.close();
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
