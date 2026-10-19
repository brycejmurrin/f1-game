---
name: orchestrator-dispatches-pages
description: Orchestrator should dispatch pages.yml itself after merges rather than wait for the hourly cron
metadata:
  node_type: memory
  type: feedback
  originSessionId: 0be09eb6-e479-5f89-bbda-c9c821636828
  modified: 2026-10-19T08:53:51.306Z
---

Bryce (2026-10-19, to ORCH7): "No wait you should dispatch pages" — the orchestrator dispatches pages.yml on the deploy branch when a merged tip has no train (e.g. prose-only pushes that pages.yml paths-ignores), instead of waiting for the :41 cron.

**Why:** waiting up to an hour for a green Pages verdict stalls the game-code merge queue (one game merge per green Pages run).

**How to apply:** before dispatching, list pages.yml runs; if one is already queued/in progress for the tip, don't dispatch (never dual-dispatch). Related: [[orchestrator-may-spawn-sessions]].
