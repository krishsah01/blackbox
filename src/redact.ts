/**
 * Redaction runs on every piece of text before it is stored, and again on
 * anything that would leave the machine. Nothing enters the memory with a
 * secret in it (D3, D7). Two layers:
 *
 * 1. Shape patterns: well-known key formats, "key = value" assignments,
 *    private-key blocks, bearer tokens, JWTs, emails, and long mixed-class
 *    tokens that are not hex (git SHAs are hex and must survive).
 * 2. The denylist: exact values the owner has erased. They are replaced
 *    wherever they appear, and `containsErased` is the hard gate that
 *    refuses outbound text still holding one.
 *
 * Every replacement keeps the kind so a reader knows what was there.
 */

export type RedactionKind =
  | "private-key"
  | "known-key"
  | "assignment"
  | "bearer"
  | "jwt"
  | "email"
  | "token"
  | "erased";

export interface RedactionHit {
  kind: RedactionKind;
  count: number;
}

export interface Redacted {
  text: string;
  hits: RedactionHit[];
  /** True when at least one replacement was made. */
  changed: boolean;
}

export interface RedactOptions {
  /** Exact values the owner has erased. Matched as substrings, case-sensitive. */
  denylist?: readonly string[];
}

const marker = (kind: RedactionKind): string => `[redacted:${kind}]`;

interface Rule {
  kind: RedactionKind;
  re: RegExp;
  /** Replacement; `$1` style groups allowed. Default is the bare marker. */
  replace?: string;
}

// Order matters: wider shapes first, then specific tokens, then the generic
// mixed-class token rule last so it never eats a marker.
const RULES: Rule[] = [
  {
    kind: "private-key",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    kind: "known-key",
    re: new RegExp(
      [
        String.raw`\bsk-[A-Za-z0-9_-]{16,}`, // OpenAI-style, also Meta "sk-" if used
        String.raw`\bgh[pousr]_[A-Za-z0-9]{30,}`, // GitHub tokens
        String.raw`\bgithub_pat_[A-Za-z0-9_]{20,}`,
        String.raw`\bAKIA[0-9A-Z]{16}\b`, // AWS access key id
        String.raw`\bxox[abprs]-[A-Za-z0-9-]{10,}`, // Slack
        String.raw`\bAIza[0-9A-Za-z_-]{35}\b`, // Google API key
        String.raw`\bhf_[A-Za-z0-9]{20,}`, // Hugging Face
        String.raw`\bnpm_[A-Za-z0-9]{30,}`,
        String.raw`\bglpat-[A-Za-z0-9_-]{20,}`, // GitLab
      ].join("|"),
      "g",
    ),
  },
  {
    kind: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    kind: "bearer",
    re: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g,
    replace: "$1 [redacted:bearer]",
  },
  {
    kind: "assignment",
    // key name kept (with any prefix, META_API_KEY), value replaced
    re: /\b([A-Za-z0-9_-]*(?:api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|secret|token|password|passwd|pwd|credentials?)\b["']?\s*[:=]\s*["']?)([^\s"',;]{6,})/gi,
    replace: "$1[redacted:assignment]",
  },
  {
    kind: "email",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    kind: "token",
    // 32+ chars of base64/url-safe alphabet with upper, lower and digit all
    // present. Pure hex (git SHAs, hashes) never matches because hex has no
    // letters past 'f', so the uppercase/lowercase mix test below fails or the
    // string is excluded explicitly.
    re: /\b(?=[A-Za-z0-9+/_=-]{32,}\b)(?=[^\s]*[A-Z])(?=[^\s]*[a-z])(?=[^\s]*[0-9])[A-Za-z0-9+/_=-]{32,}\b/g,
  },
];

const HEX = /^[0-9a-fA-F]+$/;

function applyRule(text: string, rule: Rule): { text: string; count: number } {
  let count = 0;
  const out = text.replace(rule.re, (match: string, ...groups: unknown[]) => {
    if (rule.kind === "token" && HEX.test(match)) return match;
    // Never re-redact a marker we already placed.
    if (match.includes("[redacted:")) return match;
    count += 1;
    if (!rule.replace) return marker(rule.kind);
    return rule.replace.replace(/\$(\d)/g, (_, n: string) => {
      const g = groups[Number(n) - 1];
      return typeof g === "string" ? g : "";
    });
  });
  return { text: out, count };
}

/** Replace every occurrence of every erased value. Longest values first so a
 *  value that contains another is replaced whole. */
function applyDenylist(text: string, denylist: readonly string[]): { text: string; count: number } {
  let count = 0;
  const values = [...new Set(denylist.filter((v) => v.length > 0))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const v of values) {
    const parts = out.split(v);
    if (parts.length > 1) {
      count += parts.length - 1;
      out = parts.join(marker("erased"));
    }
  }
  return { text: out, count };
}

export function redact(text: string, opts: RedactOptions = {}): Redacted {
  const hits: RedactionHit[] = [];
  let out = text;

  // Denylist first: an erased value is the one thing we know for certain
  // must not survive, whatever shape it has.
  if (opts.denylist && opts.denylist.length > 0) {
    const r = applyDenylist(out, opts.denylist);
    out = r.text;
    if (r.count > 0) hits.push({ kind: "erased", count: r.count });
  }

  for (const rule of RULES) {
    const r = applyRule(out, rule);
    out = r.text;
    if (r.count > 0) hits.push({ kind: rule.kind, count: r.count });
  }

  return { text: out, hits, changed: hits.length > 0 };
}

/** Hard gate: does the text still contain any erased value, byte for byte? */
export function containsErased(text: string, denylist: readonly string[]): boolean {
  return denylist.some((v) => v.length > 0 && text.includes(v));
}

/**
 * Redact every string inside a JSON-like value, recursively. Keys are left
 * alone; only values are text that could carry a secret.
 */
export function redactDeep<T>(value: T, opts: RedactOptions = {}): { value: T; hits: RedactionHit[] } {
  const totals = new Map<RedactionKind, number>();
  const add = (hs: RedactionHit[]) => {
    for (const h of hs) totals.set(h.kind, (totals.get(h.kind) ?? 0) + h.count);
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = redact(v, opts);
      add(r.hits);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = walk(x);
      return o;
    }
    return v;
  };
  const out = walk(value) as T;
  const hits = [...totals].map(([kind, count]) => ({ kind, count }));
  return { value: out, hits };
}
