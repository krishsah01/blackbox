/**
 * Decisions: every `### D<n>. <title> (<date>)` section of DECISIONS.md, in
 * every committed version of the file, becomes (a version of) a decision
 * memory `decision:D<n>`. The log keeps each wording; the derived row is
 * the newest. A decision's moment is the author date of the commit that
 * first recorded it, with the heading's date kept in meta.
 *
 * Recorded links, each with its evidence:
 *   decision:D<n> --recorded-in--> doc:DECISIONS.md@<sha>   evidence: the heading
 *   decision:D<n> --revises-----> decision:D<m>             evidence: the quoted span ("Revises D7")
 *   decision:D<n> --narrows-----> decision:D<m>             evidence: the quoted span ("narrows D4")
 *   decision:D<n> --cites-------> decision:D<m>             evidence: the quoted span (any other D<m>)
 */
import { createHash } from "node:crypto";
import type { Link, Memory, Store } from "../store.ts";
import { citedDecisions } from "./git.ts";
import { docRef, type DocVersion } from "./docs.ts";

export interface ParsedDecision {
  id: string; // "D3"
  title: string;
  date?: string; // YYYY-MM-DD from the heading
  body: string;
  /** "Settled" or "Open" or whatever `## ` section it sits under. */
  section: string;
}

const HEADING = /^### (D\d{1,4})\.\s+(.*?)\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s*$/;

export function parseDecisions(markdown: string): ParsedDecision[] {
  const out: ParsedDecision[] = [];
  let section = "";
  let cur: ParsedDecision | undefined;
  const flush = () => {
    if (cur) {
      cur.body = cur.body.trim();
      out.push(cur);
      cur = undefined;
    }
  };
  for (const line of markdown.split("\n")) {
    if (/^## /.test(line)) {
      flush();
      section = line.replace(/^## /, "").trim();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      cur = { id: h[1]!, title: h[2]!, body: "", section };
      if (h[3]) cur.date = h[3];
      continue;
    }
    if (cur) cur.body += line + "\n";
  }
  flush();
  return out;
}

/** Relations a decision declares about earlier decisions, from its own words. */
export function declaredRelations(d: ParsedDecision): Array<{ rel: "revises" | "narrows" | "cites"; id: string; span: string }> {
  const text = `${d.title}\n${d.body}`;
  const out: Array<{ rel: "revises" | "narrows" | "cites"; id: string; span: string }> = [];
  const seen = new Set<string>();
  const take = (rel: "revises" | "narrows", re: RegExp) => {
    for (const m of text.matchAll(re)) {
      for (const idm of m[0].matchAll(/\bD(\d{1,4})\b/g)) {
        const id = `D${idm[1]}`;
        if (id === d.id || seen.has(`${rel}:${id}`)) continue;
        seen.add(`${rel}:${id}`);
        out.push({ rel, id, span: m[0].replace(/\s+/g, " ").trim() });
      }
    }
  };
  // "Revises D7, D9 and D10", "revises the local-model half of D7"
  const LIST = String.raw`(?:(?:,|,?\s+and)\s+D\d{1,4}\b)*`;
  take("revises", new RegExp(String.raw`\brevis\w*\b[^.;\n]{0,80}?\bD\d{1,4}\b` + LIST, "gi"));
  // "narrows D4", "D4 is narrowed"
  take("narrows", new RegExp(String.raw`\bnarrow\w*\b[^.;\n]{0,40}?\bD\d{1,4}\b` + LIST + String.raw`|\bD\d{1,4}\b is narrowed`, "gi"));
  const strong = new Set(out.map((o) => o.id));
  for (const c of citedDecisions(text)) {
    if (c.id === d.id || strong.has(c.id)) continue;
    out.push({ rel: "cites", id: c.id, span: c.span });
  }
  return out;
}

export const decisionRef = (id: string): string => `decision:${id}`;

export interface DecisionsIntakeResult {
  decisions: number;
  versions: number;
  links: number;
  skipped: number;
}

/**
 * Take in decisions from the given DECISIONS.md versions (oldest first).
 * `firstSeen` remembers when each id first appeared so its ts is stable.
 */
export function intakeDecisionsFromVersions(store: Store, versions: DocVersion[], source: string): DecisionsIntakeResult {
  const by = "intake:decisions";
  const r: DecisionsIntakeResult = { decisions: 0, versions: 0, links: 0, skipped: 0 };
  const firstSeen = new Map<string, string>();
  for (const m of store.memories({ kind: "decision" })) {
    const first = typeof m.meta?.firstSeen === "string" ? m.meta.firstSeen : m.ts;
    firstSeen.set(m.ref, first);
  }
  const ordered = versions.slice().sort((a, b) => a.ts.localeCompare(b.ts) || a.sha.localeCompare(b.sha));
  const idsSeen = new Set<string>();
  for (const v of ordered) {
    for (const d of parseDecisions(v.content)) {
      const ref = decisionRef(d.id);
      const first = firstSeen.get(ref) ?? v.ts;
      firstSeen.set(ref, first);
      const hash = createHash("sha256").update(`${d.title}\n${d.body}`).digest("hex").slice(0, 16);
      const mem: Memory = {
        ref,
        kind: "decision",
        ts: first,
        title: `${d.id}. ${d.title}`,
        body: d.body,
        source,
        meta: { id: d.id, ...(d.date ? { date: d.date } : {}), section: d.section, firstSeen: first, recordedIn: v.sha, wording: hash },
      };
      const added = store.addMemory(mem, `${ref}@${hash}`);
      if (!added.added) {
        r.skipped += 1;
      } else {
        r.versions += 1;
        if (!idsSeen.has(d.id)) r.decisions += 1;
      }
      idsSeen.add(d.id);
      const links: Link[] = [
        { src: ref, dst: docRef(v.path, v.sha), rel: "recorded-in", how: "recorded", evidence: `### ${d.id}. ${d.title}${d.date ? ` (${d.date})` : ""}`, by, ts: v.ts },
      ];
      for (const rel of declaredRelations(d)) {
        links.push({ src: ref, dst: decisionRef(rel.id), rel: rel.rel, how: "recorded", evidence: `"${rel.span}"`, by, ts: v.ts });
      }
      for (const l of links) if (store.addLink(l).added) r.links += 1;
    }
  }
  return r;
}
