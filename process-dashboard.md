# Process dashboard

Generated 2026-11-11T12:17Z. ci.yml runs in the window: 60 (2026-11-10T13:14Z → 2026-11-11T12:10Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 7 | 0.2 min | 0.3 min | 0.3 min | 1 | 0 |
| CI (draft fast tier) | 22 | 0.2 min | 0.2 min | 0.4 min | 2 | 0 |
| Driving model (characterization traces) | 34 | 2.3 min | 3.8 min | 8.1 min | 1 | 1 |
| Emulated VR (IWER / xr-emulated) | 1 | 2.4 min | 2.4 min | 2.4 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 1.7 min | 2.2 min | 0 | 0 |
| Per-circuit geometry sweeps | 40 | 0.1 min | 0.1 min | 0.1 min | 2 | 1 |
| Per-circuit geometry sweeps (1of4) | 4 | 4.4 min | 5.0 min | 5.0 min | 2 | 0 |
| Per-circuit geometry sweeps (2of4) | 4 | 5.7 min | 6.6 min | 6.6 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 4 | 5.3 min | 7.7 min | 7.7 min | 1 | 0 |
| Per-circuit geometry sweeps (4of4) | 4 | 5.9 min | 7.2 min | 7.2 min | 0 | 0 |
| Pure-node unit suites (page-a) | 12 | 5.2 min | 6.3 min | 6.4 min | 0 | 0 |
| Pure-node unit suites (page-b) | 12 | 2.8 min | 3.5 min | 3.6 min | 0 | 0 |
| Pure-node unit suites (slow) | 12 | 9.2 min | 10.9 min | 11.0 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 12 | 4.4 min | 5.2 min | 5.3 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 11 | 2.9 min | 3.7 min | 3.7 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 12 | 8.7 min | 11.6 min | 12.2 min | 1 | 0 |
| Pure-node unit suites (vm-b2) | 12 | 8.3 min | 11.3 min | 11.3 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 7 | 19.3 min | 21.8 min | 21.8 min | 0 | 1 |
| Select specs for this change | 60 | 0.4 min | 0.5 min | 0.8 min | 0 | 0 |
| Selected specs (verdict) | 29 | 0.1 min | 0.2 min | 0.3 min | 3 | 31 |
| Smoke (page boots, __apex responds) (1) | 14 | 3.2 min | 4.4 min | 4.6 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 14 | 3.7 min | 4.8 min | 5.1 min | 0 | 0 |
| Structural guards | 58 | 0.1 min | 0.1 min | 0.1 min | 7 | 2 |
| Structural guards (tooling A) | 60 | 5.2 min | 6.7 min | 7.0 min | 1 | 0 |
| Structural guards (tooling B) | 60 | 3.6 min | 4.6 min | 5.4 min | 2 | 0 |
| Structural guards (tooling C) | 60 | 4.0 min | 5.1 min | 5.3 min | 3 | 0 |
| Structural guards (tooling D) | 60 | 3.5 min | 4.5 min | 13.3 min | 3 | 0 |
| Workflow and shader lints | 60 | 0.5 min | 0.6 min | 0.8 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 7 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 22 | 0.2 min | 0.2 min | 0.4 min |
| Driving model (characterization traces) | 34 | 2.3 min | 3.8 min | 8.1 min |
| Emulated VR (IWER / xr-emulated) | 1 | 2.4 min | 2.4 min | 2.4 min |
| Parts option-resolution census | 60 | 0.3 min | 1.7 min | 2.2 min |
| Per-circuit geometry sweeps | 4 | 6.6 min | 7.7 min | 7.7 min |
| Pure-node unit suites | 12 | 11.2 min | 11.6 min | 12.2 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 7 | 19.3 min | 21.8 min | 21.8 min |
| Select specs for this change | 60 | 0.4 min | 0.5 min | 0.8 min |
| Selected specs (change-aware gate) | 33 | 11.2 min | 14.0 min | 14.4 min |
| Selected specs (verdict) | 29 | 0.1 min | 0.2 min | 0.3 min |
| Smoke (page boots, __apex responds) | 14 | 3.2 min | 4.4 min | 4.6 min |
| Staged build boots (minified _site, as Pages ships it) | 14 | 3.7 min | 4.8 min | 5.1 min |
| Structural guards | 60 | 5.2 min | 6.7 min | 13.3 min |
| Workflow and shader lints | 60 | 0.5 min | 0.6 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 51.7%; re-gated SHAs 5 (5 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=0, p50 n/a, p90 n/a.
- Full tier: n=29, p50 108.7 min, p90 153.8 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=12, p50 20.4 min, p90 48.7 min; superseded (cancelled) 25.
- DORA: deploy freq 12.6/day, lead time p50 20.4 min, change-fail 65.7%, MTTR p50 29.5 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 11.2 min (n=12) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.2 min, p90 4.4 min (n=14) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 11.2 min, p90 14.0 min (n=33) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 108.7 min, p90 153.8 min (n=29) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 20.4 min, p90 48.7 min (n=12) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 5 of 60 runs (8.3%), 5 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 51.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
