# Process dashboard

Generated 2026-11-03T12:28Z. ci.yml runs in the window: 60 (2026-10-31T16:21Z → 2026-11-03T12:25Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 19 | 0.2 min | 0.3 min | 0.3 min | 0 | 0 |
| CI (draft fast tier) | 27 | 0.2 min | 0.2 min | 0.3 min | 4 | 0 |
| CI edit event (ignored) | 1 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Driving model (characterization traces) | 9 | 2.5 min | 3.9 min | 3.9 min | 0 | 3 |
| Emulated VR (IWER / xr-emulated) | 3 | 3.0 min | 3.1 min | 3.1 min | 0 | 3 |
| Parts option-resolution census | 55 | 0.3 min | 0.3 min | 2.3 min | 0 | 4 |
| Per-circuit geometry sweeps | 48 | 0.1 min | 0.1 min | 0.1 min | 0 | 4 |
| Per-circuit geometry sweeps (1of4) | 6 | 0.4 min | 6.4 min | 6.4 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 6 | 0.3 min | 6.9 min | 6.9 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 6 | 1.6 min | 6.2 min | 6.2 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 6 | 0.6 min | 6.5 min | 6.5 min | 0 | 0 |
| Pure-node unit suites (page-a) | 4 | 5.0 min | 6.4 min | 6.4 min | 0 | 0 |
| Pure-node unit suites (page-b) | 4 | 2.2 min | 3.4 min | 3.4 min | 0 | 0 |
| Pure-node unit suites (slow) | 7 | 6.1 min | 10.3 min | 10.3 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 7 | 3.0 min | 5.2 min | 5.2 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 4 | 2.0 min | 3.6 min | 3.6 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 8 | 6.3 min | 9.6 min | 9.6 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 8 | 6.2 min | 10.8 min | 10.8 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 1 | 16.4 min | 16.4 min | 16.4 min | 0 | 3 |
| Select specs for this change | 56 | 0.4 min | 0.5 min | 0.6 min | 0 | 3 |
| Selected specs (verdict) | 46 | 0.1 min | 0.2 min | 0.2 min | 0 | 13 |
| Smoke (page boots, __apex responds) (1) | 20 | 2.5 min | 3.4 min | 3.7 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 20 | 3.6 min | 3.9 min | 4.1 min | 0 | 1 |
| Structural guards | 54 | 0.1 min | 0.1 min | 0.1 min | 10 | 5 |
| Structural guards (tooling A) | 55 | 3.5 min | 5.3 min | 5.5 min | 0 | 4 |
| Structural guards (tooling B) | 55 | 2.3 min | 3.4 min | 3.5 min | 0 | 4 |
| Structural guards (tooling C) | 55 | 3.0 min | 4.9 min | 5.0 min | 7 | 4 |
| Structural guards (tooling D) | 55 | 2.5 min | 4.1 min | 4.3 min | 4 | 4 |
| Workflow and shader lints | 57 | 0.5 min | 0.7 min | 1.0 min | 0 | 2 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 19 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 27 | 0.2 min | 0.2 min | 0.3 min |
| CI edit event (ignored) | 1 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 9 | 2.5 min | 3.9 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 3 | 3.0 min | 3.1 min | 3.1 min |
| Parts option-resolution census | 55 | 0.3 min | 0.3 min | 2.3 min |
| Per-circuit geometry sweeps | 6 | 1.6 min | 6.9 min | 6.9 min |
| Pure-node unit suites | 9 | 9.6 min | 10.8 min | 10.8 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 1 | 16.4 min | 16.4 min | 16.4 min |
| Select specs for this change | 56 | 0.4 min | 0.5 min | 0.6 min |
| Selected specs (change-aware gate) | 19 | 7.2 min | 10.6 min | 11.0 min |
| Selected specs (verdict) | 46 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 20 | 2.5 min | 3.4 min | 3.7 min |
| Staged build boots (minified _site, as Pages ships it) | 20 | 3.6 min | 3.9 min | 4.1 min |
| Structural guards | 57 | 4.5 min | 5.3 min | 5.5 min |
| Workflow and shader lints | 57 | 0.5 min | 0.7 min | 1.0 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 21.7%; re-gated SHAs 5 (5 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=13, p50 30.3 min, p90 37.0 min.
- Full tier: n=33, p50 76.8 min, p90 101.6 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=50, p50 9.7 min, p90 22.7 min; superseded (cancelled) 9.
- DORA: deploy freq 17.6/day, lead time p50 9.7 min, change-fail 2%, MTTR p50 39.6 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 9.6 min (n=9) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 2.5 min, p90 3.4 min (n=20) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 7.2 min, p90 10.6 min (n=19) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 76.8 min, p90 101.6 min (n=33) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 9.7 min, p90 22.7 min (n=50) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 5 of 60 runs (8.3%), 5 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 21.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
