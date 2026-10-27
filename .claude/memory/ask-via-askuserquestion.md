---
name: ask-via-askuserquestion
description: "Question tool for Bryce's decisions — Bryce-attended sessions only; unattended workers use the needs-decision label (2026-10-27)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1138139f-97b0-56ad-a9a9-703e995795c1
  modified: 2026-10-26T03:59:32.632Z
---

Bryce, 2026-10-18: "Use ask user question for everything you want from me but explain".
Narrowed 2026-10-25 ~21:00 PT ("Do all" on the Fleet A transcript audit, D1/D2): workers never use AskUserQuestion. Reason: the tool parks the session until answered (an orchestrator sat 15.5 h, four PRs waited +40 h).

**Why:** he reads on a phone; selectable options with context are easier than buried prose questions — but a blocking question must not stall merges or lanes.

**How to apply:** while lanes or merges are in flight, put the decision in a normal reply (what, why, options, recommendation first) and keep working; use the question tool only when nothing else can proceed. Workers use the `needs-decision` label plus one comment (docs/WORKERS.md), never ask Bryce directly. This preference never creates a need for approval when work is already authorized. Related: [phone use](user-plays-on-phone.md).

**Scope (2026-10-26 audit):** only in a session Bryce is attending (he typed in it this turn). An unattended session (a worker, or any session with no Bryce turn pending) labels `needs-decision` and leaves one comment with options and its pick instead.
