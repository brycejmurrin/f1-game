---
name: survey-then-fix
description: "After an audit or survey, the user wants the ranked gap list landed in the same session, not only reported"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 38d1f7a1-44f9-59ef-8d91-6805030a6180
  modified: 2026-10-05T05:09:10.352Z
---

When a survey or audit produces a ranked gap list, the user's next message is
"fix all of those" (2026-10-05, agent-surface survey → PR #922 landed items 1–7
the same day). Plan the survey so its items are one-PR-sized and leave room in
the session to land them.

**Why:** the user treats the survey as the first half of the job; a report that
stops at recommendations costs a second round-trip.

**How to apply:** write the gap list as concrete, independently landable items;
after delivering the survey, be ready to apply them on the same branch, verify
with the gate, and refresh the PR body. Name what cannot be done in the cloud
session (interactive slash commands) explicitly rather than skipping it silently.
Related: [[merge-fast-verify-on-ci]], [[pr-auto-merge]].
