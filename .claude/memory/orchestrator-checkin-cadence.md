---
name: orchestrator-checkin-cadence
description: "Orchestrator self check-ins every ~10 min, plus a session roll-call each check-in"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 70600929-e1c4-516d-847a-9314ba4cce65
  modified: 2026-10-19T21:57:12.488Z
---

Orchestrator sessions arm a `send_later` check-in about every 10 minutes (not 30), and each check-in looks at every live session (list_sessions mine, parsed from the saved file) as well as Pages/CI/merge queue.

**Why:** Bryce, 2026-10-19 ~14:57 PT: "you need to check in more often also check all sessions here", after ORCH17 and OrchB 5 sat deadlocked waiting on each other for the game slot.

**How to apply:** Re-arm a 10-min `send_later` on every check-in; on any slot ambiguity with another fleet, settle it from deploy-branch history and post the answer on the bus at once rather than waiting. See [[watcher-tiered-cadence]].
