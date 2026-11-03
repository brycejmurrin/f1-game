---
name: track-with-tasks-and-messages
description: "Fleet work: keep a TaskCreate/TaskUpdate list per stream, and workers send_message the dispatcher one-line status"
metadata:
  type: feedback
---

An orchestrating session (dispatcher, orchestrator) keeps a live task list,
one task per stream: the land queue, dirty PRs, drafts waiting on CI, each
launch wave, and items waiting on Bryce. It updates the list after each batch
of worker reports.

Every worker prompt ends with a Coordination line. The line tells the worker
to `send_message` the dispatcher
`#<issue> → PR #<n> <state> <sha> next: <step>` at five points: PR open, red,
`needs-decision`, `needs-owner` and `land`. A worker sends nothing else. A
status ping from the dispatcher needs no reply when nothing has changed, and a
worker sends a report only after the GitHub write it describes has succeeded
(the fleet review of 2026-11-03 counted duplicate and premature reports). To
move a live owner along, message it; never launch a second worker on the same
PR (#4597 got two CONTINUE workers in the same minute).

**Why:** Bryce, 2026-11-03 (relayed by the dispatcher): "use task planning
tools to keep track of everything", "use task tools and message to
coordinate", "update memory to use tasks more and messaging".

**How to apply:** on a fleet or orchestration task, open the task list before
the first launch. Put the Coordination line in every brief. Read the worker
messages before you read the Board. GitHub stays the state store
(AGENTS.md §Coordination); messages are the fast path, not the record.
Evidence: the fleet review note `docs/notes/AGENT-FLEET-REVIEW-2026-11-03.md` (its own PR).
