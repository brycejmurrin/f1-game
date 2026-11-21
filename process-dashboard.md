# Process dashboard

Generated 2026-11-21T13:07Z. ci.yml runs in the window: 60 (2026-11-20T17:34Z → 2026-11-21T13:04Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 38 | 0.2 min | 0.3 min | 0.3 min | 4 | 0 |
| CI (draft fast tier) | 20 | 0.2 min | 0.3 min | 0.4 min | 2 | 0 |
| Driving model (characterization traces) | 18 | 2.2 min | 3.8 min | 8.0 min | 1 | 0 |
| Emulated VR (IWER / xr-emulated) | 7 | 2.8 min | 3.0 min | 3.0 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 1.7 min | 2.1 min | 0 | 0 |
| Per-circuit geometry sweeps | 53 | 0.1 min | 0.1 min | 0.1 min | 2 | 1 |
| Per-circuit geometry sweeps (1of4) | 13 | 6.0 min | 6.2 min | 6.3 min | 2 | 1 |
| Per-circuit geometry sweeps (2of4) | 13 | 5.5 min | 6.8 min | 6.8 min | 0 | 1 |
| Per-circuit geometry sweeps (3of4) | 13 | 6.5 min | 7.1 min | 7.1 min | 0 | 1 |
| Per-circuit geometry sweeps (4of4) | 13 | 5.8 min | 7.7 min | 7.9 min | 0 | 1 |
| Pure-node unit suites (page-a) | 29 | 1.0 min | 1.3 min | 1.3 min | 0 | 0 |
| Pure-node unit suites (page-b) | 20 | 1.3 min | 1.4 min | 1.5 min | 0 | 0 |
| Pure-node unit suites (slow) | 22 | 9.8 min | 10.1 min | 11.0 min | 0 | 1 |
| Pure-node unit suites (vm-a1) | 28 | 4.1 min | 4.7 min | 4.7 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 23 | 2.3 min | 3.0 min | 3.1 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 27 | 5.2 min | 7.1 min | 7.2 min | 0 | 1 |
| Pure-node unit suites (vm-b2) | 27 | 6.0 min | 7.9 min | 8.0 min | 0 | 1 |
| Renderer specs on a real GPU (macos-latest, Metal) | 7 | 19.4 min | 21.1 min | 21.1 min | 0 | 2 |
| Select specs for this change | 60 | 0.5 min | 0.6 min | 1.1 min | 0 | 0 |
| Selected specs (verdict) | 58 | 0.1 min | 0.2 min | 0.4 min | 3 | 2 |
| Smoke (page boots, __apex responds) (1) | 40 | 3.3 min | 4.6 min | 5.1 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 40 | 4.1 min | 5.1 min | 5.2 min | 0 | 0 |
| Structural guards | 59 | 0.1 min | 0.1 min | 0.1 min | 2 | 1 |
| Structural guards (tooling A) | 59 | 0.6 min | 6.1 min | 6.3 min | 0 | 1 |
| Structural guards (tooling B) | 60 | 2.8 min | 4.3 min | 4.7 min | 1 | 0 |
| Structural guards (tooling C) | 59 | 0.5 min | 7.0 min | 7.2 min | 1 | 1 |
| Structural guards (tooling D) | 60 | 0.4 min | 5.5 min | 5.7 min | 1 | 0 |
| Workflow and shader lints | 60 | 0.5 min | 0.7 min | 0.8 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 38 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 20 | 0.2 min | 0.3 min | 0.4 min |
| Driving model (characterization traces) | 18 | 2.2 min | 3.8 min | 8.0 min |
| Emulated VR (IWER / xr-emulated) | 7 | 2.8 min | 3.0 min | 3.0 min |
| Parts option-resolution census | 60 | 0.3 min | 1.7 min | 2.1 min |
| Per-circuit geometry sweeps | 13 | 7.0 min | 7.7 min | 7.9 min |
| Pure-node unit suites | 37 | 7.8 min | 10.0 min | 11.0 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 7 | 19.4 min | 21.1 min | 21.1 min |
| Select specs for this change | 60 | 0.5 min | 0.6 min | 1.1 min |
| Selected specs (change-aware gate) | 56 | 6.0 min | 10.8 min | 12.8 min |
| Selected specs (verdict) | 58 | 0.1 min | 0.2 min | 0.4 min |
| Smoke (page boots, __apex responds) | 40 | 3.3 min | 4.6 min | 5.1 min |
| Staged build boots (minified _site, as Pages ships it) | 40 | 4.1 min | 5.1 min | 5.2 min |
| Structural guards | 60 | 3.3 min | 6.9 min | 7.2 min |
| Workflow and shader lints | 60 | 0.5 min | 0.7 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 3.3%; re-gated SHAs 17 (18 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=0, p50 n/a, p90 n/a.
- Full tier: n=58, p50 19.4 min, p90 54.2 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=35, p50 25.4 min, p90 49.0 min; superseded (cancelled) 21.
- DORA: deploy freq 43.1/day, lead time p50 25.4 min, change-fail 10.3%, MTTR p50 23.8 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 7.8 min (n=37) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.3 min, p90 4.6 min (n=40) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 6.0 min, p90 10.8 min (n=56) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 19.4 min, p90 54.2 min (n=58) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 25.4 min, p90 49.0 min (n=35) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 18 of 60 runs (30%), 17 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 3.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
