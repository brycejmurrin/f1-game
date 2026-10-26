# Process dashboard

Generated 2026-10-26T10:36Z. ci.yml runs in the window: 60 (2026-10-24T06:47Z → 2026-10-26T10:33Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 26 | 0.2 min | 0.2 min | 0.3 min | 2 | 0 |
| CI (draft fast tier) | 21 | 0.2 min | 0.3 min | 0.4 min | 6 | 0 |
| Draft push (CI skipped — add run-ci label) | 6 | 0.1 min | 0.1 min | 0.1 min | 0 | 3 |
| Driving model (characterization traces) | 24 | 2.5 min | 3.5 min | 3.9 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 7 | 2.5 min | 3.3 min | 3.3 min | 0 | 1 |
| Golden menus on a runner (trial, non-blocking) | 1 | 2.4 min | 2.4 min | 2.4 min | 0 | 0 |
| Parts option-resolution census | 50 | 0.3 min | 2.5 min | 2.7 min | 0 | 1 |
| Per-circuit geometry sweeps | 42 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 9 | 4.3 min | 5.6 min | 5.6 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 9 | 5.8 min | 6.3 min | 6.3 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 9 | 6.0 min | 6.5 min | 6.5 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 9 | 5.7 min | 6.0 min | 6.0 min | 0 | 0 |
| Pure-node unit suites (page-a) | 13 | 2.3 min | 2.7 min | 2.8 min | 0 | 0 |
| Pure-node unit suites (page-b) | 13 | 7.2 min | 7.5 min | 7.6 min | 0 | 0 |
| Pure-node unit suites (slow) | 13 | 9.1 min | 9.3 min | 9.4 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 14 | 3.6 min | 4.4 min | 4.6 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 13 | 3.6 min | 3.8 min | 3.8 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 13 | 10.8 min | 11.4 min | 11.6 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 13 | 9.7 min | 10.0 min | 10.8 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 9 | 16.0 min | 17.9 min | 17.9 min | 0 | 2 |
| Select specs for this change | 50 | 0.4 min | 0.5 min | 0.7 min | 0 | 1 |
| Selected specs (verdict) | 47 | 0.1 min | 0.2 min | 0.3 min | 3 | 3 |
| Smoke (page boots, __apex responds) (1) | 27 | 3.4 min | 4.1 min | 4.7 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 1 | 2.2 min | 2.2 min | 2.2 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 1 | 2.4 min | 2.4 min | 2.4 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 1 | 2.7 min | 2.7 min | 2.7 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 27 | 3.6 min | 4.3 min | 4.7 min | 0 | 0 |
| Structural guards | 48 | 0.1 min | 0.1 min | 0.1 min | 5 | 3 |
| Structural guards (tooling A) | 48 | 4.6 min | 5.8 min | 6.0 min | 2 | 3 |
| Structural guards (tooling B) | 49 | 5.4 min | 6.0 min | 6.3 min | 3 | 2 |
| Structural guards (tooling C) | 49 | 4.7 min | 5.8 min | 6.4 min | 0 | 2 |
| Structural guards (tooling D) | 49 | 4.3 min | 5.9 min | 6.1 min | 5 | 2 |
| Workflow and shader lints | 50 | 0.5 min | 1.8 min | 3.3 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 26 | 0.2 min | 0.2 min | 0.3 min |
| CI (draft fast tier) | 21 | 0.2 min | 0.3 min | 0.4 min |
| Draft push (CI skipped — add run-ci label) | 6 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 24 | 2.5 min | 3.5 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 7 | 2.5 min | 3.3 min | 3.3 min |
| Golden menus on a runner (trial, non-blocking) | 1 | 2.4 min | 2.4 min | 2.4 min |
| Parts option-resolution census | 50 | 0.3 min | 2.5 min | 2.7 min |
| Per-circuit geometry sweeps | 9 | 6.2 min | 6.5 min | 6.5 min |
| Pure-node unit suites | 14 | 10.8 min | 11.4 min | 11.6 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 9 | 16.0 min | 17.9 min | 17.9 min |
| Select specs for this change | 50 | 0.4 min | 0.5 min | 0.7 min |
| Selected specs (change-aware gate) | 12 | 8.8 min | 9.8 min | 10.8 min |
| Selected specs (verdict) | 47 | 0.1 min | 0.2 min | 0.3 min |
| Smoke (page boots, __apex responds) | 27 | 3.4 min | 4.1 min | 4.7 min |
| Staged build boots (minified _site, as Pages ships it) | 27 | 3.6 min | 4.3 min | 4.7 min |
| Structural guards | 49 | 5.8 min | 6.1 min | 6.4 min |
| Workflow and shader lints | 50 | 0.5 min | 1.8 min | 3.3 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 11.7%; re-gated SHAs 14 (17 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=21, p50 6.3 min, p90 8.9 min.
- Full tier: n=26, p50 9.6 min, p90 21.0 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=52, p50 12.9 min, p90 24.3 min; superseded (cancelled) 7.
- DORA: deploy freq 24.1/day, lead time p50 12.9 min, change-fail 1.9%, MTTR p50 41.5 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 10.8 min (n=14) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.4 min, p90 4.1 min (n=27) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 8.8 min, p90 9.8 min (n=12) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 9.6 min, p90 21.0 min (n=26) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 12.9 min, p90 24.3 min (n=52) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 17 of 60 runs (28.3%), 14 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 11.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
