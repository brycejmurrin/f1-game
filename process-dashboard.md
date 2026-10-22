# Process dashboard

Generated 2026-10-22T09:42Z. ci.yml runs in the window: 60 (2026-10-21T19:04Z → 2026-10-22T09:41Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 7 | 0.2 min | 0.3 min | 0.3 min | 2 | 0 |
| CI (draft fast tier) | 14 | 0.2 min | 0.3 min | 0.3 min | 0 | 0 |
| Draft push (CI skipped — add run-ci label) | 21 | 0.1 min | 0.1 min | 0.1 min | 0 | 11 |
| Driving model (characterization traces) | 2 | 2.4 min | 3.9 min | 3.9 min | 0 | 5 |
| Parts option-resolution census | 28 | 0.2 min | 2.5 min | 2.7 min | 0 | 0 |
| Per-circuit geometry sweeps | 21 | 0.1 min | 0.1 min | 0.1 min | 0 | 5 |
| Per-circuit geometry sweeps (1of4) | 3 | 0.3 min | 4.3 min | 4.3 min | 0 | 2 |
| Per-circuit geometry sweeps (2of4) | 3 | 0.3 min | 4.0 min | 4.0 min | 0 | 2 |
| Per-circuit geometry sweeps (3of4) | 2 | 0.6 min | 6.4 min | 6.4 min | 0 | 3 |
| Per-circuit geometry sweeps (4of4) | 4 | 0.3 min | 5.7 min | 5.7 min | 0 | 1 |
| Pure-node unit suites (page-a) | 1 | 1.4 min | 1.4 min | 1.4 min | 0 | 3 |
| Pure-node unit suites (page-b) | 1 | 7.3 min | 7.3 min | 7.3 min | 0 | 3 |
| Pure-node unit suites (slow) | 1 | 9.3 min | 9.3 min | 9.3 min | 0 | 3 |
| Pure-node unit suites (vm-a1) | 2 | 1.1 min | 3.6 min | 3.6 min | 0 | 3 |
| Pure-node unit suites (vm-a2) | 2 | 0.3 min | 2.1 min | 2.1 min | 0 | 3 |
| Pure-node unit suites (vm-b1) | 2 | 0.3 min | 10.9 min | 10.9 min | 0 | 3 |
| Pure-node unit suites (vm-b2) | 2 | 0.3 min | 5.2 min | 5.2 min | 0 | 3 |
| Select specs for this change | 26 | 0.5 min | 0.7 min | 0.8 min | 0 | 2 |
| Selected specs (verdict) | 21 | 0.1 min | 0.1 min | 0.1 min | 1 | 7 |
| Smoke (page boots, __apex responds) (1) | 7 | 3.3 min | 3.9 min | 3.9 min | 0 | 3 |
| Staged build boots (minified _site, as Pages ships it) | 9 | 3.6 min | 4.1 min | 4.1 min | 0 | 1 |
| Structural guards | 21 | 0.1 min | 0.1 min | 0.1 min | 1 | 7 |
| Structural guards (tooling A) | 21 | 5.8 min | 6.8 min | 7.2 min | 0 | 7 |
| Structural guards (tooling B) | 22 | 6.3 min | 8.7 min | 9.6 min | 2 | 6 |
| Structural guards (tooling C) | 21 | 6.0 min | 7.0 min | 7.1 min | 0 | 7 |
| Workflow and shader lints | 26 | 0.6 min | 1.6 min | 2.2 min | 0 | 2 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 7 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 14 | 0.2 min | 0.3 min | 0.3 min |
| Draft push (CI skipped — add run-ci label) | 21 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 2 | 2.4 min | 3.9 min | 3.9 min |
| Parts option-resolution census | 28 | 0.2 min | 2.5 min | 2.7 min |
| Per-circuit geometry sweeps | 4 | 0.4 min | 6.4 min | 6.4 min |
| Pure-node unit suites | 2 | 1.1 min | 10.9 min | 10.9 min |
| Select specs for this change | 26 | 0.5 min | 0.7 min | 0.8 min |
| Selected specs (change-aware gate) | 1 | 9.7 min | 9.7 min | 9.7 min |
| Selected specs (verdict) | 21 | 0.1 min | 0.1 min | 0.1 min |
| Smoke (page boots, __apex responds) | 7 | 3.3 min | 3.9 min | 3.9 min |
| Staged build boots (minified _site, as Pages ships it) | 9 | 3.6 min | 4.1 min | 4.1 min |
| Structural guards | 22 | 7.2 min | 8.7 min | 9.6 min |
| Workflow and shader lints | 26 | 0.6 min | 1.6 min | 2.2 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 30%; re-gated SHAs 11 (13 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=14, p50 11.3 min, p90 13.7 min.
- Full tier: n=7, p50 10.8 min, p90 19.9 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=28, p50 16.8 min, p90 39.3 min; superseded (cancelled) 29.
- DORA: deploy freq 46/day, lead time p50 16.8 min, change-fail 9.7%, MTTR p50 9.7 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 1.1 min (n=2) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.3 min, p90 3.9 min (n=7) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 9.7 min, p90 9.7 min (n=1) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 10.8 min, p90 19.9 min (n=7) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 16.8 min, p90 39.3 min (n=28) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 13 of 60 runs (21.7%), 11 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 30% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
