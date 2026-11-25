---
name: orchestrator-routines
description: "Orchestrator sessions: run two standing self-bound scheduled tasks, a FULL cycle hourly at :19 and a LIGHT PR check at :49, and re-create them on every rotation"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-25T04:45:00Z
---

Bryce (2026-11-25 ~04:20Z): "Let's make sure you setup routines for yourself";
"We should do smaller intermittent check on the other hour so every half hour";
"It should also Chdck PRs and if needed follow up with owners or workers";
"Make sure these are stored in agents or orchestrator description or in memory".

**Why:** between his prompts the orchestrator went idle, and PRs sat red,
conflicting or green-but-unflipped until he asked. An hourly cycle alone left
the gaps too long; the half-hour light check closes them.

**How to apply:**
- On start, an orchestrator creates two `create_trigger` tasks bound to its own
  session, initiation `human_request`: FULL at `19 * * * *`, LIGHT at
  `49 * * * *` (never minute 0). Their checklists live in skill `dispatcher`
  `references/orchestrator-brief.md` §Standing routines.
- LIGHT is the PR follow-up: message the owner of a red, conflicting or stalled
  PR, or launch one `CONTINUE PR` when it has none; silent when nothing changed.
- A successor re-creates both and disables the predecessor's with
  `update_trigger enabled:false`. Never delete them (deletion was refused
  2026-11-25).

Related: [[orchestrator-checkin-and-task-list]].
