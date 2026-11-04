# Process dashboard

Generated 2026-11-04T12:38Z. ci.yml runs in the window: 60 (2026-11-04T05:51Z → 2026-11-04T12:38Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 22 | 0.2 min | 0.2 min | 0.3 min | 1 | 0 |
| CI (draft fast tier) | 23 | 0.2 min | 0.2 min | 0.3 min | 2 | 0 |
| Driving model (characterization traces) | 21 | 2.4 min | 3.7 min | 4.0 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 3 | 2.3 min | 3.0 min | 3.0 min | 0 | 1 |
| Parts option-resolution census | 59 | 0.3 min | 0.5 min | 2.2 min | 0 | 0 |
| Per-circuit geometry sweeps | 56 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 5 | 5.5 min | 5.7 min | 5.7 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 5 | 6.6 min | 6.9 min | 6.9 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 5 | 4.9 min | 6.5 min | 6.5 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 5 | 6.2 min | 7.9 min | 7.9 min | 0 | 0 |
| Pure-node unit suites (page-a) | 12 | 1.0 min | 1.1 min | 1.2 min | 0 | 0 |
| Pure-node unit suites (page-b) | 12 | 1.5 min | 1.5 min | 1.5 min | 0 | 0 |
| Pure-node unit suites (slow) | 13 | 7.3 min | 8.9 min | 9.0 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 16 | 3.1 min | 3.6 min | 3.6 min | 1 | 0 |
| Pure-node unit suites (vm-a2) | 15 | 1.8 min | 2.5 min | 2.5 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 15 | 5.7 min | 6.0 min | 6.3 min | 1 | 0 |
| Pure-node unit suites (vm-b2) | 15 | 5.1 min | 5.3 min | 5.5 min | 1 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) 1/2 | 2 | 11.5 min | 12.1 min | 12.1 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) 2/2 | 2 | 7.2 min | 8.8 min | 8.8 min | 0 | 0 |
| Select specs for this change | 58 | 0.5 min | 0.6 min | 0.7 min | 0 | 1 |
| Selected specs (verdict) | 46 | 0.1 min | 0.2 min | 3.2 min | 3 | 13 |
| Smoke (page boots, __apex responds) (1) | 22 | 3.3 min | 3.6 min | 3.7 min | 0 | 1 |
| Staged build boots (minified _site, as Pages ships it) | 22 | 3.6 min | 3.9 min | 4.0 min | 0 | 1 |
| Structural guards | 54 | 0.1 min | 0.1 min | 0.1 min | 1 | 5 |
| Structural guards (tooling A) | 55 | 1.0 min | 4.2 min | 5.1 min | 0 | 4 |
| Structural guards (tooling B) | 56 | 1.9 min | 3.2 min | 3.2 min | 2 | 3 |
| Structural guards (tooling C) | 55 | 2.5 min | 4.3 min | 4.5 min | 0 | 4 |
| Structural guards (tooling D) | 56 | 1.2 min | 3.6 min | 3.8 min | 2 | 3 |
| Workflow and shader lints | 59 | 0.5 min | 0.7 min | 0.8 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 22 | 0.2 min | 0.2 min | 0.3 min |
| CI (draft fast tier) | 23 | 0.2 min | 0.2 min | 0.3 min |
| Driving model (characterization traces) | 21 | 2.4 min | 3.7 min | 4.0 min |
| Emulated VR (IWER / xr-emulated) | 3 | 2.3 min | 3.0 min | 3.0 min |
| Parts option-resolution census | 59 | 0.3 min | 0.5 min | 2.2 min |
| Per-circuit geometry sweeps | 5 | 6.6 min | 7.9 min | 7.9 min |
| Pure-node unit suites | 16 | 6.0 min | 8.9 min | 9.0 min |
| Renderer specs on a real GPU (macos-latest, Metal) 1/2 | 2 | 11.5 min | 12.1 min | 12.1 min |
| Renderer specs on a real GPU (macos-latest, Metal) 2/2 | 2 | 7.2 min | 8.8 min | 8.8 min |
| Select specs for this change | 58 | 0.5 min | 0.6 min | 0.7 min |
| Selected specs (change-aware gate) | 37 | 8.2 min | 11.5 min | 35.9 min |
| Selected specs (verdict) | 46 | 0.1 min | 0.2 min | 3.2 min |
| Smoke (page boots, __apex responds) | 22 | 3.3 min | 3.6 min | 3.7 min |
| Staged build boots (minified _site, as Pages ships it) | 22 | 3.6 min | 3.9 min | 4.0 min |
| Structural guards | 56 | 2.9 min | 4.3 min | 5.1 min |
| Workflow and shader lints | 59 | 0.5 min | 0.7 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 23.3%; re-gated SHAs 12 (12 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=13, p50 6.9 min, p90 10.0 min.
- Full tier: n=33, p50 29.5 min, p90 53.3 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=7, p50 26.5 min, p90 57.7 min; superseded (cancelled) 52.
- DORA: deploy freq 24.8/day, lead time p50 26.5 min, change-fail 12.5%, MTTR p50 n/a.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 6.0 min (n=16) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.3 min, p90 3.6 min (n=22) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 8.2 min, p90 11.5 min (n=37) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 29.5 min, p90 53.3 min (n=33) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 26.5 min, p90 57.7 min (n=7) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 12 of 60 runs (20%), 12 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 23.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
