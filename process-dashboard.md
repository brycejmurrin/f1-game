# Process dashboard

Generated 2026-11-24T15:23Z. ci.yml runs in the window: 60 (2026-11-23T08:30Z → 2026-11-24T13:05Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 24 | 0.2 min | 0.3 min | 0.4 min | 1 | 0 |
| CI (draft fast tier) | 35 | 0.2 min | 0.3 min | 0.4 min | 1 | 0 |
| Driving model (characterization traces) | 12 | 0.8 min | 0.9 min | 1.0 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 1 | 2.9 min | 2.9 min | 2.9 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 0.4 min | 1.0 min | 0 | 0 |
| Per-circuit geometry sweeps | 57 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Per-circuit geometry sweeps (1of4) | 4 | 7.1 min | 7.4 min | 7.4 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 4 | 6.3 min | 8.1 min | 8.1 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 4 | 6.2 min | 8.8 min | 8.8 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 4 | 8.5 min | 9.4 min | 9.4 min | 0 | 0 |
| Pure-node unit suites (page-a) | 25 | 1.0 min | 1.1 min | 1.2 min | 0 | 0 |
| Pure-node unit suites (page-b) | 17 | 1.2 min | 1.5 min | 1.7 min | 0 | 0 |
| Pure-node unit suites (slow) | 22 | 7.6 min | 8.1 min | 8.3 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 18 | 3.8 min | 4.0 min | 4.1 min | 1 | 0 |
| Pure-node unit suites (vm-a2) | 12 | 2.2 min | 2.5 min | 2.8 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 24 | 5.3 min | 5.9 min | 6.3 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 24 | 5.1 min | 5.5 min | 6.1 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 18.9 min | 24.5 min | 24.5 min | 0 | 0 |
| Select specs for this change | 60 | 0.5 min | 0.7 min | 0.8 min | 0 | 0 |
| Selected specs (verdict) | 59 | 0.1 min | 0.2 min | 0.3 min | 1 | 1 |
| Smoke (page boots, __apex responds) (1) | 25 | 3.9 min | 4.5 min | 4.6 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 25 | 4.4 min | 4.9 min | 5.0 min | 0 | 0 |
| Structural guards | 60 | 0.1 min | 0.1 min | 0.1 min | 1 | 0 |
| Structural guards (tooling A) | 60 | 4.8 min | 7.0 min | 7.3 min | 0 | 0 |
| Structural guards (tooling B) | 60 | 3.1 min | 4.4 min | 5.5 min | 1 | 0 |
| Structural guards (tooling C) | 60 | 4.9 min | 7.3 min | 7.5 min | 0 | 0 |
| Structural guards (tooling D) | 60 | 3.3 min | 5.0 min | 5.0 min | 0 | 0 |
| Workflow and shader lints | 60 | 0.5 min | 0.7 min | 0.8 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 24 | 0.2 min | 0.3 min | 0.4 min |
| CI (draft fast tier) | 35 | 0.2 min | 0.3 min | 0.4 min |
| Driving model (characterization traces) | 12 | 0.8 min | 0.9 min | 1.0 min |
| Emulated VR (IWER / xr-emulated) | 1 | 2.9 min | 2.9 min | 2.9 min |
| Parts option-resolution census | 60 | 0.3 min | 0.4 min | 1.0 min |
| Per-circuit geometry sweeps | 4 | 8.5 min | 9.4 min | 9.4 min |
| Pure-node unit suites | 25 | 7.2 min | 8.1 min | 8.3 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 18.9 min | 24.5 min | 24.5 min |
| Select specs for this change | 60 | 0.5 min | 0.7 min | 0.8 min |
| Selected specs (change-aware gate) | 25 | 9.4 min | 10.8 min | 11.8 min |
| Selected specs (verdict) | 59 | 0.1 min | 0.2 min | 0.3 min |
| Smoke (page boots, __apex responds) | 25 | 3.9 min | 4.5 min | 4.6 min |
| Staged build boots (minified _site, as Pages ships it) | 25 | 4.4 min | 4.9 min | 5.0 min |
| Structural guards | 60 | 6.2 min | 7.3 min | 7.5 min |
| Workflow and shader lints | 60 | 0.5 min | 0.7 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 1.7%; re-gated SHAs 18 (18 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=35, p50 7.8 min, p90 10.4 min.
- Full tier: n=24, p50 17.1 min, p90 37.8 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=47, p50 21.9 min, p90 33.5 min; superseded (cancelled) 13.
- DORA: deploy freq 39.5/day, lead time p50 21.9 min, change-fail 0%, MTTR p50 n/a.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 7.2 min (n=25) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.9 min, p90 4.5 min (n=25) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 9.4 min, p90 10.8 min (n=25) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 17.1 min, p90 37.8 min (n=24) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 21.9 min, p90 33.5 min (n=47) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 18 of 60 runs (30%), 18 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 1.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
