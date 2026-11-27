# Process dashboard

Generated 2026-11-27T14:28Z. ci.yml runs in the window: 60 (2026-11-26T15:56Z → 2026-11-27T14:26Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 30 | 0.2 min | 0.3 min | 0.4 min | 5 | 0 |
| CI (draft fast tier) | 29 | 0.2 min | 0.3 min | 0.4 min | 4 | 0 |
| Driving model (characterization traces) | 20 | 0.7 min | 0.8 min | 0.8 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 18 | 2.3 min | 3.1 min | 3.3 min | 0 | 1 |
| Parts option-resolution census | 59 | 0.3 min | 0.4 min | 0.9 min | 0 | 1 |
| Per-circuit geometry sweeps | 38 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 22 | 5.0 min | 7.0 min | 8.6 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 22 | 6.8 min | 9.1 min | 12.4 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 22 | 7.8 min | 9.9 min | 9.9 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 22 | 8.1 min | 10.3 min | 10.4 min | 0 | 0 |
| Pure-node unit suites (page-a) | 26 | 2.9 min | 3.0 min | 7.8 min | 0 | 0 |
| Pure-node unit suites (page-b) | 25 | 1.1 min | 1.2 min | 1.2 min | 0 | 0 |
| Pure-node unit suites (slow) | 24 | 5.7 min | 6.2 min | 8.0 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 26 | 3.9 min | 4.2 min | 4.3 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 26 | 2.1 min | 2.2 min | 2.5 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 28 | 5.3 min | 5.5 min | 5.7 min | 1 | 0 |
| Pure-node unit suites (vm-b2) | 28 | 8.3 min | 8.7 min | 8.8 min | 3 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 19 | 20.6 min | 24.3 min | 25.1 min | 0 | 1 |
| Select specs for this change | 59 | 0.5 min | 0.8 min | 0.8 min | 0 | 1 |
| Selected specs (verdict) | 59 | 0.1 min | 0.2 min | 0.4 min | 0 | 1 |
| Smoke (page boots, __apex responds) (1) | 30 | 3.1 min | 3.8 min | 4.5 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 30 | 3.7 min | 5.1 min | 5.4 min | 0 | 1 |
| Structural guards | 59 | 0.1 min | 0.1 min | 0.1 min | 6 | 1 |
| Structural guards (tooling A) | 59 | 5.4 min | 10.3 min | 11.0 min | 6 | 1 |
| Structural guards (tooling B) | 30 | 3.2 min | 5.4 min | 6.4 min | 0 | 0 |
| Structural guards (tooling C) | 59 | 5.9 min | 10.5 min | 10.8 min | 0 | 1 |
| Structural guards (tooling D) | 30 | 3.2 min | 5.2 min | 5.4 min | 0 | 0 |
| Workflow and shader lints | 59 | 0.5 min | 0.6 min | 0.7 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 30 | 0.2 min | 0.3 min | 0.4 min |
| CI (draft fast tier) | 29 | 0.2 min | 0.3 min | 0.4 min |
| Driving model (characterization traces) | 20 | 0.7 min | 0.8 min | 0.8 min |
| Emulated VR (IWER / xr-emulated) | 18 | 2.3 min | 3.1 min | 3.3 min |
| Parts option-resolution census | 59 | 0.3 min | 0.4 min | 0.9 min |
| Per-circuit geometry sweeps | 22 | 9.7 min | 10.4 min | 12.4 min |
| Pure-node unit suites | 29 | 8.3 min | 8.7 min | 8.8 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 19 | 20.6 min | 24.3 min | 25.1 min |
| Select specs for this change | 59 | 0.5 min | 0.8 min | 0.8 min |
| Selected specs (change-aware gate) | 30 | 10.2 min | 10.8 min | 11.3 min |
| Selected specs (verdict) | 59 | 0.1 min | 0.2 min | 0.4 min |
| Smoke (page boots, __apex responds) | 30 | 3.1 min | 3.8 min | 4.5 min |
| Staged build boots (minified _site, as Pages ships it) | 30 | 3.7 min | 5.1 min | 5.4 min |
| Structural guards | 59 | 6.4 min | 10.6 min | 11.0 min |
| Workflow and shader lints | 59 | 0.5 min | 0.6 min | 0.7 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 1.7%; re-gated SHAs 13 (13 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=29, p50 11.3 min, p90 13.8 min.
- Full tier: n=30, p50 22.9 min, p90 31.0 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=50, p50 13.3 min, p90 35.6 min; superseded (cancelled) 8.
- DORA: deploy freq 53.3/day, lead time p50 13.3 min, change-fail 3.8%, MTTR p50 42.3 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 8.3 min (n=29) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.1 min, p90 3.8 min (n=30) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 10.2 min, p90 10.8 min (n=30) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 22.9 min, p90 31.0 min (n=30) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 13.3 min, p90 35.6 min (n=50) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 13 of 60 runs (21.7%), 13 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 1.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
