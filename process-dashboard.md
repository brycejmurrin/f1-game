# Process dashboard

Generated 2026-11-19T14:03Z. ci.yml runs in the window: 60 (2026-11-18T18:41Z → 2026-11-19T13:57Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 24 | 0.2 min | 0.3 min | 0.4 min | 6 | 0 |
| CI (draft fast tier) | 21 | 0.2 min | 0.2 min | 0.5 min | 1 | 0 |
| Driving model (characterization traces) | 26 | 2.3 min | 3.8 min | 7.8 min | 1 | 4 |
| Emulated VR (IWER / xr-emulated) | 9 | 2.5 min | 3.4 min | 3.4 min | 0 | 3 |
| Parts option-resolution census | 59 | 0.3 min | 1.7 min | 2.3 min | 0 | 1 |
| Per-circuit geometry sweeps | 55 | 0.1 min | 0.1 min | 0.1 min | 2 | 4 |
| Per-circuit geometry sweeps (1of4) | 12 | 4.1 min | 6.0 min | 6.1 min | 1 | 0 |
| Per-circuit geometry sweeps (2of4) | 12 | 4.4 min | 6.6 min | 6.8 min | 1 | 0 |
| Per-circuit geometry sweeps (3of4) | 12 | 4.5 min | 6.7 min | 7.4 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 12 | 5.2 min | 7.5 min | 9.9 min | 0 | 0 |
| Pure-node unit suites (page-a) | 21 | 0.9 min | 1.2 min | 1.3 min | 0 | 0 |
| Pure-node unit suites (page-b) | 21 | 1.2 min | 1.4 min | 1.5 min | 1 | 0 |
| Pure-node unit suites (slow) | 20 | 8.1 min | 10.2 min | 10.3 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 19 | 4.2 min | 4.9 min | 4.9 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 21 | 2.2 min | 3.0 min | 3.0 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 21 | 5.4 min | 7.2 min | 7.5 min | 1 | 0 |
| Pure-node unit suites (vm-b2) | 21 | 4.6 min | 6.3 min | 6.3 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 15 | 21.4 min | 23.6 min | 24.6 min | 0 | 3 |
| Select specs for this change | 57 | 0.5 min | 0.7 min | 0.8 min | 0 | 3 |
| Selected specs (verdict) | 45 | 0.2 min | 0.3 min | 0.6 min | 5 | 15 |
| Smoke (page boots, __apex responds) (1) | 32 | 0.1 min | 4.4 min | 4.9 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 32 | 3.8 min | 5.0 min | 5.2 min | 0 | 0 |
| Structural guards | 56 | 0.1 min | 0.1 min | 0.1 min | 5 | 4 |
| Structural guards (tooling A) | 58 | 4.0 min | 6.0 min | 6.3 min | 1 | 2 |
| Structural guards (tooling B) | 57 | 3.0 min | 4.2 min | 4.8 min | 3 | 3 |
| Structural guards (tooling C) | 59 | 4.2 min | 6.1 min | 6.8 min | 1 | 1 |
| Structural guards (tooling D) | 58 | 3.0 min | 4.7 min | 4.8 min | 5 | 2 |
| Workflow and shader lints | 58 | 0.5 min | 0.7 min | 0.8 min | 1 | 2 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 24 | 0.2 min | 0.3 min | 0.4 min |
| CI (draft fast tier) | 21 | 0.2 min | 0.2 min | 0.5 min |
| Driving model (characterization traces) | 26 | 2.3 min | 3.8 min | 7.8 min |
| Emulated VR (IWER / xr-emulated) | 9 | 2.5 min | 3.4 min | 3.4 min |
| Parts option-resolution census | 59 | 0.3 min | 1.7 min | 2.3 min |
| Per-circuit geometry sweeps | 12 | 6.5 min | 7.5 min | 9.9 min |
| Pure-node unit suites | 22 | 7.5 min | 10.2 min | 10.3 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 15 | 21.4 min | 23.6 min | 24.6 min |
| Select specs for this change | 57 | 0.5 min | 0.7 min | 0.8 min |
| Selected specs (change-aware gate) | 42 | 6.1 min | 11.3 min | 12.2 min |
| Selected specs (verdict) | 45 | 0.2 min | 0.3 min | 0.6 min |
| Smoke (page boots, __apex responds) | 32 | 0.1 min | 4.4 min | 4.9 min |
| Staged build boots (minified _site, as Pages ships it) | 32 | 3.8 min | 5.0 min | 5.2 min |
| Structural guards | 59 | 4.8 min | 6.1 min | 6.8 min |
| Workflow and shader lints | 58 | 0.5 min | 0.7 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 25%; re-gated SHAs 13 (13 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=3, p50 43.1 min, p90 44.0 min.
- Full tier: n=42, p50 29.4 min, p90 238.0 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=30, p50 29.8 min, p90 57.1 min; superseded (cancelled) 27.
- DORA: deploy freq 37.4/day, lead time p50 29.8 min, change-fail 9.1%, MTTR p50 24.7 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 7.5 min (n=22) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 0.1 min, p90 4.4 min (n=32) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 6.1 min, p90 11.3 min (n=42) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 29.4 min, p90 238.0 min (n=42) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 29.8 min, p90 57.1 min (n=30) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 13 of 60 runs (21.7%), 13 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 25% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
