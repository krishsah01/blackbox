/**
 * The store: an append-only event log in SQLite, with derived tables that
 * can be rebuilt from it at any time.
 *
 * Why append-only: the brain answers "what did we know on day 3", which is
 * only honest if nothing recorded is ever changed in place. Triggers refuse
 * UPDATE and DELETE on `events`. The one planned exception, owner-only
 * erasure with a tombstone, lands on day 6 as a trigger-guarded path (D3).
 *
 * Every string in an event payload is redacted before it is written, with
 * the owner's denylist of erased values applied first (D7).
 *
 * Memory refs are stable strings: `commit:<sha>`, `branch:<name>`,
 * `file:<path>`, `decision:D3`, `doc:<path>@<sha>`, `session:<id>`,
 * `clip:<id>`. Links point at refs, so a link can be recorded before the
 * memory it points at exists (a commit can cite D3 before decisions are
 * taken in on day 2).
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { redactDeep, type RedactionHit } from "./redact.ts";

export type MemoryKind = "commit" | "branch" | "decision" | "doc-version" | "session" | "clip";
export const MEMORY_KINDS: readonly MemoryKind[] = ["commit", "branch", "decision", "doc-version", "session", "clip"];

/** How a link came to be. The why-chain prefers recorded > inferred > proposed. */
export type LinkHow = "recorded" | "inferred" | "proposed";

export interface Memory {
  ref: string;
  kind: MemoryKind;
  /** ISO 8601 moment the memory is about (a commit's author date, not intake time). */
  ts: string;
  title: string;
  body: string;
  /** Where it came from, e.g. `git:/path/to/repo`. */
  source: string;
  /** Free-form, redacted, JSON-serialisable detail. */
  meta?: Record<string, unknown>;
}

export interface Link {
  src: string;
  dst: string;
  /** Relation, e.g. `touches`, `parent`, `cites`, `at`. */
  rel: string;
  how: LinkHow;
  /** The evidence for the link: a quoted span, a file status, a ref. */
  evidence: string;
  /** Author of the link: `intake:git`, `owner`, `model:<name>`. */
  by: string;
  ts: string;
}

export type EventKind = "memory.add" | "link.add";

export interface EventRow {
  seq: number;
  id: string;
  ts: string;
  kind: EventKind;
  source: string;
  payload: unknown;
}

export interface AppendResult {
  /** False when an identical event (same id) was already in the log. */
  added: boolean;
  id: string;
  hits: RedactionHit[];
}

export interface MemoryQuery {
  kind?: MemoryKind;
  /** Inclusive lower bound on `ts`. */
  since?: string;
  /** Exclusive upper bound on `ts`. */
  until?: string;
  source?: string;
  limit?: number;
}

export interface LinkQuery {
  src?: string;
  dst?: string;
  rel?: string;
  how?: LinkHow;
}

/**
 * Relations that are a current pointer: one dst per src at any moment (a
 * branch is "at" one commit; a file has one "current" version). The log keeps every position; the derived
 * table keeps only the newest, so nothing stale is ever shown as current.
 */
export const POINTER_RELS: readonly string[] = ["at", "current"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  id      TEXT NOT NULL UNIQUE,
  ts      TEXT NOT NULL,
  kind    TEXT NOT NULL,
  source  TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;

CREATE TABLE IF NOT EXISTS memories (
  ref       TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,
  ts        TEXT NOT NULL,
  title     TEXT NOT NULL,
  body      TEXT NOT NULL,
  source    TEXT NOT NULL,
  meta      TEXT,
  event_seq INTEGER NOT NULL REFERENCES events(seq)
);
CREATE INDEX IF NOT EXISTS memories_ts ON memories(ts);
CREATE INDEX IF NOT EXISTS memories_kind_ts ON memories(kind, ts);

CREATE TABLE IF NOT EXISTS links (
  src       TEXT NOT NULL,
  dst       TEXT NOT NULL,
  rel       TEXT NOT NULL,
  how       TEXT NOT NULL CHECK (how IN ('recorded','inferred','proposed')),
  evidence  TEXT NOT NULL,
  by        TEXT NOT NULL,
  ts        TEXT NOT NULL,
  event_seq INTEGER NOT NULL REFERENCES events(seq),
  PRIMARY KEY (src, dst, rel, how)
);
CREATE INDEX IF NOT EXISTS links_dst ON links(dst);
`;

function eventId(kind: EventKind, source: string, key: string): string {
  return createHash("sha256").update(`${kind}\n${source}\n${key}`).digest("hex").slice(0, 32);
}

export interface StoreOptions {
  /** Erased values; applied before every write and never stored in the log. */
  denylist?: readonly string[];
  /** Path to a newline-separated denylist file (0600, outside the repo). */
  denylistFile?: string;
  /** Clock, for tests. */
  now?: () => string;
}

export class Store {
  readonly db: DatabaseSync;
  private denylist: string[];
  private readonly now: () => string;

  constructor(path: string, opts: StoreOptions = {}) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    this.denylist = [...(opts.denylist ?? [])];
    if (opts.denylistFile) this.denylist.push(...readDenylist(opts.denylistFile));
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  close(): void {
    this.db.close();
  }

  /** Add an erased value for this process. Persisting it is the owner's
   *  erase flow (day 6), which also tombstones existing memories. */
  addErased(value: string): void {
    if (value && !this.denylist.includes(value)) this.denylist.push(value);
  }

  /** Append one event. Idempotent on (kind, source, key). */
  append(kind: EventKind, source: string, key: string, payload: unknown): AppendResult {
    const id = eventId(kind, source, key);
    const { value, hits } = redactDeep(payload, { denylist: this.denylist });
    const ts = this.now();
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO events (id, ts, kind, source, payload) VALUES (?, ?, ?, ?, ?)",
    );
    let added = false;
    const tx = () => {
      const r = insert.run(id, ts, kind, source, JSON.stringify(value));
      added = r.changes === 1;
      if (added) this.apply({ seq: Number(r.lastInsertRowid), id, ts, kind, source, payload: value });
    };
    this.db.exec("BEGIN");
    try {
      tx();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { added, id, hits };
  }

  /**
   * Add a memory. The event key defaults to the ref, so re-adding the same
   * memory is a no-op. Pass a `key` that includes what changed (a branch tip)
   * when the same ref legitimately gets a new version: the log keeps every
   * version and the derived table shows the newest.
   */
  addMemory(m: Memory, key: string = m.ref): AppendResult {
    if (!MEMORY_KINDS.includes(m.kind)) throw new Error(`unknown memory kind: ${m.kind}`);
    return this.append("memory.add", m.source, key, m);
  }

  addLink(l: Link): AppendResult {
    return this.append("link.add", l.by, `${l.src}\n${l.dst}\n${l.rel}\n${l.how}`, l);
  }

  /** Project one event onto the derived tables. */
  private apply(e: EventRow): void {
    if (e.kind === "memory.add") {
      const m = e.payload as Memory;
      this.db
        .prepare(
          `INSERT OR REPLACE INTO memories (ref, kind, ts, title, body, source, meta, event_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(m.ref, m.kind, m.ts, m.title, m.body, m.source, m.meta ? JSON.stringify(m.meta) : null, e.seq);
    } else if (e.kind === "link.add") {
      const l = e.payload as Link;
      if (POINTER_RELS.includes(l.rel)) {
        this.db.prepare("DELETE FROM links WHERE src = ? AND rel = ? AND how = ?").run(l.src, l.rel, l.how);
      }
      this.db
        .prepare(
          `INSERT OR REPLACE INTO links (src, dst, rel, how, evidence, by, ts, event_seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(l.src, l.dst, l.rel, l.how, l.evidence, l.by, l.ts, e.seq);
    }
  }

  /** Drop the derived tables and replay the whole log. */
  rebuild(): number {
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM links; DELETE FROM memories;");
      let n = 0;
      for (const e of this.events()) {
        this.apply(e);
        n += 1;
      }
      this.db.exec("COMMIT");
      return n;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  events(): EventRow[] {
    const rows = this.db.prepare("SELECT seq, id, ts, kind, source, payload FROM events ORDER BY seq").all() as Array<
      Omit<EventRow, "payload"> & { payload: string }
    >;
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as unknown }));
  }

  eventCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
  }

  memory(ref: string): Memory | undefined {
    const r = this.db.prepare("SELECT ref, kind, ts, title, body, source, meta FROM memories WHERE ref = ?").get(ref) as
      | (Omit<Memory, "meta"> & { meta: string | null })
      | undefined;
    return r ? rowToMemory(r) : undefined;
  }

  memories(q: MemoryQuery = {}): Memory[] {
    const where: string[] = [];
    const args: Array<string | number> = [];
    if (q.kind) (where.push("kind = ?"), args.push(q.kind));
    if (q.since) (where.push("ts >= ?"), args.push(q.since));
    if (q.until) (where.push("ts < ?"), args.push(q.until));
    if (q.source) (where.push("source = ?"), args.push(q.source));
    const sql =
      "SELECT ref, kind, ts, title, body, source, meta FROM memories" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY ts, ref" +
      (q.limit ? ` LIMIT ${Math.max(0, Math.floor(q.limit))}` : "");
    const rows = this.db.prepare(sql).all(...args) as Array<Omit<Memory, "meta"> & { meta: string | null }>;
    return rows.map(rowToMemory);
  }

  links(q: LinkQuery = {}): Link[] {
    const where: string[] = [];
    const args: string[] = [];
    if (q.src) (where.push("src = ?"), args.push(q.src));
    if (q.dst) (where.push("dst = ?"), args.push(q.dst));
    if (q.rel) (where.push("rel = ?"), args.push(q.rel));
    if (q.how) (where.push("how = ?"), args.push(q.how));
    const sql =
      "SELECT src, dst, rel, how, evidence, by, ts FROM links" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY ts, src, dst, rel";
    return this.db.prepare(sql).all(...args) as unknown as Link[];
  }

  /** The newest moment the brain knows about, or undefined when empty. */
  newest(): string | undefined {
    const r = this.db.prepare("SELECT MAX(ts) AS ts FROM memories").get() as { ts: string | null };
    return r.ts ?? undefined;
  }
}

function rowToMemory(r: Omit<Memory, "meta"> & { meta: string | null }): Memory {
  const m: Memory = { ref: r.ref, kind: r.kind, ts: r.ts, title: r.title, body: r.body, source: r.source };
  if (r.meta) m.meta = JSON.parse(r.meta) as Record<string, unknown>;
  return m;
}

export function readDenylist(file: string): string[] {
  try {
    return readFileSync(file, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}
