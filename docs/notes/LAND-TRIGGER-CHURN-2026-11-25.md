# Land workflow trigger churn · November 25, 2026

Kind: measurement · Re-measure-by: 2027-01-25

Issue #6379 asked which `land.yml` triggers make runs that do nothing. This note measures one window and ranks the
changes. `land.yml` is a protected path, so each change below is its own PR and needs Bryce's own `config-ok`. This
note edits nothing in it.

## Method

The window is the one #6379 counted: 2026-11-24 from 17:40Z to 21:32Z. That window had 28 merges.

- Runs: `gh api -X GET repos/brycejmurrin/f1-game/actions/workflows/land.yml/runs -f created=2026-11-24T17:40:00Z..2026-11-24T21:32:00Z`,
  4 pages of 100. That gave 316 runs. The issue's 283 + 39 also included runs that were still in flight.
- Jobs: one `GET …/actions/runs/<id>/jobs` for each of the 204 runs that did not conclude `skipped`. A skipped run
  starts no job.
- Durations: job `started_at` to `completed_at` on a sample of 15 runs that reached `land-gate`.
- Trigger action: the runs API carries `event` but not the `pull_request_target` action. For three PRs (#6368,
  `cursor/active-pad-loss-6253` and `cursor/settings-resets-1124`) the run times were matched against
  `GET …/issues/<n>/timeline`.

## Trigger → count → outcome

What each run did is named by the furthest job it reached. `land-gate` is the merge-gate leg (checkout, `gen:check`,
ratchets). `resolve+post` posted a status without a gate run. `resolve-only` found nothing to do.

| event | runs | skipped (no runner) | cancelled | resolve-only | resolve+post | sweep | land-gate (completed) |
|---|---|---|---|---|---|---|---|
| `pull_request_target` | 171 | 97 | 30 | 1 | 0 | 0 | 43 |
| `workflow_run` (CI, Pages) | 80 | 15 | 7 | 9 | 20 | 0 | 29 |
| `workflow_dispatch` (`retry`) | 39 | 0 | 3 | 3 | 0 | 0 | 33 |
| `push` (deploy branch) | 25 | 0 | 0 | 0 | 0 | 25 | 0 |
| `schedule` | 1 | 0 | 0 | 0 | 0 | 1 | 0 |
| **total** | **316** | **112** | **40** | **13** | **20** | **26** | **105** |

Every completed `land-gate` concluded `success` (the job ran; the verdict is in the run). A further 30 `land-gate`
legs were cancelled. 35 runs reached `arm`.

### Job durations (15-run sample)

| job | mean | range |
|---|---|---|
| resolve | 4 s | 3–9 s |
| trusted-rows | 85 s | 45–177 s |
| land-gate | 250 s | 146–664 s |
| post | 9 s | 6–18 s |
| arm | 11 s | 5–15 s |
| retry | 5 s | 4–6 s |

The 105 completed `land-gate` legs are about 7.3 runner-hours, or 3.75 gate runs (about 16 runner-minutes) per merge.
Add `trusted-rows` (115 completed, about 2.7 h). Everything else together is under 30 runner-minutes.

## What the counts mean

1. **The 112 skipped runs cost no runner.** The #6368 timeline shows where they come from. `labeled lane:claude` at
   20:25:00 skipped at 20:25:02. Agent pushes and body refreshes before `land` gave the 20:34:19 and 20:34:37
   runs; an edit or push makes no timeline row, so those two are matched only by elimination. `ready_for_review` at
   20:42:48 skipped at 20:42:54. `labeled land` at 20:43:01 ran at 20:43:08. GitHub's `on:` block cannot filter by
   label name or by which field an `edit` changed, so these can only go by dropping a whole event type. That would
   lose the land-time re-reads. They are noise in run lists, not in compute. The same is true of `Phone shots`: its
   114 skips are every `issue_comment`, and the owner filter is a job `if:`.
2. **The 40 cancels are mostly the designed `land-<n>` replacement.** The typical case is a `ready_for_review` and
   a `labeled land` a few seconds apart (`cursor/settings-resets-1124`: cancelled 18:07:34, the run at 18:07:53 succeeded). 29 of the 30
cancelled gate legs died before `trusted-rows` finished, so they wasted under 2 minutes each.
3. **The `retry` chain is the real cost.** 39 dispatches made 33 `land-gate` runs (31% of all gate runs). 18 PRs
   were re-dispatched. 6 of them (#6247, #6315, #6319, #6336, #6355, #6356) spent the whole `RETRY_MAX: 3`. A PR that
   has spent its budget sits on `gate pending … the deploy tip moved` until a train or its own next CI run re-gates
   it. Today's observation is that state. Each merge moves the tip, and every other gated `land` PR's verdict names
   the old tip (STALE TIP in `land.yml`). So every merge re-gates every waiting PR, and each of those runs a full
   `land-gate`. Only one of them can merge on the next tip. With k PRs waiting, one merge costs k gate runs to admit
   1 PR.
4. **The `workflow_run` re-gates are cheap and needed.** 20 posted a status without a gate run, and 9 did nothing in
   about 4 s. 17 of the 29 that ran a gate went on to `arm`. A CI completion is the event that turns `ci=WAIT`
   green, so keep it.
5. **The schedule nearly never fires.** `cron: "17,47 * * * *"` should give about 8 runs in a 3 h 52 min window; it
   gave 1. GitHub delays or drops scheduled runs under load. The 25 `push` sweeps (one per merge) did the sweeping.

## Proposals, ranked by gate-runs saved on this window

| # | change (all in `land.yml`, protected) | gate runs saved | risk |
|---|---|---|---|
| P1 | **Retry only the head of the queue.** When post or arm hands a PR to `retry` because the tip moved, dispatch only the PR the train would pick next (the priority PR, else the oldest `land` PR, as `train-screen` orders them). Leave the rest on `pending "re-gating"` for the train after the next Pages success. | up to ~25 of the 33 dispatch gate runs. Only one PR can merge per tip, so about one dispatch per merge stays useful. | A low-priority PR waits one train longer. That is already what happens once its budget runs out, so P1 makes that the normal case instead of the outcome after 3 wasted runs. |
| P2 | **Skip `land-gate` when the tip move cannot change the verdict.** Re-gating every PR on a new tip needs the gate's `tip=` rule (merge-gate closure, protected). It could accept a verdict whose base→new-tip diff shares no path with the PR's diff and touches no generator source or ratchet. | most of the remaining re-gates on a day of disjoint PRs | It changes what a `gate` success proves. The merge result is no longer run, so a semantic conflict (two PRs that are each green but red together) slips through to the Pages train. That needs its own design note and Bryce's decision, so it is not proposed for now. |
| P3 | **Drop `schedule`, or move it off `:17/:47`.** It fired 1 time in about 8 slots; push sweeps cover it. | 0 gate runs (sweeps are cheap) | The schedule is the fallback after a docs-only merge when no push sweep fires. That case still has a push, so moving it to an off-peak minute is the safe form. |
| P4 | Leave the `pull_request_target` types and the Phone shots triggers as they are. | 0 runner time | Dropping `edited` or `labeled` loses the land-time body and label re-reads. The skips are free. |

**Recommended next PR: P1.** It needs no change to what `gate` proves. It is measurable the same way, by `land-gate`
runs per merge (3.75 here; P1's target is about 2). The `retry` and `train-screen` jobs already compute the inputs it
needs.

## Case: train #6382 stayed unarmed on a `gate` success (2026-11-24)

The orchestrator closed train PR #6382 (cars #6334, #6335 and #6371) by hand at 00:27Z. It had a `gate` success
from 22:52:32Z and was never armed. The tip moved 33 commits while it was open, and because only one train can be
open at a time, it blocked every later train for about 1 h 35 min.

What happened, read from the `gate` statuses on `2baca95f` and the jobs of each run:

| time (Z) | run | event | result |
|---|---|---|---|
| 21:53:57 | 45494435931 | CI re-gate | pending `ci=WAIT` |
| 22:18:19 | 45498158160 | — | pending: the tip moved since `3e832217`; re-gating |
| 22:29:38 | 45499954967 | `Land retry … attempt=1` | success at tip `0f252d0b`. `arm` succeeded but found the tip moved, so `retry` dispatched attempt 2 |
| 22:41:13 | 45501880560 | `… attempt=2` | pending: the tip moved since `ba953e7b`; re-gating |
| 22:52:32 | 45503326628 | `… attempt=3` | success at tip `36294c33`. **`arm` failed** (job 138837647849): `non-200 OK status code: 503 Service Unavailable body: "no healthy upstream"`, then exit 1 under `set -euo pipefail` |

Why nothing recovered it:

1. **`arm` treats a GitHub 5xx as a hard failure.** Its `defer_if_limited` matches only `HTTP 429` and the 403
   rate-limit form, so a 503 on one `gh api` read failed the job before it reached any skip or arm branch.
2. **`retry` cannot run after a failed `arm`.** `retry` reads `needs.arm.outputs.retry`, and a failed job has no
   outputs. The head was also at `attempt=3`, which is `RETRY_MAX`, so the budget was spent either way.
3. **The sweep refused on the shared budget.** `sweep` re-gates a green, unarmed PR whose `gate` is older than the
   tip, but at most `RETRY_MAX` times per head since CI finished. It counts the `Land retry` dispatches too. So its
   answer was "spent the budget of 3; a push, a label flip or the next train re-gates". For a train PR the next
   train is exactly what cannot open.
4. **`trainDisposition` (tools/ci/merge-train.mjs) has no rule for a stuck green.** It closes a train when a car
   moved (`stale`), when CI or the run went red or was cancelled, or when `gate === "failure"` (`red`). A `gate`
   success that is never armed returns `{ close: false }` for as long as the train is open.

### Proposals for this case (both files are protected, so these are proposals only)

| # | change | where | why |
|---|---|---|---|
| T1 | **Close a train `stale` when it is unarmed past its gate.** The rule: `gate` is success, `auto_merge` is null and the success is older than N minutes (N = 15, about two train cycles), or the success's `tip=` is no longer the deploy tip and the head has spent `RETRY_MAX`. `stale` (not `red`) keeps the cars eligible, unbisected, for the next train. | `trainDisposition` in `tools/ci/merge-train.mjs`. It needs the gate's age and the PR's `auto_merge`, which `--build` already reads for the car rows. | With T1, #6382 closes at about 23:07Z instead of being closed by hand at 00:27Z. This is the deadlock breaker: one stuck train no longer holds every later one. |
| T2 | **Treat a GitHub 5xx in `arm` like the rate limit.** Retry the read once after `GATE_REREAD_S`. If it still fails, exit 0 with `retry` requested rather than exit 1. | `arm` in `land.yml` (`defer_if_limited`) | A platform blip should cost one re-gate, not strand a green head. |
| T3 | **Do not let `retry` dispatches spend the sweep's budget on a train PR.** Alternatively, have the sweep's refusal hand a train PR to T1 instead of naming "the next train". | `sweep` in `land.yml` | The refusal's own cure ("the next train re-gates") is impossible for a train. |

T1 alone would have unblocked #6382. T2 removes this particular trigger. P1 above (retry only the head of the queue)
also shortens the window: #6382 used its whole budget on two tip moves before the 503.
