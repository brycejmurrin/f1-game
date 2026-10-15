---
name: rerun-stale-run-cancels-head
description: Never re-run a PR CI run whose head_sha is no longer the PR head — it joins the per-branch concurrency group and cancels the live run on the new head
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5197b762-dda2-50fe-8efe-50d040ddf9e0
  modified: 2026-10-15T01:57:57.595Z
---

Before `rerun_failed_jobs` / `rerun_workflow_run` on a PR's ci.yml run, confirm the run's head_sha is still the PR's current head. ci.yml's concurrency group is `ci-<pull_request.head.ref>` with cancel-in-progress for pull_request, so a re-run of a superseded run cancels the newer head's run.

**Why:** 2026-10-15 on #1800: a base update superseded run 38656987018 (looked like "cancelled, 0 failed" = timeout); re-running it cancelled the fresh run on 8fca23f. A `cancelled` PR run with zero failures is often just superseded by a newer push — check the PR head first (rule 8's dedupe applies to any push, not only draft→ready).

**How to apply:** on a cancelled PR run, fetch the PR head sha; if it differs, watch the new head's run instead of re-running. Related: [[pr-push-no-run-dispatch-ci]].
