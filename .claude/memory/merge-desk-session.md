---
name: merge-desk-session
description: "Bryce designated a persistent Claude Merge Desk session (2026-10-15); workers send it SWEEP <PR#>"
metadata:
  node_type: memory
  type: project
  originSessionId: b036110f-fc33-575f-ba78-c775e822c2d2
  modified: 2026-10-15T07:37:48.069Z
---

On 2026-10-15 Bryce asked for a Claude Merge Desk ("I want agents to work together"). It is a persistent session, session_01R3whHoRN3TucnYrBdK5kAb (title "Merge Desk (f1-game)", tag merge-desk), woken hourly by trigger trig_01WCgB7LuMe9ySHLsPRRMbDp plus its own send_later. Protocol: workers send `SWEEP <PR#>` when the draft tip is green and ready-gate passes; Merge Desk answers SYNC/FIX/DONE to owners and BLOCKED to the orchestrator.

**Why:** a fresh-session Routine had no GitHub connector and no way to talk to the fleet.

**How to apply:** route ready/arm requests to that session instead of arming yourself; if it is gone (list_sessions tag merge-desk), tell Bryce rather than acting as Merge Desk. Related: [[pr-auto-merge]].
