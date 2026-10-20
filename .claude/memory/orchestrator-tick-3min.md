---
name: orchestrator-tick-3min
description: "Bryce wants fleet orchestrator check-ins every 3 minutes, not hourly"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 85e68393-7022-5421-a0ae-a6e51dc6aa09
  modified: 2026-10-19T21:54:23.160Z
---

Fleet orchestrator self check-ins run every 3 minutes while work is live: a self-rescheduling `send_later` that runs a compact status script, acts only on changes, and reports only changes.

**Why:** On 2026-10-19 (~14:55 PT), when asked which cadence to tighten, Bryce answered "Yours every 3 mins". An hourly check-in left the game queue idle while a slot sat unused.

**How to apply:** As orchestrator, schedule a 3-min tick rather than a 1 h check-in. Keep each tick's output small. Stop when no Fleet work is live. See [[watcher-tiered-cadence]] and [[lanes-keep-working]].
