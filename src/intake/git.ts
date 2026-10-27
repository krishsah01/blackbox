/**
 * Git intake: a repository's commits and branches become memories, and
 * what git records about them becomes recorded links.
 *
 * Recorded links (how = "recorded"), each with its evidence:
 *   commit --touches--> file:<path>      evidence: the name-status letter
 *   commit --parent---> commit:<sha>     evidence: the parent sha
 *   commit --cites----> decision:D<n>    evidence: the quoted "D<n>" span
 *   branch --at-------> commit:<sha>     evidence: the tip sha
 *
 * Git runs hardened: no hooks, no credential helper, no pager, no prompts,
 * and it never executes anything from the repository.
 *
 * Idempotent: the store ignores events it has seen, so re-running intake
 * after new commits adds only the new ones.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Link, Memory, Store } from "../store.ts";

const run = promisify(execFile);

export interface GitCommit {
  sha: string;
  parents: string[];
  authorName: string;
  authorDate: string; // ISO 8601
  subject: string;
  body: string;
  files: Array<{ status: string; path: string }>;
}

export interface GitBranch {
  name: string;
  sha: string;
}

export interface GitIntakeResult {
  commits: number;
  branches: number;
  links: number;
  /** Counts of what was already known and skipped. */
  skipped: number;
  redactions: number;
}

const HARDENED = ["-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-c", "core.pager=cat", "--no-pager"];
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" };

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", [...HARDENED, "-C", repo, ...args], {
    env: ENV,
    maxBuffer: 256 * 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}

const RS = "\x1e"; // record separator between commits
const US = "\x1f"; // unit separator between fields

export async function readCommits(repo: string, opts: { all?: boolean } = {}): Promise<GitCommit[]> {
  const format = ["%H", "%P", "%an", "%aI", "%s", "%b"].join(US);
  const out = await git(repo, [
    "log",
    ...(opts.all === false ? [] : ["--all"]),
    "--date-order",
    "--name-status",
    `--format=${RS}${format}${US}`,
  ]);
  const commits: GitCommit[] = [];
  for (const chunk of out.split(RS)) {
    if (!chunk.trim()) continue;
    const [sha, parents, authorName, authorDate, subject, body, rest] = chunk.split(US);
    if (!sha || !authorDate) continue;
    const files: GitCommit["files"] = [];
    for (const line of (rest ?? "").split("\n")) {
      const m = /^([A-Z])\d*\t([^\t]+)(?:\t([^\t]+))?$/.exec(line.trim());
      if (!m) continue;
      // Renames/copies list old and new; the new path is what the commit touches.
      files.push({ status: m[1]!, path: m[3] ?? m[2]! });
    }
    commits.push({
      sha,
      parents: (parents ?? "").split(" ").filter(Boolean),
      authorName: authorName ?? "",
      authorDate,
      subject: (subject ?? "").trim(),
      body: (body ?? "").trim(),
      files,
    });
  }
  return commits;
}

export async function readBranches(repo: string): Promise<GitBranch[]> {
  const out = await git(repo, ["for-each-ref", "refs/heads", `--format=%(refname:short)${US}%(objectname)`]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, sha] = line.split(US);
      return { name: name ?? "", sha: sha ?? "" };
    })
    .filter((b) => b.name && b.sha);
}

/** Decision ids cited in a commit message: "D3", "(D8)", "D3 and D7". */
export function citedDecisions(text: string): Array<{ id: string; span: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; span: string }> = [];
  for (const m of text.matchAll(/\bD(\d{1,4})\b/g)) {
    const id = `D${m[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // The sentence around the mention, bounded, with whitespace collapsed.
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    const start = Math.max(before.lastIndexOf(". ") + 1, before.lastIndexOf("\n") + 1, before.length - 60, 0);
    const endRel = (() => {
      const e = after.search(/[.!?](\s|$)|\n/);
      return Math.min(e === -1 ? after.length : e + 1, 60);
    })();
    out.push({ id, span: (before.slice(start) + m[0] + after.slice(0, endRel)).replace(/\s+/g, " ").trim() });
  }
  return out;
}

export function commitMemory(c: GitCommit, source: string): Memory {
  return {
    ref: `commit:${c.sha}`,
    kind: "commit",
    ts: new Date(c.authorDate).toISOString(),
    title: c.subject,
    body: c.body,
    source,
    meta: {
      sha: c.sha,
      short: c.sha.slice(0, 7),
      author: c.authorName,
      parents: c.parents,
      files: c.files.map((f) => `${f.status} ${f.path}`),
    },
  };
}

export function commitLinks(c: GitCommit, by: string): Link[] {
  const ts = new Date(c.authorDate).toISOString();
  const src = `commit:${c.sha}`;
  const links: Link[] = [];
  for (const f of c.files) {
    links.push({ src, dst: `file:${f.path}`, rel: "touches", how: "recorded", evidence: f.status, by, ts });
  }
  for (const p of c.parents) {
    links.push({ src, dst: `commit:${p}`, rel: "parent", how: "recorded", evidence: p, by, ts });
  }
  for (const d of citedDecisions(`${c.subject}\n${c.body}`)) {
    links.push({ src, dst: `decision:${d.id}`, rel: "cites", how: "recorded", evidence: `"${d.span}"`, by, ts });
  }
  return links;
}

export async function intakeGit(store: Store, repo: string): Promise<GitIntakeResult> {
  const source = `git:${repo}`;
  const by = "intake:git";
  const result: GitIntakeResult = { commits: 0, branches: 0, links: 0, skipped: 0, redactions: 0 };

  const commits = await readCommits(repo);
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  for (const c of commits) {
    const r = store.addMemory(commitMemory(c, source));
    result.redactions += r.hits.reduce((n, h) => n + h.count, 0);
    if (!r.added) {
      result.skipped += 1;
      continue;
    }
    result.commits += 1;
    for (const l of commitLinks(c, by)) {
      const lr = store.addLink(l);
      if (lr.added) result.links += 1;
    }
  }

  for (const b of await readBranches(repo)) {
    const tip = bySha.get(b.sha);
    const ts = tip ? new Date(tip.authorDate).toISOString() : new Date().toISOString();
    // Keyed by tip: a branch that moved is a new version of the same memory.
    const r = store.addMemory(
      {
        ref: `branch:${b.name}`,
        kind: "branch",
        ts,
        title: b.name,
        body: `at ${b.sha.slice(0, 7)}`,
        source,
        meta: { sha: b.sha },
      },
      `branch:${b.name}@${b.sha}`,
    );
    if (r.added) result.branches += 1;
    else result.skipped += 1;
    const lr = store.addLink({ src: `branch:${b.name}`, dst: `commit:${b.sha}`, rel: "at", how: "recorded", evidence: b.sha, by, ts });
    if (lr.added) result.links += 1;
  }

  return result;
}
