---
name: discuss-decisions-with-fleets
description: Bryce 2026-10-22 — cross-fleet decisions are discussed with the other orchestrators (bus + webhook) before acting
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4b980663-12d0-509f-9c55-160b15185b63
  modified: 2026-10-22T09:32:20.288Z
---

Bryce, 2026-10-22 ~09:34Z, in OrchA 23: "Whatever you decide, discuss". He said it after the merge-attribution and train-freeze decisions were proposed on the bus and the webhook, agreed with DAD (Fleet D), and only then built.

**Why:** fleets share one deploy branch, one runner pool and one account. A unilateral decision (pacing, ownership, tooling that changes how others merge) collides with the other fleets. It also costs Bryce a referee round.

**How to apply:** before acting on any decision that touches another fleet, its PRs, the merge or train rules, or shared tooling, post the proposal on the bus and send it to the other coordinators (Fleet D's DAD over the agent webhook, Merlin over the bus). Take their amendments, then act or bring the agreed version to Bryce through AskUserQuestion. Purely in-fleet calls (lane scope, model, archiving my own lanes) stay mine. Related: [[ask-via-askuserquestion]], [[orchestrator-may-spawn-sessions]].
