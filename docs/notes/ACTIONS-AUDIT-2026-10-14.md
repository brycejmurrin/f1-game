# GitHub Actions audit — 2026-10-14

Five parallel read-only audits of `.github/workflows/` and the last 3–13 days
of run history (400 ci.yml runs, 200 pages.yml, 200 docs-guards, 100 each of
browser-group, gpu-census, spec-timings, desktop, 65 garage-before). Raw data
and scripts lived in the session scratchpad; every claim below carries a run
id or a file:line so it can be re-checked with
`gh api repos/brycejmurrin/f1-game/actions/runs/<id>/jobs`.

This note is the PLAN for the fix PR. The PR body's checklist mirrors the
numbered items; tick there, not here. All five lanes have reported.

## The one reframing fact

The repo is PUBLIC. `actions/runs/{id}/timing` reports 0 billable ms on every
sampled run (e.g. 38530819387), so Actions minutes cost nothing. Every "cost"
below is a SLOT: 40 concurrent standard jobs, 5 macOS. Volume is ~9,900 Linux
and ~250 macOS job-minutes/day. The 3-day timeline peaked at ~88 jobs in flight
(2026-10-14 07:35 UTC, 28 runs, 25 of them ci.yml); every step over 40 jobs fell
in the 03–08 UTC burst that day. Job queue wait follows it: median 2 s under 20
jobs in flight, 25 s at 20–35, 86 s at 35–60, 264 s over 60 (2,881 Linux jobs,
r = 0.45). Run-level `run_started_at − created_at` is 0 for 95 % of runs and
cannot see any of this.

## Findings, ranked by slot-minutes or latency

| # | finding | evidence | effect of the fix |
|---|---|---|---|
| 1 | **garage-before.yml never produces a result.** The per-sha concurrency group sits on the 4-shard macOS capture MATRIX (lines 76–78), so one shard runs, one waits and GitHub cancels the other two at once ("Canceling since a higher priority waiting request … exists", run 38527082805). capture = cancelled → pack skipped → no pack → next publish recaptures. 65 runs: 0 success, 30 cancelled, 10 failure (plan hitting HTTP 500 on the artifacts listing), 25 skipped. | 703 macOS wall-minutes over 30 runs against a 5-slot macOS cap shared with renderer-macos and gpu-census | move the group to the job that must be single-flight (pack), `max-parallel` on capture; or Linux capture |
| 2 | **ci.yml's critical path is queue hops, not tests.** Ship run 38526929355: 36 min wall, ~19 min of it jobs waiting in the queue across six serial hops (reuse-draft → unit-plan → node-suites → guards aggregator → poke-train → CI). poke-train waited 6.7 min to run 6 s. | every deploy-branch push and every PR pays the hops | collapse the filter/aggregator hops (ci.yml lane reports the exact edits) |
| 3 | **Cancelled PR runs burn ~1,900 job-minutes/day.** 109 of 400 ci runs cancelled (27 %); the 41 deploy-branch push cancels die pending with 0 jobs (38531074077 — the no-cancel `ship-fast` group works), so the 67 PR cancels average ~96 job-minutes each. Sources: synchronize over a live run, sync-pr re-merges (41 base-into-topic merges vs 35 PR merges in 7 days), draft→ready dedupe. | ~1,900 job-min/day, ~20 % of all volume | `bash-guard.sh` warns on a push while the branch's ci run is in flight; fewer re-syncs (SYNC ONLY WHEN YOU MUST is already the rule) |
| 4 | **browser-group runs 14 min, not the documented ~5.** Setup is 27 s (checkout 7, npm ci 4, Chromium 4 with 100 % cache hits over 314 shards, Mesa 11). Shards are split by COUNT, so shard 1 gets the mega-sweep spec plus `image-grade-visual` (359 s): gfx shards run 15.3 / 2.7 / 1.8 / 2.7 min (run 38478672714); ui 15.5 / 11.0 / 5.0 / 7.5; render 19.7 / 13.8 / 10.9 / 6.0. The plan job adds a second queue wait (p90 15.8 min, max 26). | median 14 → ~7 min; 26 fewer jobs/day | plan shards by time (LPT over `tests/data/spec-timings.json`, as `select-specs.mjs shards()` already does) computed client-side and passed as a dispatch input; no plan job |
| 5 | **docs-guards.yml duplicates ci.yml and is a required check.** 128 runs/day; 57 of the last 60 took the 13 s "mixed PR" path that tests nothing. tooling-fast already holds 20 of its 21 files; the 21st (`environment-json.test.mjs`) runs in node-suites `test:mcp`. | 128 runs/day, one fewer required context that queues alone (median 3.6 min on prose PRs) | add `environment-json` to `toolingFast`; **Bryce removes the required context**; then delete the workflow and the `ci-coverage.test.mjs` pin |
| 6 | **The queue-depth hold is fiction.** Nothing produces `apex-status/queue-depth.json` (DOCS-SURVEY-2026-10-06.md:23 already says so); the only threshold, ">15 runs queued" (AGENTS.md:58, pr-owner SKILL.md:38, apex-ci-and-pages-watch SKILL.md:29), counts runs, never jobs, and was never resized from 20 to 40 slots. | the 03–08 UTC bursts (median wait 86–264 s) trigger no hold | a new queue-depth tool under tools/ci: queued + in-progress JOBS vs 40/5, writes the json, docs say jobs |
| 7 | **Merge queue is dead code.** It needs an organisation-owned repo (CI-CAPACITY-2026-09-29.md:113, CI-MERGE-BURST-2026-10-03.md:41); `merge_group` (ci.yml:202–214) and the five `merge_group` branches (ci.yml:856, 868, 1976, 2029, 2302) never fire. | clarity only | delete, note why in the history note |
| 8 | **Agent tooling API load.** ci-watch polls every 30 s, 3–4 requests/tick = 360–480/h per armed watch; 29 branches had runs in the last hour, so ~15 watches ≈ 5,400–7,200/h against the 5,000/h token limit. No tool sends `If-None-Match` (a 304 is free). deploy.mjs:816, :858, :869 curl UNAUTHENTICATED (60/h per egress IP, shared through the proxy). remote-group never checks for a live duplicate: 14 of 100 runs repeated branch+group within 60 min and the concurrency group cancelled the earlier one. | fewer 403s, fewer cancelled dispatches | ci-watch default 60 s + ETag; deploy.mjs through `api()`; remote-group dedupe |
| 9 | **browser-group's 16 reds were never infrastructure.** 6 = one deterministic physics-core assertion (`longitudinal` "grass bleeds speed" 80.015 vs < 80; `offtrack` prog ≈ s 14 vs < 2) also red on the deploy branch (38054311019); 5 = hooks `APEX_FAIL_ON_FLAKY` with 0 hard failures — `atmosphere() night…`, `frame() road dominates…`, `visible() player car…` fail in < 1 s then pass on a fresh worker (order-dependent state); 1 logging flake; 1 ui menu-survey; 1 terrain-over-road 45 s poll; 2 garage-out-before-card 180 s poll (owned by another session, PR #1496). | 6 of 9 hooks dispatches stop going red | fix the order dependence; the physics red has its own owner |
| 10 | **Dead and never-run workflows.** `assemble-pit-lane.yml` is a 12-line echo, 2 runs, both 2026-09-15. `hud-survey.yml` has 0 runs ever, so its shard→merge path is unproven and its merge job's `if: always()` (L122) runs after a failed plan. car-shot's ubuntu "control" hit its 20-min cap twice (37094281675, 37087026592) — it runs without Mesa. | hygiene | delete; `!cancelled() && needs.shard.result != 'skipped'`; Mesa or drop the ubuntu option |
| 11 | **Settings drift.** `allow_squash_merge` and `allow_rebase_merge` are both true although policy is merge commits only (the hook is the only enforcement). `delete_branch_on_merge` is true; the memory file `stacked-prs-land-bottom-up.md` says false and still says SQUASH. `actions/cache` is v5.1.0 in `playwright-chromium/action.yml:39` vs v6.1.0 in ci.yml:2005/2394 because dependabot's `directory: /` does not scan `.github/actions/*`. | | **Bryce flips the two merge settings**; dependabot `directories`; fix the memory file |
| 12 | **History lives in comments.** ci.yml 2,612 lines, 54 % comments, 113 dated lines; pages.yml 48 %; gpu-census 946 lines with two inline `node -e` blocks (~814 lines) that no unit test can reach. 138 workflow commits in 30 days (ci.yml 71, gpu-census 44). | review cost on every edit | a new CI-WORKFLOW-HISTORY note keyed by job id; gpu-census blocks → `tools/ci/gpu-census-*.mjs` |

Healthy, leave alone: desktop.yml (the 2026-10-06 `paths:` filter fixed it; its one failure 38051540608 is a real assertion), all action pins (SHA, first-party, no deprecated majors), `permissions:` (contents: read everywhere it can be), every job has `timeout-minutes`, the three composite actions are used everywhere they fit, Chromium cache hit rate 100 %, Mesa apt install 11 s median (not worth caching), the 12 required checks all still exist and all report.

## Plan

Lane A — this PR, no setting change needed:
1. browser-group: time-balanced shard plan as a `plan` dispatch input computed by `remote-group.mjs` (LPT over spec-timings, mega-sweep solo rule kept); matrix from `fromJSON(inputs.plan)`; the plan job goes; an empty input falls back to `--shard i/N`.
2. remote-group: refuse to dispatch when the same branch + group + head sha is already queued, running or green (print the run URL instead).
3. New queue-depth tool under tools/ci (jobs vs 40 / 5, hold verdict, writes `apex-status/queue-depth.json`); AGENTS.md and the two skills say jobs.
4. ci-watch: default interval 60 s, `If-None-Match` on the runs and jobs GETs; deploy.mjs's three bare curls through `api()`.
5. docs-guards: `environment-json` into `toolingFast` (the workflow itself waits on the setting change, item B1).
6. Delete `assemble-pit-lane.yml`; hud-survey merge `if:`; car-shot ubuntu gets `mesa-xvfb`; dependabot `directories: ["/", "/.github/actions/*"]`; cache pin → v6.1.0.
7. Memory file `stacked-prs-land-bottom-up.md`: delete_branch_on_merge is TRUE, MERGE not SQUASH.
8. AGENTS.md:42 "~5 min" → the measured figure until item 1 lands.
9. ci.yml: C6 `filter: blob:none` on the five checkouts and a Mesa apt cache; C4 select-specs splits an oversize leg; C2 guards aggregator needs-only, poke-train out of ci-verdict, reuse-draft + unit-plan + filters folded into one plan job, `merge_group` out, `vars.DEPLOY_BRANCH`; C1 node-suites rebalanced (protection names first); C5 smoke cap 20, the three flaky specs; C8 history out of the file. Each with its `ci-coverage.test.mjs` edit.
10. From the Pages lane (pending): garage-before concurrency (coordinate — session 78934c9e owns the plan-5xx side in `tools/shot/garage-before.mjs`); cron cadence; train anatomy fixes.
11. From the gpu-census lane (pending).
12. hooks order-dependent agent-view tests (fix or quarantine by name).

Lane B — Bryce, repository settings or policy (no PR can do these):
0. C7: may a ship push reuse the PR's green selected-verdict when the merge tree it tested equals the pushed tree? (~680 job-min/day; it is the merge-interaction safety net.)
1. Remove `Docs guards (prose-tree unit files)` from the deploy branch's required checks, THEN the workflow deletion in Lane A lands.
2. Settings → Pull requests: untick "Allow squash merging" and "Allow rebase merging".

Not doing: weakening any test, widening the 900 s browser timeout, dual-dispatching Pages, re-enabling push CI on topic branches, the physics-core red (owned elsewhere).
