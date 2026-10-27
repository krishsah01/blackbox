# Models

Every model Blackbox uses, with its job, where it runs, and (for local
weights) the exact file. Nothing here is "latest": the brain must be able
to say which weights phrased an answer.

## Local, default path (nothing leaves the machine)

| Job | Model | File | SHA-256 | Size | Runs under |
| --- | --- | --- | --- | --- | --- |
| Phrase every answer (the engine proves, the model phrases) | Llama 3.2 3B Instruct, Q4_K_M GGUF (Meta open weights, Llama 3.2 Community License; quantized by bartowski) | `bartowski/Llama-3.2-3B-Instruct-GGUF` → `Llama-3.2-3B-Instruct-Q4_K_M.gguf` | `6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff` | 2.02 GB (2,019,377,696 bytes) | `llama-server` (llama.cpp 0.7.0, build 11669) on 127.0.0.1:8089 |

Chosen on 2026-10-27 (D10) after Muse Glimmer turned out not to fit this
16 GB machine (D9). Measured on the build Mac: llama-server holds 2.75 GB resident at idle with an 8,192-token context; the first evening question (12 steps) phrased in 7.9 s. SHA-256 verified against the downloaded file on 2026-10-27.

## Hosted, opt-in, through the egress gate only (from day 5)

| Job | Model | Where | Pays |
| --- | --- | --- | --- |
| Better phrasing, opt-in | Muse Glimmer 30B | Partner inference (Baseten or Modal credit) | Hackathon partner credit |
| Spoken decisions → decision memories | Muse Voice Transcribe | Meta API | $150 Meta credit |
| Link proposals with quoted evidence (proposed, never written) | Muse Spark 1.3 | Meta API | $150 Meta credit |
| Track a UI element across screen recordings | SAM 3.1 (video, 2 fps re-encodes) | Meta API | $150 Meta credit |
| "Before you touch this" investigator (if time) | Muse Wonder | Meta API | $150 Meta credit |

None of these is wired before the gate exists (PLAN.md, rule 5).
