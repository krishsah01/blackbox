# Plan: the nine days

Status: **agreed by the owner on 2026-10-27** (decision D8 in
`DECISIONS.md`). **Read the Notes at the end: D11 changed the model
plan and moved the gate to day 4.** Changes are appended as dated notes at the end, never
edited in place, so the brain can answer "what was the plan on day 3".

## Budget

| Window | Dates | What happens |
| --- | --- | --- |
| Build | 2026-10-27 to 2026-11-01 (6 days) | New capability lands every day |
| Feature freeze | 2026-11-02 | No new features. Self-score, cut, fix, rehearse |
| Video | 2026-11-03 | Record the 3-minute demo from the real brain; X post clip |
| Submit | 2026-11-04 by 12:00 PM ET | Hard close is 9:00 PM ET; noon leaves a buffer |

Meta workshops the owner attends: Agents 101 (Oct 27, 12:00 PM ET) and
Agents 102, verifiable agents (Oct 28, 12:00 PM ET).

## Rules for the week

1. **Record first, build second.** Screen recording, git, decisions and
   agent sessions are all being captured before engine code is written
   (see "Recording" below).
2. **The non-RAG parts first.** Why-chains, as-of, every-version and prior
   attempts are the product. Full-text or vector search over memories comes
   last, if at all, and is never the pitch.
3. **The brain answers one real question every day.** At the end of each
   day, ask it something about that day and screen-record the answer. This
   is the daily proof it works on real history, and it is demo material.
4. **Small commits, dated decisions.** Every fork in the road is a `D<n>`
   entry in `DECISIONS.md`, and commit messages cite the decision they act
   on (`D3`), so recorded links exist from day one.
5. **Nothing leaves without being shown first.** No hosted call is wired
   before the egress gate exists.
6. **Honest labels.** Nothing shown as current when stale; every answer
   carries a computed label.

## Proposed stack

TypeScript on Node. SQLite as an append-only event log with derived tables
(memories, links, versions). A small local daemon serving a local web UI
(the timeline with the as-of slider) and a CLI for intake and questions.
`llama-server` for the local phrasing model (a small Meta open weight,
Llama about 3B; see D9). Muse Glimmer on Baseten or Modal credit, reached
only through the egress gate. `ffmpeg` for re-encoding
recordings to 2 fps H.264 before any SAM call. Tests run on every commit.

Why: a web timeline is the demo; TypeScript gets there fastest for one
person in six days, and the earlier work's lessons (process handling, test
shapes) transfer to it directly without any code being copied.

## Recording (in place before day-1 code)

- **Git.** This repository, small commits, DCO sign-off.
- **Decisions.** `DECISIONS.md`, appended on every fork.
- **Screen recordings.** The owner records build sessions. Saved outside the
  repository (or on an external disk; this Mac has about 11 GB free) as
  H.264 MP4. A 2 fps re-encode is made only for clips sent to SAM.
- **Agent sessions.** Claude Code and Codex session files for this project,
  read by the intake with redaction, owner-only.
- **Spoken decisions.** Short voice notes when a decision is made out loud;
  transcribed later through the gate by Voice Transcribe.

## Day by day

Each day names what lands and the question the brain must answer that
evening.

### Day 1, Oct 27: skeleton, store, git intake, local model running

- Repo, README, decisions, plan (this file), recording started.
- Project skeleton with a test runner.
- Memory model and append-only store. Memory kinds to start: `commit`,
  `branch`, `decision`, `doc-version`, `session`, `clip`. Links with a `how`
  of `recorded` or `inferred`. Redaction on intake (keys, tokens, emails,
  paths the owner lists), with a denylist of erased values.
- Git intake: commits and branches of this repository become memories;
  "touches file" and "cites D<n>" are recorded links.
- Local phrasing model (Llama, about 3B, pinned checksum) started under
  `llama-server`, stderr drained, memory footprint measured next to the
  store and a screen recorder. Glimmer does not fit this Mac (D9).
- **Evening question:** "What happened today?" answered from commits alone.

### Day 2, Oct 28: decisions, versions, why-chains

- Decision intake: every committed version of `DECISIONS.md` becomes
  decision memories with their dates.
- Doc versions: every committed version of tracked Markdown files.
- Why-chain query: deterministic walk over recorded links first, inferred
  second; each step cited.
- **Evening question:** "Why is the repo separate from One Connect?"
  answered with D1 and the commits that acted on it.

### Day 3, Oct 29: as-of, computed confidence, agent sessions

- As-of: any question pinned to a moment, built only from memories that
  existed then, including "what did we know when we decided D<n>".
- Versions and prior attempts (branches and commits that did not land).
- Computed confidence: one number with its inputs shown (recorded vs
  inferred link count on the chain, coverage, distance from the as-of moment
  to the newest memory, whether any cited memory is partial or forgotten).
  Label "supported" or "insufficient evidence" is derived from it.
- Agent session intake (Claude Code and Codex session files), redacted,
  owner-only, never on the egress path.
- **Evening question:** "What did we know on day 1 about the model plan?"

### Day 4, Oct 30: the model phrases, the engine proves; timeline UI

- Local phrasing layer over the engine's cited answer: the model phrases,
  the engine proves. A verify step recomputes the chain and strikes any
  sentence without a cited memory.
- Timeline UI with the as-of slider, why-chain view, versions view.
- **Evening question:** asked through the UI and phrased by the local model.

### Day 5, Oct 31: the egress gate, first hosted jobs

- Egress gate: shows exactly what will leave, runs redaction and the
  erased-values denylist on it, records the call as an event, keeps a spend
  ledger with a cap that pauses the remote path.
- Muse Glimmer on partner inference (Baseten or Modal credit) as the
  opt-in phrasing model behind the gate: the same bounded, redacted answer
  surface, shown before it leaves.
- Voice Transcribe: voice notes become decision memories cited by audio
  timestamp.
- Muse Spark as a link proposer, never a writer: proposed links with a
  quoted evidence span, stored as a third `how` ("proposed") that why-chains
  rank below recorded and inferred.
- **Evening question:** "What did we ever send out?" answered from the
  ledger.

### Day 6, Nov 1: recordings as memories, forgetting, agent

- Screen recording clips on the timeline; SAM 3.1 tracks a UI element across
  recordings ("when did the dock move") cited by clip and timestamp, from
  2 fps re-encodes.
- Forgetting: owner-only erase of a value everywhere, tombstone left, value
  added to the denylist so no model ever sees it again.
- If time: Muse Wonder as the "before you touch this" investigator, and an
  MCP server so a coding agent asks the brain before editing.
- **Evening question:** "Why does the gate exist?" with the full chain.

### Day 7, Nov 2: feature freeze

- Self-score against the rubric; anything under 7 overall means cut scope.
- Fix, test the exact surfaces the video will exercise, rehearse the script
  with a timer, record a dry run.

### Day 8, Nov 3: video and post

- Record the 3-minute demo from the real brain. Clip for the X post.
- README "built during the hackathon" table finalized against `git log`.

### Day 9, Nov 4: submit

- Submit by noon ET with repo public and every contributor listed.

## Cut order if behind

First cut first. Glimmer fine-tuning is already out.

1. Wonder agent and MCP server
2. SAM on screen recordings
3. Spark link proposals
4. UI polish beyond the timeline and why-chain view

Never cut: why-chain, as-of, citations, computed confidence, redaction on
intake, the egress gate, local phrasing with a Meta open weight.

## Demo shape (draft; fixed on Nov 2)

Open on what retrieval cannot do, in the first 20 seconds: the timeline of
the project's own nine days, scrubbed with the as-of slider. A spoken
question becomes a why-chain that walks from today's code to the decision
and the agent session where it was made, each step cited. A planted fake
key is erased live and the gate is shown refusing to send it. The label on
every answer is computed and its inputs are visible. Nothing is mocked.

## Open questions for the owner

Asked as they come up, not all at once. See the "Open" section of
`DECISIONS.md`.

## Notes (appended, dated)

- **2026-10-27, day 1 done.** Everything on the day-1 list landed: skeleton
  with tests, redaction, append-only store, git intake, "what happened
  today" with citations and a computed label, a local model running. Two
  changes against the plan as written: the local model is Llama 3.2 3B
  Instruct, not Glimmer (D9, D10), and the evening question found a bug
  (a moved branch shown at its old commit), fixed the same evening. One
  observation for day 4: when phrasing, the 3B model repeated a step and
  wrote a shortened citation that is not a real ref. The verify step that
  strikes any sentence without a cited memory is needed, not optional.
  Screen recording has not started yet; that is the owner's step and is
  the first thing on day 2.
- **2026-10-27, D11: the LLM work moves to the hosted Meta API.** The
  owner's words: "lets just use meta api 150 credit that I got from the
  event to use their llm". Muse Spark 1.3 phrases every answer; Wonder is
  the agent; the local Llama leaves the default path; Glimmer stays only as
  the opt-in phrasing model on partner credit (Best Open-Weight). Changes
  to the days as written: the **egress gate moves to day 4** (one-time
  consent for text, per-call for audio and video; every call redacted,
  denylist-checked and logged with token counts) and **Spark phrasing with
  the verify step lands with it**; day 4's timeline UI starts the same day
  and finishes on day 5; day 5 keeps Voice Transcribe and Spark link
  proposals and adds Glimmer on partner credit. Rule 5 now reads: no
  hosted call before the gate exists, and nothing from an agent session
  ever leaves, only the engine's bounded answer surface. "Never cut" now
  reads: why-chain, as-of, citations, computed confidence, redaction on
  intake, the egress gate with its ledger.
