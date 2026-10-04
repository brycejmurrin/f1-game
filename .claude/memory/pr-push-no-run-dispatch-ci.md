---
name: pr-push-no-run-dispatch-ci
description: A PR push may start no ci.yml run (dirty = no merge ref) and a pull_request run may build against a STALE base — check mergeable_state, then the checkout step's "Merge X into Y" line
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

**Why (found 2026-10-04):** the PR was `mergeable_state: dirty`. A `pull_request`
(and `ready_for_review`) run checks out `refs/pull/N/merge`; when the PR conflicts
with its base GitHub cannot build that ref and starts NO run at all — nothing is
queued, nothing to re-run. Ten of the campaign's drafts (#887, #890, #893, #898,
#906, #908, #910 …) showed exactly this; `gh api repos/.../pulls/N --jq .mergeable_state`
is the one-line check. A hand `workflow_dispatch` on the branch still runs (it
checks out the branch head, not the merge ref) and attaches to the PR's head.

**How to apply:** after a push, if `ci-watch --sha <head> --once` still says
"no workflow run yet" after ~3 min, FIRST read `mergeable_state`: `dirty` means
sync the branch (`sync-pr.mjs --push`), which starts the real run; only when it
is `clean`/`blocked` dispatch `ci.yml` with
`mcp__github__actions_run_trigger run_workflow ref=<branch>` (inputs `{}`), then
arm `ci-watch --sha <head>`; the dispatched run attaches to the PR's head and
counts for the required checks. Never an empty commit to kick CI.

**The merge ref can be STALE (found 2026-10-04, #887):** a `pull_request` run
checks out `refs/pull/N/merge` as GitHub last computed it — on #887 the job's
checkout step read `HEAD is now at 0568b81 Merge 75c75567f into 077d1483d`,
a base from an hour earlier that lacked the spec fix already on the tip, so the
run failed with the OLD spec's number (−1.395) while the tip and the PR's tree
both passed (VM replay byte-identical). Before blaming a PR for a red the tip
passes, read that `Merge X into Y` line: Y is the base the run really used. A
sync push (or any push) makes GitHub rebuild the ref; a re-run of the same run
does not.
