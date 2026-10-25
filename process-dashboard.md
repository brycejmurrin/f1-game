# Process dashboard

Generated 2026-10-25T09:29Z. ci.yml runs in the window: 60 (2026-10-23T20:30Z → 2026-10-25T09:23Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 26 | 0.2 min | 0.2 min | 0.3 min | 9 | 0 |
| CI (draft fast tier) | 19 | 0.2 min | 0.3 min | 0.3 min | 8 | 0 |
| Draft push (CI skipped — add run-ci label) | 10 | 0.1 min | 0.1 min | 0.1 min | 0 | 2 |
| Driving model (characterization traces) | 37 | 2.3 min | 3.5 min | 4.3 min | 0 | 2 |
| Emulated VR (IWER / xr-emulated) | 13 | 2.5 min | 2.8 min | 2.9 min | 0 | 0 |
| Golden menus on a runner (trial, non-blocking) | 2 | 1.4 min | 2.2 min | 2.2 min | 0 | 0 |
| Parts option-resolution census | 46 | 0.2 min | 2.0 min | 2.6 min | 0 | 2 |
| Per-circuit geometry sweeps | 44 | 0.1 min | 0.1 min | 0.1 min | 0 | 2 |
| Per-circuit geometry sweeps (1of4) | 14 | 5.1 min | 5.4 min | 5.5 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 14 | 4.8 min | 6.3 min | 6.4 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 14 | 6.1 min | 6.4 min | 6.5 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 14 | 4.4 min | 5.8 min | 8.4 min | 0 | 0 |
| Pure-node unit suites (page-a) | 23 | 2.5 min | 2.7 min | 2.7 min | 0 | 0 |
| Pure-node unit suites (page-b) | 23 | 7.3 min | 7.5 min | 7.7 min | 0 | 0 |
| Pure-node unit suites (slow) | 23 | 9.1 min | 9.4 min | 9.7 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 22 | 3.9 min | 4.4 min | 4.4 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 22 | 3.6 min | 3.8 min | 3.8 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 23 | 10.6 min | 11.0 min | 11.2 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 23 | 9.6 min | 9.8 min | 10.2 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 5 | 13.8 min | 14.4 min | 14.4 min | 0 | 0 |
| Select specs for this change | 48 | 0.4 min | 0.5 min | 0.6 min | 0 | 0 |
| Selected specs (verdict) | 43 | 0.1 min | 0.2 min | 0.2 min | 3 | 3 |
| Smoke (page boots, __apex responds) (1) | 26 | 3.3 min | 4.0 min | 7.5 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 2 | 7.3 min | 9.7 min | 9.7 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 2 | 4.5 min | 7.5 min | 7.5 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 2 | 2.2 min | 5.2 min | 5.2 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 26 | 3.5 min | 4.1 min | 4.2 min | 0 | 0 |
| Structural guards | 45 | 0.1 min | 0.1 min | 0.1 min | 14 | 3 |
| Structural guards (tooling A) | 46 | 4.9 min | 7.2 min | 8.2 min | 6 | 2 |
| Structural guards (tooling B) | 46 | 5.6 min | 6.6 min | 7.3 min | 8 | 2 |
| Structural guards (tooling C) | 46 | 5.4 min | 7.1 min | 7.5 min | 3 | 2 |
| Structural guards (tooling D) | 34 | 5.3 min | 5.8 min | 5.8 min | 5 | 0 |
| Workflow and shader lints | 46 | 0.5 min | 0.6 min | 0.9 min | 0 | 2 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 26 | 0.2 min | 0.2 min | 0.3 min |
| CI (draft fast tier) | 19 | 0.2 min | 0.3 min | 0.3 min |
| Draft push (CI skipped — add run-ci label) | 10 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 37 | 2.3 min | 3.5 min | 4.3 min |
| Emulated VR (IWER / xr-emulated) | 13 | 2.5 min | 2.8 min | 2.9 min |
| Golden menus on a runner (trial, non-blocking) | 2 | 1.4 min | 2.2 min | 2.2 min |
| Parts option-resolution census | 46 | 0.2 min | 2.0 min | 2.6 min |
| Per-circuit geometry sweeps | 14 | 6.2 min | 6.5 min | 8.4 min |
| Pure-node unit suites | 23 | 10.6 min | 11.0 min | 11.2 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 5 | 13.8 min | 14.4 min | 14.4 min |
| Select specs for this change | 48 | 0.4 min | 0.5 min | 0.6 min |
| Selected specs (change-aware gate) | 20 | 8.2 min | 8.8 min | 9.0 min |
| Selected specs (verdict) | 43 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 26 | 3.3 min | 4.1 min | 9.7 min |
| Staged build boots (minified _site, as Pages ships it) | 26 | 3.5 min | 4.1 min | 4.2 min |
| Structural guards | 46 | 5.7 min | 7.5 min | 8.2 min |
| Workflow and shader lints | 46 | 0.5 min | 0.6 min | 0.9 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 8.3%; re-gated SHAs 13 (15 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=19, p50 7.6 min, p90 12.0 min.
- Full tier: n=26, p50 12.6 min, p90 18.1 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=41, p50 16.4 min, p90 29.6 min; superseded (cancelled) 16.
- DORA: deploy freq 26.7/day, lead time p50 16.4 min, change-fail 6.8%, MTTR p50 25.0 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 10.6 min (n=23) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.3 min, p90 4.1 min (n=26) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 8.2 min, p90 8.8 min (n=20) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 12.6 min, p90 18.1 min (n=26) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 16.4 min, p90 29.6 min (n=41) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 15 of 60 runs (25%), 13 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 8.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
