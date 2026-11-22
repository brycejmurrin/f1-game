# Process dashboard

Generated 2026-11-22T12:59Z. ci.yml runs in the window: 60 (2026-11-21T13:14Z → 2026-11-22T12:46Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 22 | 0.2 min | 0.3 min | 0.3 min | 2 | 0 |
| CI (draft fast tier) | 9 | 0.2 min | 0.2 min | 0.2 min | 3 | 1 |
| Driving model (characterization traces) | 40 | 2.5 min | 3.8 min | 3.9 min | 0 | 6 |
| Emulated VR (IWER / xr-emulated) | 17 | 2.5 min | 3.4 min | 3.5 min | 0 | 6 |
| Parts option-resolution census | 56 | 0.9 min | 1.9 min | 2.3 min | 0 | 4 |
| Per-circuit geometry sweeps | 43 | 0.1 min | 0.1 min | 0.1 min | 1 | 9 |
| Per-circuit geometry sweeps (1of4) | 27 | 4.9 min | 6.3 min | 6.5 min | 0 | 2 |
| Per-circuit geometry sweeps (2of4) | 27 | 4.7 min | 6.7 min | 6.8 min | 1 | 2 |
| Per-circuit geometry sweeps (3of4) | 26 | 5.6 min | 7.2 min | 7.3 min | 1 | 3 |
| Per-circuit geometry sweeps (4of4) | 25 | 5.9 min | 8.0 min | 8.3 min | 0 | 4 |
| Pure-node unit suites (page-a) | 37 | 0.9 min | 1.1 min | 1.1 min | 0 | 0 |
| Pure-node unit suites (page-b) | 37 | 1.2 min | 1.3 min | 1.4 min | 0 | 0 |
| Pure-node unit suites (slow) | 35 | 7.5 min | 8.0 min | 8.5 min | 0 | 2 |
| Pure-node unit suites (vm-a1) | 36 | 3.7 min | 3.9 min | 4.2 min | 2 | 1 |
| Pure-node unit suites (vm-a2) | 37 | 2.1 min | 2.2 min | 2.4 min | 2 | 0 |
| Pure-node unit suites (vm-b1) | 36 | 5.3 min | 5.7 min | 5.8 min | 0 | 1 |
| Pure-node unit suites (vm-b2) | 36 | 5.1 min | 5.6 min | 5.8 min | 0 | 1 |
| Renderer specs on a real GPU (macos-latest, Metal) | 14 | 18.8 min | 21.1 min | 21.6 min | 0 | 10 |
| Select specs for this change | 56 | 0.5 min | 0.6 min | 0.8 min | 0 | 4 |
| Selected specs (verdict) | 32 | 0.2 min | 0.2 min | 0.3 min | 2 | 28 |
| Smoke (page boots, __apex responds) (1) | 38 | 3.0 min | 4.4 min | 4.7 min | 0 | 1 |
| Staged build boots (minified _site, as Pages ships it) | 37 | 3.5 min | 4.8 min | 5.4 min | 0 | 6 |
| Structural guards | 48 | 0.1 min | 0.1 min | 0.1 min | 8 | 12 |
| Structural guards (tooling A) | 54 | 4.8 min | 6.2 min | 6.4 min | 6 | 6 |
| Structural guards (tooling B) | 55 | 3.6 min | 4.4 min | 4.7 min | 6 | 5 |
| Structural guards (tooling C) | 53 | 5.1 min | 7.0 min | 7.2 min | 1 | 7 |
| Structural guards (tooling D) | 55 | 3.7 min | 5.4 min | 5.7 min | 9 | 5 |
| Workflow and shader lints | 56 | 0.5 min | 0.6 min | 0.7 min | 0 | 4 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 22 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 9 | 0.2 min | 0.2 min | 0.2 min |
| Driving model (characterization traces) | 40 | 2.5 min | 3.8 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 17 | 2.5 min | 3.4 min | 3.5 min |
| Parts option-resolution census | 56 | 0.9 min | 1.9 min | 2.3 min |
| Per-circuit geometry sweeps | 27 | 6.5 min | 8.0 min | 8.3 min |
| Pure-node unit suites | 37 | 7.5 min | 8.0 min | 8.5 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 14 | 18.8 min | 21.1 min | 21.6 min |
| Select specs for this change | 56 | 0.5 min | 0.6 min | 0.8 min |
| Selected specs (change-aware gate) | 38 | 9.6 min | 12.2 min | 15.0 min |
| Selected specs (verdict) | 32 | 0.2 min | 0.2 min | 0.3 min |
| Smoke (page boots, __apex responds) | 38 | 3.0 min | 4.4 min | 4.7 min |
| Staged build boots (minified _site, as Pages ships it) | 37 | 3.5 min | 4.8 min | 5.4 min |
| Structural guards | 56 | 5.7 min | 7.0 min | 7.2 min |
| Workflow and shader lints | 56 | 0.5 min | 0.6 min | 0.7 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 48.3%; re-gated SHAs 5 (5 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=7, p50 12.6 min, p90 18.1 min.
- Full tier: n=24, p50 50.7 min, p90 107.3 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=35, p50 27.8 min, p90 58.1 min; superseded (cancelled) 25.
- DORA: deploy freq 35.7/day, lead time p50 27.8 min, change-fail 0%, MTTR p50 n/a.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 7.5 min (n=37) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.0 min, p90 4.4 min (n=38) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 9.6 min, p90 12.2 min (n=38) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 50.7 min, p90 107.3 min (n=24) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 27.8 min, p90 58.1 min (n=35) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 5 of 60 runs (8.3%), 5 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 48.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
