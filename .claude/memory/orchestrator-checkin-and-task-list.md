---
name: orchestrator-checkin-and-task-list
description: "Orchestrator sessions: build the FULL PLAN as tasks at session start, check in on every live worker each cycle, and keep the task list current after every state change"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-25T05:40:00Z
---

Bryce (2026-11-20 ~07:14Z): "Update your memory to check in on sessions and also
continuously update your task list". He asked for it after a night of managing
~20 worker sessions. Before that he had to say "read all sessions and archive
those done or merged and launch more" and "update your task list to get full
scope" himself. Again on 2026-11-25 ~05:27Z, after a rotated orchestrator started with a
thin list (6 tasks) and built the full plan only when asked: "You need to update
memory or orchestrator role to always have a task list of full plan."

**Why:** an orchestrator that only reacts to the messages that arrive misses
workers that went idle, capped out or got stuck in silence. A stale task list
also hides scope. Bryce should never have to prompt the sweep.

**How to apply:**
- At session START, before any other work, build the FULL PLAN as tasks from the
  handoff, the Board and a PR/session survey: every open PR (ready/draft, owner),
  every live worker with its PR, every wait-on-Bryce item, every held or dependency
  item ("after #n merges"), the standing routines, and the next launches. Each
  cycle (the :19 and :49 routines) refreshes it; nothing in flight lives only in chat.
- Each orchestrator cycle (and whenever no message has arrived for a while), list
  the child sessions (`list_sessions` with `children:true`; save large output to a
  file and summarise it with a script). Then for each live one:
  - read its last state;
  - archive it if it is done or merged;
  - nudge or replace it if it is idle and blocked on something that has cleared;
  - relaunch it if it hit its context cap.
  Do not wait for him to ask.
- Keep the task list (TaskCreate/TaskUpdate) as the full picture:
  - one task per stream: each blocked PR chain, the landing set, the batch workers,
    the clicks Bryce still owes, the upkeep;
  - each task holds the owning session ids and the next trigger;
  - update it in the same turn as any merge, launch, archive, decision or click.
  It is what survives a compaction.
- Report each check-in to Bryce in one short status: what merged, what was archived,
  what launched, which links need his click.

Related: AGENTS.md §Coordination (an orchestrator
does reversible things without asking and reports after), skill `steward` §Lane.
