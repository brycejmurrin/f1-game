# Process dashboard

Generated 2026-10-27T10:05Z. ci.yml runs in the window: 60 (2026-10-26T05:58Z → 2026-10-27T10:04Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 5 | 0.2 min | 0.2 min | 0.2 min | 0 | 0 |
| CI (draft fast tier) | 6 | 0.2 min | 0.2 min | 0.2 min | 0 | 0 |
| CI draft (opted out) | 4 | 0.1 min | 0.1 min | 0.1 min | 0 | 6 |
| CI edit event (ignored) | 12 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| CI label event (ignored) | 25 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Draft push (CI skipped — add run-ci label) | 5 | 0.1 min | 0.1 min | 0.1 min | 0 | 5 |
| Parts option-resolution census | 13 | 0.3 min | 0.3 min | 0.3 min | 0 | 0 |
| Per-circuit geometry sweeps | 11 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Pure-node unit suites (slow) | 1 | 1.8 min | 1.8 min | 1.8 min | 0 | 0 |
| Select specs for this change | 13 | 0.4 min | 0.5 min | 0.5 min | 0 | 0 |
| Selected specs (verdict) | 11 | 0.1 min | 0.2 min | 0.2 min | 0 | 2 |
| Smoke (page boots, __apex responds) (1) | 5 | 0.1 min | 3.6 min | 3.6 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 5 | 3.7 min | 4.0 min | 4.0 min | 0 | 0 |
| Structural guards | 11 | 0.1 min | 0.1 min | 0.1 min | 0 | 2 |
| Structural guards (tooling A) | 12 | 3.2 min | 4.8 min | 4.8 min | 0 | 1 |
| Structural guards (tooling B) | 12 | 4.5 min | 4.7 min | 4.7 min | 0 | 1 |
| Structural guards (tooling C) | 12 | 3.5 min | 4.6 min | 4.6 min | 0 | 1 |
| Structural guards (tooling D) | 12 | 3.8 min | 5.0 min | 5.1 min | 0 | 1 |
| Workflow and shader lints | 13 | 0.5 min | 2.9 min | 3.1 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 5 | 0.2 min | 0.2 min | 0.2 min |
| CI (draft fast tier) | 6 | 0.2 min | 0.2 min | 0.2 min |
| CI draft (opted out) | 4 | 0.1 min | 0.1 min | 0.1 min |
| CI edit event (ignored) | 12 | 0.1 min | 0.1 min | 0.1 min |
| CI label event (ignored) | 25 | 0.1 min | 0.1 min | 0.1 min |
| Draft push (CI skipped — add run-ci label) | 5 | 0.1 min | 0.1 min | 0.1 min |
| Parts option-resolution census | 13 | 0.3 min | 0.3 min | 0.3 min |
| Per-circuit geometry sweeps | 11 | 0.1 min | 0.1 min | 0.1 min |
| Pure-node unit suites | 1 | 1.8 min | 1.8 min | 1.8 min |
| Select specs for this change | 13 | 0.4 min | 0.5 min | 0.5 min |
| Selected specs (change-aware gate) | 2 | 8.1 min | 8.8 min | 8.8 min |
| Selected specs (verdict) | 11 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 5 | 0.1 min | 3.6 min | 3.6 min |
| Staged build boots (minified _site, as Pages ships it) | 5 | 3.7 min | 4.0 min | 4.0 min |
| Structural guards | 13 | 4.6 min | 5.0 min | 5.1 min |
| Workflow and shader lints | 13 | 0.5 min | 2.9 min | 3.1 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 13.3%; re-gated SHAs 14 (39 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=6, p50 6.5 min, p90 9.4 min.
- Full tier: n=5, p50 6.6 min, p90 9.7 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=49, p50 14.8 min, p90 27.2 min; superseded (cancelled) 9.
- DORA: deploy freq 41.8/day, lead time p50 14.8 min, change-fail 3.9%, MTTR p50 41.5 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 1.8 min (n=1) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 0.1 min, p90 3.6 min (n=5) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 8.1 min, p90 8.8 min (n=2) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 6.6 min, p90 9.7 min (n=5) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 14.8 min, p90 27.2 min (n=49) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 39 of 60 runs (65%), 14 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 13.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
