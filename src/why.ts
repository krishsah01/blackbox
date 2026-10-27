/**
 * Why-chains: "why is X like this?" walked deterministically through the
 * links the brain holds, from the thing asked about back to the decisions
 * and commits behind it. Recorded links are walked first, inferred second,
 * proposed last, and every step says which kind carried it.
 *
 * Resolving the target from the question is the only non-deterministic-
 * looking part, and it is still a fixed procedure: an explicit D<n>, a
 * path the brain knows as a file, a commit sha, or a keyword match over
 * decision titles. A keyword match is shown as an *inferred* step with its
 * score, never hidden.
 *
 * The label is computed: "supported" needs at least one decision reached
 * over recorded links only; a chain that needed an inferred hop is
 * "supported (inferred hop)"-free and honest: we keep two labels only, so
 * an inferred hop lowers the label to "insufficient evidence" unless a
 * recorded path also exists. The inputs are always shown.
 */
import type { Answer, Step } from "./ask.ts";
import type { Link, LinkHow, Memory, Store } from "./store.ts";

export interface Target {
  ref: string;
  /** How the question was tied to this ref. */
  how: LinkHow;
  evidence: string;
  score?: number;
}

const STOP = new Set(
  "a an the is are was were be been being of to in on for with and or but not no why how what when where which who does do did this that these those it its from by as at like so if then than there here have has had our we you i me my your".split(" "),
);

export function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
}

/** Word match with a 4-letter prefix stem so "repo" meets "repository". */
function matches(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return n >= 4 && a.slice(0, 4) === b.slice(0, 4);
}

export function scoreDecision(qwords: string[], m: Memory): { score: number; hits: string[] } {
  const title = keywords(m.title);
  const body = keywords(m.body.slice(0, 600));
  const hits: string[] = [];
  let score = 0;
  for (const q of qwords) {
    if (title.some((t) => matches(q, t))) {
      score += 2;
      hits.push(q);
    } else if (body.some((t) => matches(q, t))) {
      score += 1;
      hits.push(q);
    }
  }
  return { score, hits };
}

export function resolveTarget(store: Store, question: string): Target | undefined {
  const q = question.trim();
  const d = /\bD(\d{1,4})\b/.exec(q);
  if (d && store.memory(`decision:D${d[1]}`)) return { ref: `decision:D${d[1]}`, how: "recorded", evidence: `"${d[0]}" named in the question` };
  const sha = /\b[0-9a-f]{7,40}\b/.exec(q);
  if (sha) {
    const hit = store.memories({ kind: "commit" }).find((m) => m.ref.startsWith(`commit:${sha[0]}`));
    if (hit) return { ref: hit.ref, how: "recorded", evidence: `"${sha[0]}" named in the question` };
  }
  for (const tok of q.split(/\s+/)) {
    const path = tok.replace(/^[`'"(]+|[`'"),.?!:]+$/g, "");
    if (path.includes(".") || path.includes("/")) {
      if (store.links({ dst: `file:${path}` }).length > 0) return { ref: `file:${path}`, how: "recorded", evidence: `"${path}" named in the question` };
    }
  }
  const qwords = keywords(q);
  let best: { m: Memory; score: number; hits: string[] } | undefined;
  for (const m of store.memories({ kind: "decision" })) {
    const s = scoreDecision(qwords, m);
    if (s.score > (best?.score ?? 0)) best = { m, ...s };
  }
  if (best && best.score >= 3 && best.hits.length >= 2) {
    return { ref: best.m.ref, how: "inferred", evidence: `question words ${best.hits.map((h) => `"${h}"`).join(", ")} match ${best.m.title}`, score: best.score };
  }
  return undefined;
}

const ORDER: LinkHow[] = ["recorded", "inferred", "proposed"];
const byHow = (a: Link, b: Link) => ORDER.indexOf(a.how) - ORDER.indexOf(b.how) || a.ts.localeCompare(b.ts);

export interface ChainStep extends Step {
  ref: string;
  how: LinkHow;
  depth: number;
}

function describe(m: Memory | undefined, ref: string): string {
  if (!m) return ref;
  const day = m.ts.slice(0, 10);
  switch (m.kind) {
    case "decision": {
      const para = /\*\*Why\.\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/.exec(m.body)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
      const why = /^(.*?[.!?])(\s|$)/.exec(para)?.[1] ?? para;
      return `${m.title} (${day})${why ? `: ${why}` : ""}`;
    }
    case "commit":
      return `commit ${m.ref.slice(7, 14)} (${day}): ${m.title}`;
    case "doc-version":
      return `${m.title} (${day})`;
    default:
      return `${m.kind} ${m.title} (${day})`;
  }
}

/**
 * Walk from `start` through the links that explain it. Which links explain
 * what, per ref kind (chosen so the chain goes toward reasons, not sideways):
 *   file:*       <- commits that touch it (touches)
 *   doc:*        <- the commit that wrote it (wrote)
 *   commit:*     -> decisions it cites (cites)
 *   decision:*   -> decisions it revises / narrows / cites;
 *                <- the doc version that FIRST recorded it (recorded-in, earliest)
 * Not followed: a doc version's other decisions (sideways), later versions
 * that merely still contain a decision, and the docs a commit wrote.
 */
export function walk(store: Store, start: string, maxDepth = 4, maxSteps = 16): { steps: ChainStep[]; hows: Record<LinkHow, number>; decisions: Set<string> } {
  const steps: ChainStep[] = [];
  const hows: Record<LinkHow, number> = { recorded: 0, inferred: 0, proposed: 0 };
  const decisions = new Set<string>();
  const seen = new Set<string>([start]);
  const queue: Array<{ ref: string; depth: number; via?: Link }> = [{ ref: start, depth: 0 }];
  while (queue.length && steps.length < maxSteps) {
    const { ref, depth, via } = queue.shift()!;
    const m = store.memory(ref);
    if (via) {
      hows[via.how] += 1;
      steps.push({ ref, how: via.how, depth, text: `${"  ".repeat(depth - 1)}${via.rel} (${via.how}, ${via.evidence}): ${describe(m, ref)}`, cites: m ? [ref] : [] });
    }
    if (ref.startsWith("decision:") && m) decisions.add(ref);
    if (depth >= maxDepth) continue;
    const next: Link[] = [];
    const kind = ref.split(":")[0];
    if (kind === "file") {
      next.push(...store.links({ dst: ref, rel: "touches" }));
    } else if (kind === "doc") {
      next.push(...store.links({ dst: ref, rel: "wrote" }));
    } else if (kind === "commit") {
      next.push(...store.links({ src: ref, rel: "cites" }));
    } else if (kind === "decision") {
      next.push(...store.links({ src: ref, rel: "revises" }), ...store.links({ src: ref, rel: "narrows" }), ...store.links({ src: ref, rel: "cites" }));
      const recordedIn = store.links({ src: ref, rel: "recorded-in" }).sort((a, b) => a.ts.localeCompare(b.ts));
      if (recordedIn[0]) next.push(recordedIn[0]);
    }
    for (const l of next.sort(byHow)) {
      const other = l.src === ref ? l.dst : l.src;
      if (seen.has(other)) continue;
      seen.add(other);
      queue.push({ ref: other, depth: depth + 1, via: l });
    }
  }
  return { steps, hows, decisions };
}

export function why(store: Store, question: string): Answer {
  const target = resolveTarget(store, question);
  if (!target) {
    return {
      question,
      lead: "I can't tie that question to anything the brain holds.",
      steps: [],
      label: "insufficient evidence",
      inputs: { decisions_known: store.memories({ kind: "decision" }).length, target: "none" },
      refusal: "Name a decision (D3), a file path, a commit, or words from a decision's title.",
    };
  }
  const start = store.memory(target.ref);
  const { steps, hows, decisions } = walk(store, target.ref);
  const head: Step[] = [{ text: `${target.how === "inferred" ? "inferred target" : "target"} (${target.evidence}): ${describe(start, target.ref)}`, cites: start ? [target.ref] : [] }];
  const recordedOnly = target.how === "recorded" && hows.inferred === 0 && hows.proposed === 0;
  const label = decisions.size > 0 && recordedOnly ? "supported" : "insufficient evidence";
  const inputs: Record<string, number | string> = {
    target_how: target.how,
    steps: steps.length,
    recorded_links: hows.recorded,
    inferred_links: hows.inferred + (target.how === "inferred" ? 1 : 0),
    proposed_links: hows.proposed,
    decisions_reached: decisions.size,
  };
  const others = [...decisions].filter((r) => r !== target.ref).map((r) => store.memory(r)?.title.split(". ")[0] ?? r);
  const inferredN = hows.inferred + (target.how === "inferred" ? 1 : 0);
  const over = `${hows.recorded} recorded link${hows.recorded === 1 ? "" : "s"}${inferredN ? ` and ${inferredN} inferred` : ""}`;
  let lead: string;
  if (decisions.size === 0) lead = `No recorded decision explains ${target.ref} yet.`;
  else if (target.ref.startsWith("decision:") && start) {
    const id = start.title.split(". ")[0];
    lead = others.length ? `${id} rests on ${others.join(", ")}; ${over}.` : `${id} stands on its own record; ${over}.`;
  } else lead = `${target.ref} traces to ${others.join(", ")} over ${over}.`;
  return { question, lead, steps: [...head, ...steps], label, inputs };
}
