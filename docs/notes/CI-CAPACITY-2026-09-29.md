# CI capacity — the 20-slot jam of 2026-09-29

Measured from the GitHub API over 1,000 workflow runs, 2026-09-27 22:35 →
2026-09-29 15:47 UTC (every job's `created_at` / first step start / `completed_at`),
plus the job logs of the Imola scenery run `df0ad70` and the `bot/spec-timings`
side branch at `8d55063`. The fixes are in the same change as this note.

## What clogged

- **The account runs at most 20 jobs at once.** From 08:15 to 15:15 UTC on
  09-29 all 20 were busy and **200–290 jobs waited**. Median queue wait was
  12–26 min per hour, worst 97 min. Before 07:00 queue waits were ~0.
- **Unqueued, a PR run finishes in ~6 min** (56 runs on 09-28: median 5.8, p90
  6.3). Its critical path is one unit file, `tests/unit/elevation-tracks-vm.test.mjs`
  (the `vm-a` slice, 5.6 min; last to finish in 42 of 56 runs). So CI was not
  slow. It was **wide**: ~20.5 jobs and ~44 job-minutes per PR push, against
  28 branches pushing in one hour (35 PR runs at 08:00).
- **Cancellation was not the waste it looked like.** 1,105 of 1,261 cancelled
  jobs never reached a runner; only ~530 runner-minutes were lost. The cost
  was latency: branches pushing every 10–30 min cancelled their own runs
  before they got a slot (`redbull-scenery-wave6`: six cancelled in a row,
  ~3 h without a verdict).
- Real runner time: ~13,800 job-minutes in 41 h. Of a green PR run's time,
  node unit suites 33 %, selected specs 14 %, geometry sweeps 13 %,
  guards 9 %, per-job setup ~17 %.

## Why the selector made it worse

- `select-budget.mjs` billed every spec with < 3 CI samples at **79.7 s/test**,
  a SwiftShader number from 2026-08-07. The browser jobs moved to llvmpipe on
  2026-09-16. Measured there (30 specs, 3+ samples): per-test p50 5.5 s,
  p75 7.5 s, p90 12.5 s.
- The committed `tests/data/spec-timings.json` held 12 specs. `spec-timings.yml`
  had accumulated 68 (30 measured) on `bot/spec-timings`, which is merged
  only by hand, so the gate never saw them.
- Shards were sized so a job survives **every** test hitting the 180 s
  timeout, but the job runs `--max-failures=3`. `tracks-walls.spec.js`
  (63 tests, ~3.5 min measured) became three jobs of 1.1–1.5 min, and it was
  selected on 194 of 279 PR runs.
- Specs declaring a `setTimeout` ≥ 180 s were excluded however cheap they
  measured: `imola-foundation` declares 420 s and runs in ~30 s. On the Imola
  scenery PR the gate excluded `imola-foundation` and ran `pit-signs`,
  `abudhabi-foundation` and `output-paths` instead.

## Other costs found

- Pages: 57 train dispatches in 41 h (14 in one hour), 22 cancelled waiting;
  25 re-ran the reusable CI (~3,800 job-min, 16 % of all compute).
- `spec-timings.yml` fired on every CI completion: 354 runs, 208 skipped at job
  level, 79 cancelled in its one-at-a-time queue.
- GPU census nightly: the ubuntu and windows lanes hit the 30-min cap every
  night (`cancelled`, ~60 runner-min/night, no verdict).
- Four smoke shards did 0.3–0.9 min of test work each; the "Golden menus"
  trial ran on every PR (237 runs) after answering its question on the first.
- Deploy-branch reds: 14 of 15 were Structural guards on generated counts
  (the `N of M unit files` ladder figures, `docs/ARCHITECTURE.md`'s table) after
  two PRs regenerated them against different bases and both merged. That is a
  merge-ordering problem (merge queue / require-up-to-date), not a code one.

## What changed (2026-09-29)

| change | where |
|---|---|
| Fallback 79.7 → 7.5 s/test (llvmpipe p75) | `tools/ci/select-budget.mjs` `MEASURED` |
| Committed timings refreshed (union with `bot/spec-timings`); the select job overlays the side branch on every run | `tests/data/spec-timings.json`, `unionDb`, `APEX_SPEC_TIMINGS`, `tools/ci/ci-select-specs-step.sh` |
| Job cap = 2 × expected + 3 × per-test timeout + setup; split only past 8 min expected; pack everything else first-fit | `shardCapMin`, `TARGET_SHARD_SEC`, `shards()` |
| A declared-slow spec that CI measured at ≤ ⅓ of the gate joins the budget | `measuredCheap` |
| Budgeted selection 15 → 10 min | `DEFAULT_BUDGET_MIN` |
| Circuit lane: the touched circuit's foundation spec is affected; other circuits' are not candidates; per-circuit baselines are not "infra"; `APEX_CIRCUITS` narrows the per-circuit loops | `circuitsTouched`, `dataCircuits`, `CIRCUIT_FILTERED_TESTS` |
| node-suites 5 → 3 slices, balanced by measured time | `ci.yml` `node-suites` |
| Smoke 4 → 1 shard on PRs and the Pages call (4 stay for the nightly / dispatched wide run) | `ci.yml` `smoke` |
| Golden trial off PRs (nightly + dispatch) | `ci.yml` `baseline-trial` |
| Only the tip pokes the train | `ci.yml` `poke-train` |
| `spec-timings.yml` filtered to the deploy branch at the trigger | `spec-timings.yml` |
| GPU census nightly on macOS only | `gpu-census.yml` |

Expected shape per PR push: ~8–12 jobs (ready) and ~6–9 (draft), down from
~20–23 and ~15. A circuit-only diff plans one selected job with
`APEX_CIRCUITS` set.

## Not done here

- **Geometry sweeps are not circuit-filtered.** The 19 `test:sweeps` files
  each enumerate circuits their own way; a shared `APEX_CIRCUITS` helper is
  the next step for circuit waves.
- **`vm-a` is not narrowed on PRs.** `elevation-tracks-vm.test.mjs` honours
  `APEX_CIRCUITS`, but the node-suites job runs without the plan (it has no
  `needs:`, and it is tree-only, which is the fast-tier reuse contract).
- **49 unit files run twice per PR** (in tooling-fast under guards, and in
  the `vm-b` slice's topical groups). The rebalanced slices keep that off the
  wall clock. Removing it means changing what the topical groups mean.
- **Merge ordering and the wave size** are repository settings and agent
  practice, not code: see the PR for the recommendation.

## Re-measuring

Per-day run totals: `GET /repos/brycejmurrin/f1-game/actions/runs?per_page=1&created=YYYY-MM-DD`
(`total_count`). The runs API caps one query at 1,000 results, so pull a busy
day in 3-hour `created=A..B` windows, then each run's `/jobs?filter=all`.
Queue wait is first step start − job `created_at`; a job with no runner and
no steps never ran.
