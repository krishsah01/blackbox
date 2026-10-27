/**
 * Questions. Day 1 answers one shape deterministically: "what happened
 * <when>", from memories alone. Every answer carries its citations and a
 * label computed from the evidence, never chosen by a model.
 *
 * The answer object is the proof. A model may later phrase it (day 4), but
 * the engine's steps and citations are what the UI shows as evidence.
 */
import type { Memory, Store } from "./store.ts";

export type Label = "supported" | "insufficient evidence";

export interface Step {
  text: string;
  /** Memory refs this step rests on. Empty means the step is a framing line. */
  cites: string[];
}

export interface Answer {
  question: string;
  /** The window the answer is about, when it is about a window. */
  window?: { since: string; until: string };
  lead: string;
  steps: Step[];
  label: Label;
  /** What the label was computed from. Shown, so the label can be checked. */
  inputs: Record<string, number | string>;
  /** When the answer could not be built, why, in one line. */
  refusal?: string;
}

export interface Window {
  since: string;
  until: string;
  name: string;
}

/**
 * Turn "today", "yesterday" or a YYYY-MM-DD into a local-day window.
 * `now` is for tests. Days are local to the machine, which is where the
 * owner lives; the ISO bounds are what get stored and shown.
 */
export function parseWindow(text: string, now: Date = new Date()): Window | undefined {
  const t = text.trim().toLowerCase();
  const dayOf = (d: Date): Window => {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const name = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return { since: start.toISOString(), until: end.toISOString(), name };
  };
  if (/\btoday\b/.test(t)) return dayOf(now);
  if (/\byesterday\b/.test(t)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return dayOf(y);
  }
  const m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) return dayOf(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return undefined;
}

const KIND_ORDER = ["decision", "commit", "branch", "doc-version", "session", "clip"] as const;

/** HH:MM in the machine's local time; the owner lives in local time, the store in UTC. */
function localClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function describe(m: Memory): string {
  const when = localClock(m.ts);
  switch (m.kind) {
    case "commit": {
      const short = typeof m.meta?.short === "string" ? m.meta.short : m.ref.slice(7, 14);
      const files = Array.isArray(m.meta?.files) ? (m.meta.files as string[]).length : 0;
      return `${when} commit ${short}: ${m.title}${files ? ` (${files} file${files === 1 ? "" : "s"})` : ""}`;
    }
    case "branch":
      return `${when} branch ${m.title} ${m.body}`;
    default:
      return `${when} ${m.kind} ${m.title}`;
  }
}

/** "What happened <window>?" from memories in that window. */
export function whatHappened(store: Store, question: string, window: Window): Answer {
  const memories = store.memories({ since: window.since, until: window.until });
  const byKind = new Map<string, Memory[]>();
  for (const m of memories) byKind.set(m.kind, [...(byKind.get(m.kind) ?? []), m]);

  const steps: Step[] = [];
  for (const kind of KIND_ORDER) {
    const ms = byKind.get(kind);
    if (!ms?.length) continue;
    for (const m of ms) steps.push({ text: describe(m), cites: [m.ref] });
  }

  const newest = store.newest();
  const inputs: Record<string, number | string> = {
    memories_in_window: memories.length,
    kinds_in_window: byKind.size,
    newest_memory: newest ?? "none",
    // How much of the brain's knowledge is newer than the window's end. A window
    // asked about before the brain caught up is weak evidence.
    window_ends_after_newest: newest && newest < window.until ? 1 : 0,
  };

  const label: Label = memories.length > 0 ? "supported" : "insufficient evidence";
  const counts = KIND_ORDER.filter((k) => byKind.has(k)).map((k) => [k, byKind.get(k)!] as const).map(([k, v]) => `${v.length} ${k}${v.length === 1 ? "" : k === "branch" ? "es" : "s"}`);
  const lead =
    memories.length === 0
      ? `Nothing is recorded for ${window.name}.`
      : `On ${window.name}: ${counts.join(", ")}.`;

  return { question, window: { since: window.since, until: window.until }, lead, steps, label, inputs };
}

/** Route a question. Day 1 knows one shape; everything else is refused honestly. */
export function ask(store: Store, question: string, now: Date = new Date()): Answer {
  const q = question.trim();
  const window = parseWindow(q, now);
  if (/\bwhat happened\b/i.test(q) && window) return whatHappened(store, q, window);
  if (window) return whatHappened(store, q, window);
  return {
    question: q,
    lead: "I can't answer that yet.",
    steps: [],
    label: "insufficient evidence",
    inputs: { memories_total: store.memories().length },
    refusal: 'Day 1 answers "what happened today | yesterday | YYYY-MM-DD". Why-chains arrive on day 2, as-of on day 3.',
  };
}

/** Plain-text rendering with citations, for the CLI. */
export function render(a: Answer): string {
  const lines: string[] = [];
  lines.push(`Q: ${a.question}`);
  lines.push(`A: ${a.lead}`);
  for (const s of a.steps) {
    lines.push(`  - ${s.text}${s.cites.length ? `  [${s.cites.join(", ")}]` : ""}`);
  }
  if (a.refusal) lines.push(`  ${a.refusal}`);
  const inputs = Object.entries(a.inputs)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  lines.push(`Label: ${a.label}  (${inputs})`);
  return lines.join("\n");
}
