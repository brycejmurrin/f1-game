# Process dashboard

Generated 2026-11-23T15:30Z. ci.yml runs in the window: 60 (2026-11-22T02:53Z → 2026-11-23T11:03Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 34 | 0.2 min | 0.3 min | 0.3 min | 5 | 0 |
| CI (draft fast tier) | 19 | 0.2 min | 0.3 min | 0.3 min | 2 | 1 |
| Driving model (characterization traces) | 25 | 0.7 min | 0.8 min | 1.1 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 15 | 2.4 min | 2.9 min | 3.1 min | 0 | 1 |
| Parts option-resolution census | 59 | 0.3 min | 1.0 min | 1.1 min | 0 | 1 |
| Per-circuit geometry sweeps | 47 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 14 | 5.7 min | 6.3 min | 6.3 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 14 | 4.8 min | 6.9 min | 7.3 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 14 | 5.7 min | 7.3 min | 7.5 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 14 | 7.1 min | 8.2 min | 8.2 min | 0 | 0 |
| Pure-node unit suites (page-a) | 37 | 1.0 min | 1.1 min | 1.2 min | 0 | 0 |
| Pure-node unit suites (page-b) | 31 | 1.1 min | 1.3 min | 1.3 min | 0 | 0 |
| Pure-node unit suites (slow) | 30 | 7.7 min | 8.0 min | 8.2 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 31 | 3.8 min | 4.0 min | 4.0 min | 1 | 0 |
| Pure-node unit suites (vm-a2) | 27 | 2.1 min | 2.4 min | 3.1 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 30 | 5.1 min | 5.6 min | 5.9 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 32 | 5.1 min | 5.5 min | 5.8 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 16 | 20.2 min | 22.7 min | 23.1 min | 0 | 3 |
| Select specs for this change | 59 | 0.5 min | 0.6 min | 0.7 min | 0 | 1 |
| Selected specs (verdict) | 55 | 0.1 min | 0.3 min | 0.3 min | 3 | 5 |
| Smoke (page boots, __apex responds) (1) | 38 | 3.3 min | 4.5 min | 4.7 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 38 | 3.5 min | 5.1 min | 5.8 min | 0 | 1 |
| Structural guards | 58 | 0.1 min | 0.1 min | 0.1 min | 5 | 2 |
| Structural guards (tooling A) | 59 | 4.3 min | 6.3 min | 6.8 min | 1 | 1 |
| Structural guards (tooling B) | 59 | 3.5 min | 4.5 min | 4.7 min | 5 | 1 |
| Structural guards (tooling C) | 59 | 4.5 min | 6.6 min | 6.8 min | 0 | 1 |
| Structural guards (tooling D) | 59 | 3.3 min | 4.9 min | 5.1 min | 2 | 1 |
| Workflow and shader lints | 59 | 0.5 min | 0.6 min | 0.7 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 34 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 19 | 0.2 min | 0.3 min | 0.3 min |
| Driving model (characterization traces) | 25 | 0.7 min | 0.8 min | 1.1 min |
| Emulated VR (IWER / xr-emulated) | 15 | 2.4 min | 2.9 min | 3.1 min |
| Parts option-resolution census | 59 | 0.3 min | 1.0 min | 1.1 min |
| Per-circuit geometry sweeps | 14 | 7.3 min | 8.2 min | 8.2 min |
| Pure-node unit suites | 37 | 7.4 min | 8.0 min | 8.2 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 16 | 20.2 min | 22.7 min | 23.1 min |
| Select specs for this change | 59 | 0.5 min | 0.6 min | 0.7 min |
| Selected specs (change-aware gate) | 37 | 10.2 min | 12.3 min | 14.9 min |
| Selected specs (verdict) | 55 | 0.1 min | 0.3 min | 0.3 min |
| Smoke (page boots, __apex responds) | 38 | 3.3 min | 4.5 min | 4.7 min |
| Staged build boots (minified _site, as Pages ships it) | 38 | 3.5 min | 5.1 min | 5.8 min |
| Structural guards | 59 | 5.1 min | 6.6 min | 6.8 min |
| Workflow and shader lints | 59 | 0.5 min | 0.6 min | 0.7 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 11.7%; re-gated SHAs 14 (14 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=20, p50 6.2 min, p90 7.7 min.
- Full tier: n=33, p50 22.9 min, p90 38.5 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=37, p50 24.0 min, p90 58.1 min; superseded (cancelled) 19.
- DORA: deploy freq 27.6/day, lead time p50 24.0 min, change-fail 9.8%, MTTR p50 29.3 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 7.4 min (n=37) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.3 min, p90 4.5 min (n=38) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 10.2 min, p90 12.3 min (n=37) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 22.9 min, p90 38.5 min (n=33) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 24.0 min, p90 58.1 min (n=37) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 14 of 60 runs (23.3%), 14 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 11.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
