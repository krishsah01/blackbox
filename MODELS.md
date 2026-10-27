# Models

Every model Blackbox uses, with its job, where it runs, and (for local
weights) the exact file. Nothing here is "latest": the brain must be able
to say which weights phrased an answer.

## Local

No model runs locally in the product path (D11, 2026-10-27). The engine
itself is local and deterministic. For the record, day 1 ran Llama 3.2 3B
Instruct Q4_K_M (`bartowski/Llama-3.2-3B-Instruct-GGUF`, SHA-256
`6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff`,
2.02 GB) under llama-server as the phrasing model (D10): 2.75 GB resident
at idle, 7.9 s to phrase a 12-step answer. It is a development stand-in
behind `ask --phrase` until the gate lands on day 4, then removed.

| Job | Model | Where | Pays |
| --- | --- | --- | --- |
| Better phrasing, opt-in | Muse Glimmer 30B | Partner inference (Baseten or Modal credit) | Hackathon partner credit |
| Spoken decisions → decision memories | Muse Voice Transcribe | Meta API | $150 Meta credit |
| Link proposals with quoted evidence (proposed, never written) | Muse Spark 1.3 | Meta API | $150 Meta credit |
| Track a UI element across screen recordings | SAM 3.1 (video, 2 fps re-encodes) | Meta API | $150 Meta credit |
| "Before you touch this" investigator (if time) | Muse Wonder | Meta API | $150 Meta credit |

None of these is wired before the gate exists (PLAN.md, rule 5). Text
egress is consented once at setup; audio and video per call. Every call is
redacted, denylist-checked and logged with its token counts. Never
`muse-spark-1.3-contributor` for private material.
