---
name: workers-never-wait-for-user
description: "Unattended sessions (dispatcher workers, child sessions) must not end a turn waiting for Bryce; they ask their parent or the dispatcher"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ef17451f-ebb2-5960-9145-314af97b1348
  modified: 2026-10-27T09:53:48.390Z
---

Bryce, 2026-10-27: worker sessions "are sometimes getting stuck waiting for user instead of asking you or dispatcher message them" — set it up so they don't. Seen live: the #2906 worker ended BLOCKED with "resume session to finish PR #3924" (waiting on CI with no subscription); nobody watches those sessions.

**Why:** no human reads a worker's session; a turn that ends on a question or "resume me" stalls its PR until the 2 h needs-owner relaunch.

**How to apply:** in every worker brief I write (create_session prompts, dispatch.mjs brief, worker subagent prompts): subscribe_pr_activity so CI wakes it; questions go to the parent via send_message `@parent` (or the `needs-decision` label + one comment), never to "the user"; never AskUserQuestion. As a parent/orchestrator, when a child shows BLOCKED or idle with work left, send it a concrete continue message rather than waiting. The durable fix belongs in docs/WORKERS.md and the dispatcher cycle (plan docs/plans/2026-10-27-review-fix-plan.md). Related: [[ask-via-askuserquestion]], [[decide-and-act]], [[fan-out-with-subagents]].
