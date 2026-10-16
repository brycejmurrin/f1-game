---
name: worker-sessions-run-sonnet
description: "Spawned sibling/worker sessions run claude-sonnet-5-5, never Opus or Fable; Bryce had Opus lanes respawned on Sonnet 2026-10-16"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1a3325fb-8665-5c57-a3a8-40281e9219f1
  modified: 2026-10-16T07:12:06.228Z
---

Every sibling or worker session I spawn (fix lanes, sync helpers, stewards) passes `model: claude-sonnet-5-5` to create_session. Only orchestrators and Merge Desk may differ.

**Why:** On 2026-10-16 Bryce told orchestrator 01KbZH5r "sessions should run sonnet not fable", and chose "Only the 2 Opus lanes" when asked which sessions to archive and respawn on Sonnet. My Opus fix lanes cost about $30–100 each. The work was syncs, CI driving and SWEEPs, which Sonnet handles.

**How to apply:** Set `model` explicitly on every create_session, because it otherwise inherits the parent's model. See [[orchestrator-may-spawn-sessions]] and [[standing-merge-desk]].
