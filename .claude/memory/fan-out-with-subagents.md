---
name: fan-out-with-subagents
description: "Bryce 2026-10-26 — multi-part fleet tasks (PR trains, fixes): fan out to worker subagents in worktrees, not one serial session"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6cd5e205-9afa-5be7-b458-4652773f2f8c
  modified: 2026-10-26T17:47:13.652Z
---

Bryce (2026-10-26 ~10:50 PT, while building PR trains and testing relays): "Use subagents and worktrees as needed" — and rejected a slow serial board query.

**Why:** serial investigation of 65 PRs was slow; independent trains and fixes can run in parallel.

**How to apply:** after a short survey, split independent work (one train, one fix each) across `worker` subagents with `isolation: "worktree"`; keep the coordinator on messaging and decisions. Respect AGENTS.md rule 4/5 load limits (no browser run in a subagent). Related: idle lanes doing parallel work.
