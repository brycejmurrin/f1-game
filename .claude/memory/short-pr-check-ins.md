---
name: short-pr-check-ins
description: "PR safety-net check-ins every ~15 min, never hours (Bryce 2026-10-19)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: fdb8a634-8c89-5546-8810-0445fb46bfcf
  modified: 2026-10-20T00:52:02.429Z
---

A session that owns or drives a PR re-arms its `send_later` safety-net check-in about every 15 minutes while the PR is open, not the 50-min/4-hour cadence of the generic PR-watch default.

**Why:** Bryce, 2026-10-19 ~22:30Z: "Four hours is way too long do way sooner", when a PR check-in was armed hours out.

**How to apply:** after each push or wake on an open PR, arm the next check-in ~15 min out; cancel it when the PR merges or closes. Orchestrators keep their own cadence: [[orchestrator-checkin-cadence]] and [[orchestrator-tick-3min]].
