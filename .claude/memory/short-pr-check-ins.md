---
name: short-pr-check-ins
description: "PR check-ins short, never hours (Bryce 2026-10-19); the number is pending Bryce"
metadata:
  node_type: memory
  type: feedback
  originSessionId: fdb8a634-8c89-5546-8810-0445fb46bfcf
  modified: 2026-10-20T00:52:02.429Z
---

A session that owns or drives a PR keeps a short `send_later` safety-net check-in while the PR is open, never hours apart.

**Why:** Bryce, 2026-10-19 ~22:30Z: "Four hours is way too long do way sooner", when a PR check-in was armed hours out. The "~15 min" figure was an agent's inference from that sentence, not his number.

**Number pending Bryce (2026-10-26 audit):** 15 min costs $0.11–0.15 per idle wake on a 200k+ owner, and a wake past 60 min misses the 1 h prompt cache. The current rule is AGENTS.md rule 13 (50–55 min, inside the cache) until Bryce picks the number.

**How to apply:** follow AGENTS.md rule 13; cancel the check-in when the PR merges, closes, or you sent READY. Orchestrator cadence: `agent-fleet` orchestrator.md §First acts.
