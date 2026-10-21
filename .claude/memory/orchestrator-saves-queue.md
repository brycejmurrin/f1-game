---
name: orchestrator-saves-queue
description: Orchestrators persist current tasks + merge order to a pushed state branch every tick (Bryce 2026-10-21)
metadata:
  node_type: memory
  type: feedback
  originSessionId: f246253f-2746-517c-a369-dae5d82da68d
  modified: 2026-10-21T03:44:10.628Z
---

Bryce (2026-10-21 03:43Z): "Make sure we save our current tasks constantly and merge orders."

**Why:** orchestrators rotate at 200k context and containers get reclaimed; the queue, lane roster and merge order must survive without anyone re-deriving them.

**How to apply:** keep `scratch/orch<fleet><gen>/QUEUE.md` (gate state, numbered merge order, lane table with session ids, pending Bryce asks) on a pushed `cursor/orch…-queue-…` branch that is never merged; refresh + push it on every tick and after every merge, routing change or launch; name it in the successor's handoff brief. Related: [[orchestrator-tick-3min]].
