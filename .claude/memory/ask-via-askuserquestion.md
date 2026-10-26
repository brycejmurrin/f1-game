---
name: ask-via-askuserquestion
description: "Question tool for Bryce's decisions — Bryce-attended sessions only; fleet workers post BLOCKED (2026-10-25/26)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1138139f-97b0-56ad-a9a9-703e995795c1
  modified: 2026-10-26T03:59:32.632Z
---

Bryce, 2026-10-18: "Use ask user question for everything you want from me but explain".
Narrowed 2026-10-25 ~21:00 PT ("Do all" on the Fleet A transcript audit, D1/D2): workers never use AskUserQuestion; an orchestrator uses it only when the fleet is otherwise idle. Reason: the tool parks the session until answered (OrchA 32 sat 15.5 h, four READY PRs waited +40 h).

**Why:** he reads on a phone; selectable options with context are easier than buried prose questions — but a blocking question must not stall merges or lanes.

**How to apply:** while lanes or merges are in flight, put the decision in a normal reply (what, why, options, recommendation first) and keep working; use the question tool only when nothing else can proceed. Workers escalate to their orchestrator (BLOCKED), never ask Bryce directly. This preference never creates a need for approval when work is already authorized. Related: [phone use](user-plays-on-phone.md).

**Scope (2026-10-26 audit):** only in a session Bryce is attending (he typed in it this turn). An unattended fleet session — worker, owner, hunter, sync, watcher, or an orchestrator with no Bryce turn pending — posts `BLOCKED <PR> <question>` with an expiry to its orchestrator instead; the orchestrator decides or asks Bryce in a normal reply.
