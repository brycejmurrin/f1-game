---
name: track-with-tasks-and-messages
description: "Keep orchestration plans current and report verified changes; durable reservations coordinate worker ownership"
metadata:
  type: feedback
---

Keep a current task plan when coordinating several streams and record verified checkpoints. A host-local task
list is a planning aid; it is not the authority for queue admission, ownership or completion.

The durable coordinator ledger on `bot/actions-state` owns reservations and attempts. Workers verify an
authenticated reservation before editing, preserve the PR Plan and Hand-off, and report a GitHub write only after
it succeeds. A denied/failed write is not done. Repeated comments, labels or session messages cannot transfer a
lease or start a second worker; recovery requires evidence that the previous execution is no longer live.

Use the queue labels and `/apex` commands documented in `docs/ACTIONS.md`; the reset defaults to shadow. There is
no persistent dispatcher session to message and no fixed session id to preserve. A request recorded in GitHub is
not proof that a worker started, validation passed, approval was granted or a merge completed.

**Why:** Bryce's 2026-11-03 preference was to keep task plans and coordination current; the 2026-11-05 reset (D-031)
replaces the old session-message transport and label state machine. Preserve the useful planning and truthful
reporting behavior through the current coordinator instead of following the retired transport.

**How to apply:** read AGENTS.md §Coordination, `docs/ACTIONS.md`, and the assigned item's actual head/ledger state.
Use only exposed host capabilities. Keep decision requests, waiting reasons and evidence on the issue/PR, and do
independent work while an answer is pending. Do not launch another worker to move an existing owner along.
