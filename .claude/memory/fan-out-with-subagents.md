---
name: fan-out-with-subagents
description: "Bryce 2026-10-26 — multi-part tasks (several independent fixes or PRs): fan out to worker subagents in worktrees, not one serial session"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6cd5e205-9afa-5be7-b458-4652773f2f8c
  modified: 2026-10-26T17:47:13.652Z
---

Bryce (2026-10-26 ~10:50 PT, while building PR trains and testing relays): "Use subagents and worktrees as needed" — and rejected a slow serial board query.

**Why:** serial investigation of 65 PRs was slow; independent fixes can run in parallel.

**How to apply:** after a short survey, split independent work (one fix or one PR each) across `worker` subagents with `isolation: "worktree"`; the parent session keeps the decisions and merges their branches or reads their PRs. Respect AGENTS.md rule 4/5 load limits (no browser run in a subagent). Each subagent PR follows docs/WORKERS.md like any worker (the PR is the report; `land` lands it). PR trains and orchestrators were retired 2026-10-27.
