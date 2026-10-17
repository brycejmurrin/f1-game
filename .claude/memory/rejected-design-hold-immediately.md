---
name: rejected-design-hold-immediately
description: "When Bryce rejects a design in-session, put MERGE-HOLD on the PR and tell the orchestrator at once; a \"wait\" only pauses this session, not the fleet"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 19128702-3d17-5e99-a85c-b57ee0a5232f
  modified: 2026-10-17T06:19:23.669Z
---

When Bryce rejects a change on sight in this session (2026-10-17, PR #2611: "looks so fucked", then "wait"), act on the PR immediately: add the `MERGE-HOLD:` line, message the orchestrator that the head is rejected, and only then hold. I waited ~2 h; meanwhile a sibling session finished the rejected layout, got CI green and re-blessed the golden, and Bryce merged it himself a minute after my late hold.

**Why:** "wait" pauses my pushes and runs, not the fleet or the Merge Desk; a green, ready PR with no hold line reads as mergeable to everyone else.

**How to apply:** rejection or "wait" on a PR I own → first tool calls: `update_pull_request` with `MERGE-HOLD: <who rejected what, when>` and a one-line `send_message` to the orchestrator; then hold. Related: [[pr-auto-merge]], [[merge-fast-verify-on-ci]].
