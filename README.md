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

## Models

Hybrid, local by default. Muse Glimmer runs on the owner's Mac and phrases
every answer; the default path sends nothing out. Hosted Meta models
(SAM 3.1, Voice Transcribe, Muse Spark, Muse Wonder) each take one job the
local model cannot do, and reach the API only through a consent-gated,
redacted egress. The promise is: nothing leaves without being shown first.

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
