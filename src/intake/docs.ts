/**
 * Doc versions: every committed version of a tracked document becomes a
 * memory of its own (D3: every version kept). A version is `doc:<path>@<sha>`
 * with the file's content at that commit as its body, redacted.
 *
 * Recorded links, each with its evidence:
 *   doc:<path>@<sha>  --version-of--> file:<path>           evidence: sha
 *   commit:<sha>      --wrote------->  doc:<path>@<sha>     evidence: name-status letter
 *   doc:<path>@<sha>  --supersedes-->  doc:<path>@<prev>    evidence: "next commit touching <path>"
 *   file:<path>       --current----->  doc:<path>@<sha>     pointer: one current version per file
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Link, Memory, Store } from "../store.ts";
import { readCommits, type GitCommit } from "./git.ts";

const run = promisify(execFile);
const HARDENED = ["-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-c", "core.pager=cat", "--no-pager"];
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" };

/** Which files are documents. Markdown anywhere in the repo, by default. */
export function isDoc(path: string, patterns: readonly RegExp[] = [/\.md$/i]): boolean {
  return patterns.some((p) => p.test(path));
}

export async function showFile(repo: string, sha: string, path: string): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", [...HARDENED, "-C", repo, "show", `${sha}:${path}`], {
      env: ENV,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
    });
    return stdout;
  } catch {
    return undefined; // deleted in this commit, or binary trouble
  }
}

export interface DocVersion {
  path: string;
  sha: string;
  ts: string;
  status: string;
  content: string;
  prevSha?: string;
}

/** Every version of every doc, oldest first, with its predecessor on the same path. */
export async function readDocVersions(repo: string, commits?: GitCommit[], patterns?: readonly RegExp[]): Promise<DocVersion[]> {
  const all = (commits ?? (await readCommits(repo))).slice().sort((a, b) => a.authorDate.localeCompare(b.authorDate) || a.sha.localeCompare(b.sha));
  const lastByPath = new Map<string, string>();
  const out: DocVersion[] = [];
  for (const c of all) {
    for (const f of c.files) {
      if (!isDoc(f.path, patterns)) continue;
      if (f.status === "D") {
        lastByPath.delete(f.path);
        continue;
      }
      const content = await showFile(repo, c.sha, f.path);
      if (content === undefined) continue;
      const v: DocVersion = { path: f.path, sha: c.sha, ts: new Date(c.authorDate).toISOString(), status: f.status, content };
      const prev = lastByPath.get(f.path);
      if (prev) v.prevSha = prev;
      out.push(v);
      lastByPath.set(f.path, c.sha);
    }
  }
  return out;
}

export const docRef = (path: string, sha: string): string => `doc:${path}@${sha}`;

export function docMemory(v: DocVersion, source: string): Memory {
  const lines = v.content.split("\n").length;
  return {
    ref: docRef(v.path, v.sha),
    kind: "doc-version",
    ts: v.ts,
    title: `${v.path} @ ${v.sha.slice(0, 7)}`,
    body: v.content,
    source,
    meta: { path: v.path, sha: v.sha, status: v.status, lines, ...(v.prevSha ? { prev: v.prevSha } : {}) },
  };
}

export function docLinks(v: DocVersion, by: string): Link[] {
  const ref = docRef(v.path, v.sha);
  const links: Link[] = [
    { src: ref, dst: `file:${v.path}`, rel: "version-of", how: "recorded", evidence: v.sha, by, ts: v.ts },
    { src: `commit:${v.sha}`, dst: ref, rel: "wrote", how: "recorded", evidence: v.status, by, ts: v.ts },
    { src: `file:${v.path}`, dst: ref, rel: "current", how: "recorded", evidence: v.sha, by, ts: v.ts },
  ];
  if (v.prevSha) {
    links.push({ src: ref, dst: docRef(v.path, v.prevSha), rel: "supersedes", how: "recorded", evidence: `next commit touching ${v.path}`, by, ts: v.ts });
  }
  return links;
}

export interface DocsIntakeResult {
  versions: number;
  links: number;
  skipped: number;
}

export async function intakeDocs(store: Store, repo: string, commits?: GitCommit[]): Promise<DocsIntakeResult> {
  const source = `git:${repo}`;
  const by = "intake:docs";
  const r: DocsIntakeResult = { versions: 0, links: 0, skipped: 0 };
  for (const v of await readDocVersions(repo, commits)) {
    const added = store.addMemory(docMemory(v, source));
    if (!added.added) {
      r.skipped += 1;
      continue;
    }
    r.versions += 1;
    for (const l of docLinks(v, by)) if (store.addLink(l).added) r.links += 1;
  }
  return r;
}
