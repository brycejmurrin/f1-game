---
name: launch-independent-of-merge-queue
description: "Launching hunters, reviewers and workers is not gated on the land queue draining; only a real code dependency holds a launch"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-25T01:30:00Z
---

Bryce (2026-11-25 ~00:35Z): "So we have a git merge queue for PRs, but we also are considering when to launch sessions
in waves but those could be workers reviewers or hunters which don't rely on the merge queue."

**Why:** the orchestrator had held a wave "until the queue drains". The land queue only governs when finished PRs
merge. Read-only hunters, reviewers and surveys never touch it, and D-033 allows parallel workers on shared paths.

**How to apply:**
- Launch read-only hunters, reviewers and surveys whenever there is something to look at.
- Hold a worker only when it needs another PR's code first (say which PR, and launch it when that PR merges). Heavy
  overlap in the same lines is a reason to brief the worker to coordinate, not to wait.
- Don't describe a launch as "after the queue drains".

Related: [[orchestrator-checkin-and-task-list]], [[parallel-survey-and-review]].
