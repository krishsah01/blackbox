# Decisions

Every decision that shapes this project, with its date and its reason. This
file is one of the brain's sources: each entry becomes a decision memory,
and why-chains walk through them. Append; never rewrite history. If a
decision is reversed, add a new entry that cites the one it reverses.

Format: `D<n>` (id), date, the decision as made, why, and what follows from
it. Keep the owner's words where they exist.

## Settled

### D1. Separate project, fresh repository (2026-10-27)

**Decision.** The hackathon entry is its own project in its own repository,
created on 2026-10-27 and made public at submission. It is not built on the
owner's earlier One Connect / One Ask work, and no file from that work is
copied in.

**Why.** Only work from Oct 26, 12:00 PM ET counts. One Connect's code
predates the window and judges can diff against it. "Inspired by" means
ideas and shapes carry over (memory kinds, recorded vs inferred links,
why-chains, as-of, tombstones, owner-only forgetting), not files. The
legitimate lessons are the earlier build guide's build order, its known
issues (an unread stderr pipe that blocks a chatty model process; a rebuild
flag that is never set), and its test shapes.

**Consequences.** Reading the earlier project for ideas is fine. Copying
from it is not. The README's "built during the hackathon" section must
match the commit history from the first commit.

### D2. Theme: Build for Your World (2026-10-27)

**Decision.** The entry is submitted under "Build for Your World": a problem
the owner knows firsthand.

**Why.** Impact (30% of the score) is judged on one specific person with a
painful problem, shown solved with real data. The owner is that person; the
problem is agents and people repeating failed attempts because nobody
remembers why the code is the way it is.

**Consequences.** The earlier "Push the Frontier" framing (robot bench, SAM
on bench video) is not the entry's theme. Its models and budget still apply
where a job fits.

### D3. Dataset: the project itself (2026-10-27)

**Decision.** The brain remembers its own nine-day build. The history starts
at the first commit of this repository.

**Why.** Every memory on the demo video was made during the event, so the
"what was built during the event" README is provable from inside the demo.
The person is the owner, the problem is firsthand, and the dataset cannot be
copied by another team.

**Consequences.** Recording (git, decisions, screen recordings) must be
running before any real building. The sources are this project's own git,
its own spoken and written decisions, its own screen recordings and its own
agent sessions. Nothing from One Connect, Study-Bro or the robot bench is in
it. The demo's weakest moment is day one, when the brain is nearly empty;
its strongest is day nine. Commits stay small so why-chains have steps.

### D4. Agent sessions are memories (2026-10-27)

**Decision.** The Claude Code and Codex sessions that build this project are
recorded as memories. The owner is the only reader. Session text is redacted
on intake and never sent to any hosted model.

**Why.** The sessions are where most of the reasoning behind the code
happens. This is the one place the entry goes further than the earlier
work, which kept agent logs out.

**Consequences.** Session text is the most private material in the brain and
is redacted like every other source. Glimmer phrases locally; what a hosted
model sees is a bounded, redacted answer surface, never a transcript. The
demo shows the owner's own transcripts, so what appears on screen is a
per-clip choice. Sessions count from the moment the repository exists; the
planning conversations before it are not the project's memory.

### D5. No live team feed (2026-10-27)

**Decision.** No presence, no "who is on which file now", no conflict radar
across machines, no team questions arriving live.

**Why.** A live feed of what people and their agents are doing could be used
badly, and the entry does not need it.

**Consequences.** Durable forge records that already exist (an issue taken
over, a PR, the commits in that PR) are fine as context. They are memories
like any other, with the same as-of, citations and forgetting. Nothing is
pushed to anyone and nothing updates in real time.

### D6. Track: Indie (2026-10-27)

**Decision.** Individual entry in the Indie track.

**Why.** Judged on creativity, technical ambition and whether it works, not
on production readiness for other users.

**Consequences.** Weight shifts toward the surprising capability and the
live demo, away from hardening for other users.

### D7. Models: hybrid, local by default (2026-10-27)

**Decision.** Muse Glimmer runs locally on the owner's Mac and phrases every
answer; the default path sends nothing out. Hosted Meta models (SAM 3.1,
Voice Transcribe, Muse Spark, Muse Wonder) each take one job the local model
cannot do, and reach the API only through a consent-gated, redacted egress,
paid by the owner's $150 Meta API credit. The promise is "nothing leaves
without being shown first".

**Why.** The Stage 1 gate needs meaningful use of Meta models; Best
Open-Weight needs an open weight doing the default work; the owner's
privacy rule needs the default path to stay local.

**Consequences.** The egress gate is part of the build, not an afterthought:
what will be sent is shown before it goes; redaction and the erased-values
denylist run on the outbound text; spend is a ledger of events with a cap.
The Glimmer size is bounded by 16 GB RAM shared with the engine and a screen
recorder, so the smallest Glimmer is the default. Video is sampled before
SAM (about 2 fps), never raw footage.

### D8. Name, visibility, plan and stack (2026-10-27)

**Decision.** The project is named **Blackbox**. The GitHub repository
`krishsah01/blackbox` is public from today. The nine-day plan in `PLAN.md`
is agreed as written on 2026-10-27: six build days (why-chains and as-of
first, egress gate on day 5, recordings and SAM on day 6), feature freeze
Nov 2, video Nov 3, submission Nov 4 by noon ET. Stack: TypeScript on Node,
SQLite, a local daemon with a web timeline, a CLI.

**Why.** "Blackbox" is the flight-recorder metaphor the owner started with;
the name collides with an existing coding-assistant product in search, and
the owner accepted that. Public from day one makes the dates provable and
lets the X post go out early. The plan puts the non-RAG capabilities first
because they are the entry; the gate lands before any hosted call.

**Consequences.** Later changes to the plan are appended to `PLAN.md` as
dated notes and cited here as new decisions.

### D9. Glimmer cannot run on this Mac; local Llama by default, Glimmer remote through the gate (2026-10-27)

**Decision.** Revises the local-model half of D7. A small Meta open weight
(a Llama model of about 3B parameters) runs locally and phrases every answer
by default, so the default path still sends nothing out. Muse Glimmer runs
on partner inference (Baseten or Modal hackathon credit) and is an opt-in
through the same consent-gated, redacted egress as the hosted Meta API
models. The hosted jobs for SAM 3.1, Voice Transcribe, Spark and Wonder are
unchanged.

**Why.** Checked on 2026-10-27 against Meta's docs and the model card:
Muse Glimmer ships in one size, about 29.6B parameters, dense. Its smallest
official GGUF (`Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf`) is 16.8 GB on
disk and needs about 15.6 GiB of memory for the text model alone, 19.0 GiB
with the vision projector and full context. This Mac has 16 GB of RAM
shared with the engine, a browser and a screen recorder. Muse Spark Open
is 816B total parameters. No smaller Meta open weight is listed.

**Consequences.** The privacy promise holds unchanged. Stage 1 is met by
Meta open weights locally plus the Meta API. Best Open-Weight stays
reachable because Glimmer does real phrasing work on partner inference.
Day 1 measures the local Llama, not Glimmer; Glimmer joins on day 5 with
the gate. If a model other than Llama is chosen for the local path, that is
a new decision.

## Open

Questions to settle when they come up, each becoming a numbered decision
above when it does.

- **Consent granularity.** Per call, per model, or per session?
- **Audio and video payloads at the gate.** The redactor cannot read a
  spoken key before it leaves. What does the gate show for a Voice
  Transcribe request (audio) or a SAM request (a video clip)?
- **Session memory shape.** One memory per session, or one per message or
  tool call? Which files are the source (`~/.claude/projects/<project>/*.jsonl`,
  `~/.codex/sessions`)?
- **Does a model ever write a memory**, or only propose one for a human to
  accept? The answer sets the whole provenance design.
