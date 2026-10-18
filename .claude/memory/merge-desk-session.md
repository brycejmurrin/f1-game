---
name: merge-desk-session
description: "2026-10-15 Merge Desk session_01WQY3pk… not found 2026-10-16; no desk named in the launch prompt → SWEEP-N/A"
metadata:
  node_type: memory
  type: project
  originSessionId: b036110f-fc33-575f-ba78-c775e822c2d2
  modified: 2026-10-15T07:37:48.069Z
---

On 2026-10-15 Bryce asked for a Claude Merge Desk ("I want agents to work together"). It is a persistent session, session_01WQY3pk88sN7o9MCxyAYoWr (title "[Merge Desk] desk (sonnet)", tag merge-desk), woken by its own send_later. Protocol: workers send `SWEEP <PR#>` when the draft tip is green and ready-gate passes; Merge Desk answers SYNC/FIX/DONE to owners and BLOCKED to the orchestrator.

**Why:** a fresh-session Routine had no GitHub connector and no way to talk to the fleet.

**How to apply:** route ready/arm requests to that session instead of arming yourself; if it is gone (list_sessions tag merge-desk), tell Bryce rather than acting as Merge Desk. Related: [[pr-auto-merge]].

**Stale check 2026-10-16:** `get_session session_01WQY3pk88sN7o9MCxyAYoWr` returns "the requested resource was not found" — that desk is gone. Before sending SWEEP, find the current `[Merge Desk]` session with `list_sessions` (or ask Bryce); do not message this id.
