---
name: standing-merge-desk
description: "2026-10-15 a standing [Merge Desk] session + hourly wake ran the desk; Bryce stopped and archived it at ~10:35Z and the wake is disabled"
metadata:
  node_type: memory
  type: project
  originSessionId: ef12c769-9941-5fd4-8a7f-d488dee68ee2
  modified: 2026-10-15T10:35:49.719Z
---

Bryce asked on 2026-10-15 for "a merge desk agent" and agents that "constantly work" the open PRs. What was built:
- Agent definition `.claude/agents/merge-desk.md` (PR #2126): one sweep, the ci-watch hard gate, and lane staffing (sync / re-cut / fix / steward / survey-assets workers as `[Merge Desk]` sibling sessions).
- Standing desk session `session_01HxsY4hN1t2fDG5DYYPhQYW`, woken hourly by scheduled task `trig_01VKwnu9Rc6a6sXCPdfiSfJV`.
- At ~10:35Z Bryce stopped and archived every session (that desk's hourly task is disabled). At ~10:37Z he asked to retry with Sonnet: the desk is now `[Merge Desk] desk (sonnet)` session_01WQY3pk88sN7o9MCxyAYoWr (model claude-sonnet-5-5, auto), woken hourly by trig_012C3b3etWvDsQxxsGvd5H6E; it launches its own lane workers, all Sonnet on auto.
- A fresh-session-per-fire routine was tried and deleted: routine-fired sessions got no repo source and no connector tools.

**Why:** a desk inside a working session dies when that session is archived (Bryce bulk-archived workers twice that morning); a standing session plus the hourly wake was the attempt to survive that.

**How to apply:** send SWEEP to the Sonnet desk session; don't archive `[Merge Desk]` sessions while PRs are open (unpushed worker commits are lost). If the desk is gone, ask Bryce, then relaunch it from merge-desk.md (Sonnet, auto) with his grants quoted and re-point the hourly task. Never merge or arm without the Merge Desk designation. See [[pr-auto-merge]] and [[merge-fast-verify-on-ci]].
