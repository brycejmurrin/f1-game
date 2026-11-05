---
name: track-with-tasks-and-messages
description: "Keep implementation plans current; the Actions coordinator schedules PR tests and never launches coding agents"
metadata:
  type: feedback
---

Keep a current task plan when coordinating several streams and record verified checkpoints. A host-local task
list is a planning aid; it is not the authority for queue admission, ownership or completion.

The Actions ledger on `bot/actions-state` records PR test requests and GitHub run attempts, not coding-agent
ownership. Implementation is performed by a human or user-authorized native agent under an explicit brief.
Ready PRs automatically enter validation; `/apex merge` is explicit merge intent. `/apex recover` addresses only
missing PR test evidence and cannot launch, reassign or resume a coding agent.

Use the two PR labels and controls documented in `docs/ACTIONS.md`; the reset defaults to shadow. Record a GitHub
write only after it succeeds. A saved plan, comment or test reservation proves neither implementation handoff,
completed validation nor approval. Native handoff remains separate from the PR/test coordinator.

**Why:** Bryce's 2026-11-03 preference was to keep task plans and coordination current; the 2026-11-05 PR/test-only correction (D-032)
replaces the old session-message transport and label state machine. Preserve the useful planning and truthful
reporting behavior through the current coordinator instead of following the retired transport.

**How to apply:** read AGENTS.md §Coordination, `docs/ACTIONS.md`, and the assigned item's actual head/ledger state.
Use only exposed host capabilities. Keep decision requests, waiting reasons and evidence on the issue/PR, and do
independent work while an answer is pending. The coordinator never starts a coding successor.
