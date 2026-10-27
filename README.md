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

Hybrid, local by default. A small Meta open weight (Llama, about 3B) runs
on the owner's Mac and phrases every answer; the default path sends nothing
out. Muse Glimmer (30B, too large for this 16 GB machine) runs on partner
inference as an opt-in phrasing model. Hosted Meta models (SAM 3.1, Voice
Transcribe, Muse Spark, Muse Wonder) each take one job the local model
cannot do. Every remote call, Glimmer included, goes through a
consent-gated, redacted egress. The promise is: nothing leaves without being shown first.

## Privacy and security

- Sources are redacted before storage. Secrets never enter the memory.
- Agent session transcripts are the most private source. They are redacted
  on intake, readable only by the owner, and never sent to a hosted model.
- Anything sent to a hosted model is shown to the owner first and recorded
  as an event, so the brain can later answer "what did we ever send out".
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
