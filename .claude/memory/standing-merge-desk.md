---
name: standing-merge-desk
description: "Since 2026-10-15 a standing [Merge Desk] session runs the desk (agent .claude/agents/merge-desk.md), woken hourly by a scheduled task; route SWEEP there"
metadata:
  node_type: memory
  type: project
  originSessionId: ef12c769-9941-5fd4-8a7f-d488dee68ee2
  modified: 2026-10-15T10:13:15.621Z
---

Bryce asked on 2026-10-15 for "a merge desk agent" and agents that "constantly work" the open PRs. Set up:
- Agent definition `.claude/agents/merge-desk.md` (PR #2126): one sweep, the ci-watch hard gate, and lane staffing (sync / re-cut / fix / steward / survey-assets workers as `[Merge Desk]` sibling sessions).
- Standing desk session `session_01HxsY4hN1t2fDG5DYYPhQYW`, woken hourly by the scheduled task `trig_01VKwnu9Rc6a6sXCPdfiSfJV`, and self-paced every 15 min with send_later.
- A fresh-session-per-fire routine was tried and deleted: routine-fired sessions got no repo source and no connector tools.

**Why:** a desk inside a working session dies when that session is archived (Bryce bulk-archived the first batch of workers at 09:56Z); the standing session plus the hourly wake survives it.

**How to apply:** send `SWEEP <PR#>` to the standing desk session, never merge or arm yourself, and don't archive `[Merge Desk]` sessions while PRs are open. If the desk session is gone, relaunch it from the agent file with the user's grants quoted. See [[pr-auto-merge]] and [[merge-fast-verify-on-ci]].
