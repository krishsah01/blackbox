# Blackbox (working name)

A project brain: a local memory of one software project's whole life.
It remembers decisions, commits, branches, document versions, screen
recordings and the agent sessions that built the project, and it answers
questions retrieval cannot:

- **Why-chains.** "Why is X like this?" walked step by step through the
  recorded decisions and commits that led there.
- **As-of.** "What did we know on day 3?" answered only from what existed
  then.
- **Every version.** Each version of a document or a screen, and the prior
  attempts that did not land.
- **Evidence on every answer.** Each answer cites the memories it rests on,
  shows recorded links differently from inferred ones, and carries a label
  computed from the evidence ("supported" or "insufficient evidence"),
  never chosen by a model.

The dataset is the project itself. Blackbox remembers its own nine-day
build, starting from the first commit in this repository.

## Running it

Needs Node 26 or newer (SQLite and TypeScript stripping are built in, so
there is no build step and no native dependency) and, for phrasing,
`llama-server` from llama.cpp (`brew install llama.cpp`).

```bash
npm install
npm run check                       # typecheck + tests
node bin/blackbox.ts intake git .   # this repository becomes memories
node bin/blackbox.ts status
node bin/blackbox.ts ask "what happened today"
```

The brain lives in `./data` (gitignored). To phrase answers locally, start
the pinned model (see `MODELS.md`) and add `--phrase`:

```bash
llama-server -hf bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M --host 127.0.0.1 --port 8089 --ctx-size 8192 --no-webui
node bin/blackbox.ts model status
node bin/blackbox.ts ask "what happened today" --phrase
```

## Models

The engine is deterministic and local: why-chains, as-of, versions and
labels are computed here, with no model in the loop. The models each have
one job, all on Meta's hosted API paid by the event credit (D11): Muse
Spark 1.3 phrases every answer and proposes links with quoted evidence;
Muse Wonder is the investigator agent; Voice Transcribe turns spoken
decisions into memories; SAM 3.1 tracks a UI element across screen
recordings. Muse Glimmer (open weight) is the opt-in phrasing model on
partner inference. Every call leaves through one egress: redacted, checked
against the erased-values denylist, consented (once for text, per call for
audio and video), and recorded with its token counts. The promise is: nothing leaves without being shown first.

## Privacy and security

- Sources are redacted before storage. Secrets never enter the memory.
- Agent session transcripts are the most private source. They are redacted
  on intake and readable only by the owner. Nothing from a session is ever
  sent to a model; when an answer rests on session memories, only the
  engine's bounded, redacted answer surface (lead, steps, citations) is.
- Every outbound call is redacted, denylist-checked and recorded as an
  event with its token counts, so the brain can answer "what did we ever
  send out". Text egress is consented once at setup; audio and video are
  shown and consented per call.
- Forgetting is owner-only and leaves a tombstone.
- No live team feed of any kind. Durable forge records (an issue, a PR,
  its commits) are fine as context.

## Built during the Meta AI Developer Hackathon, Oct 26–Nov 4 2026

Everything in this repository was built during the hackathon build window
(Oct 26, 12:00 PM ET to Nov 4, 9:00 PM ET). The repository was created on
Oct 27, 2026 and its commit history is the record. This section is kept in
step with that history.

This project is inspired by the owner's earlier "One Ask" work (memory
kinds, recorded vs inferred links, why-chains, as-of, tombstones), but it is
a separate project in a fresh repository. No code or file from that earlier
work is copied in; only ideas carry over.

| Date | What was built |
| --- | --- |
| 2026-10-27 | Repository created. README with this section, `.gitignore` for recordings, model files and secrets. |
| 2026-10-27 | `DECISIONS.md` seeded with the day's decisions (D1 to D9). `PLAN.md`: the agreed nine-day plan. Found that Muse Glimmer (30B) cannot run on the 16 GB build machine; local phrasing moves to a small Llama, Glimmer to partner inference behind the gate (D9). |
| 2026-10-27 | Day 1 engine: TypeScript skeleton with tests, redaction (key shapes, assignments, emails, tokens, erased-values denylist), append-only SQLite event log with rebuildable memories and links, git intake (commits, branches, recorded links: touches, parent, cites D<n>, at), `ask "what happened today"` with citations and a computed label, CLI. Local model client with drained pipes; Llama 3.2 3B Instruct pinned as the local phrasing model (D10). The brain answered its first question about its own day from its own commits. |
| 2026-10-27 | D11: all LLM work moves to the hosted Meta API on the event credit; the local Llama leaves the default path; the egress gate moves to day 4; D4 narrowed to "only the engine's answer surface ever leaves". |
| 2026-10-27 | Day 2 engine: every committed version of every Markdown file is a doc-version memory (version-of, wrote, supersedes, one current pointer per file); every `### D<n>` section of `DECISIONS.md` in every version is a decision memory, versioned by wording, with recorded revises/narrows/cites links taken from its own words; why-chains (`ask "why ..."`) walk from a file, commit or decision back to the decisions behind it, each step cited with its link kind and evidence; `intake all`. |
