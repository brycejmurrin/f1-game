---
name: sessions-run-sonnet
description: "Bryce 2026-10-16 — spawned sessions, lanes, workers and scheduled fresh-session tasks run Sonnet (claude-sonnet-5-5), never Fable"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ef12c769-9941-5fd4-8a7f-d488dee68ee2
  modified: 2026-10-16T07:11:43.226Z
---

Bryce, 2026-10-16 ~07:15Z: "sessions should run sonnet not fable" and "archive all and respawn running sonnet" (scoped by his answer to the two Opus lanes).

**Why:** cost and throughput across a fleet of 10–20 lane sessions; Fable/Opus lanes were swapped out.

**How to apply:** every `create_session` for a lane/worker/steward passes `model: "claude-sonnet-5-5"`; a fresh-session scheduled task (`create_new_session_on_fire` / persist_session false) gets `model: claude-sonnet-5-5`. Orchestrator sessions Bryce opens himself keep whatever model he chose. See [[orchestrator-may-spawn-sessions]] and [[standing-merge-desk]].
