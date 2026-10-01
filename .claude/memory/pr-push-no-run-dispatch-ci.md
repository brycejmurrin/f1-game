---
name: pr-push-no-run-dispatch-ci
description: A push to a draft PR while its previous ci.yml run is still live sometimes starts no new run; dispatch ci.yml on the branch by hand and watch by sha
metadata:
  node_type: memory
  type: project
  originSessionId: 68324bb7-ccf2-5110-9138-07c5c330db6c
  modified: 2026-10-01T22:10:20.145Z
---

Seen three times on 2026-10-01 (#712 bf4dcecb, #713 2f0ec7ea, #733 f20e4d55): a
head pushed while the PR's previous ci.yml run was still in progress got NO
`pull_request` run at all (ci-watch: "no workflow run yet" for 10+ min; the
check-runs list showed only browser-group jobs). Once the earlier run was
cancelled by the push, a new run did appear — the no-run case is the one where
the earlier run kept going.

**Why:** unknown (GitHub side); the repo's ci.yml has concurrency per ref, and the
missing run is not in the Actions list, so nothing to re-run.

**How to apply:** after a push, if `ci-watch --sha <head> --once` still says
"no workflow run yet" after ~3 min, dispatch `ci.yml` with
`mcp__github__actions_run_trigger run_workflow ref=<branch>` (inputs `{}`), then
arm `ci-watch --sha <head>`; the dispatched run attaches to the PR's head and
counts for the required checks. Never an empty commit to kick CI.
