# Process dashboard

Generated 2026-11-05T12:50Z. ci.yml runs in the window: 60 (2026-11-04T18:52Z → 2026-11-05T12:34Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 30 | 0.2 min | 0.2 min | 0.3 min | 2 | 0 |
| CI (draft fast tier) | 27 | 0.2 min | 0.3 min | 0.3 min | 9 | 0 |
| Driving model (characterization traces) | 19 | 3.8 min | 3.9 min | 3.9 min | 0 | 1 |
| Golden menus on a runner (trial, non-blocking) | 1 | 1.4 min | 1.4 min | 1.4 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 1.7 min | 2.3 min | 0 | 0 |
| Per-circuit geometry sweeps | 46 | 0.1 min | 0.1 min | 0.1 min | 1 | 1 |
| Per-circuit geometry sweeps (1of4) | 1 | 5.7 min | 5.7 min | 5.7 min | 1 | 0 |
| Per-circuit geometry sweeps (2of4) | 1 | 5.4 min | 5.4 min | 5.4 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 1 | 5.3 min | 5.3 min | 5.3 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 1 | 5.7 min | 5.7 min | 5.7 min | 1 | 0 |
| Pure-node unit suites (page-a) | 1 | 1.1 min | 1.1 min | 1.1 min | 0 | 0 |
| Pure-node unit suites (page-b) | 1 | 1.3 min | 1.3 min | 1.3 min | 0 | 0 |
| Pure-node unit suites (slow) | 1 | 9.9 min | 9.9 min | 9.9 min | 1 | 0 |
| Pure-node unit suites (vm-a1) | 1 | 3.8 min | 3.8 min | 3.8 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 1 | 1.9 min | 1.9 min | 1.9 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 1 | 5.0 min | 5.0 min | 5.0 min | 1 | 0 |
| Pure-node unit suites (vm-b2) | 1 | 3.9 min | 3.9 min | 3.9 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) 1/2 | 1 | 14.2 min | 14.2 min | 14.2 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) 2/2 | 1 | 4.5 min | 4.5 min | 4.5 min | 0 | 0 |
| Select specs for this change | 60 | 0.4 min | 0.5 min | 0.8 min | 0 | 0 |
| Selected specs (verdict) | 56 | 0.2 min | 0.2 min | 0.4 min | 3 | 3 |
| Smoke (page boots, __apex responds) (1) | 1 | 10.8 min | 10.8 min | 10.8 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 1 | 15.1 min | 15.1 min | 15.1 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 1 | 12.3 min | 12.3 min | 12.3 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 1 | 4.6 min | 4.6 min | 4.6 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 1 | 3.8 min | 3.8 min | 3.8 min | 0 | 0 |
| Structural guards | 59 | 0.1 min | 0.1 min | 0.9 min | 10 | 1 |
| Structural guards (tooling A) | 59 | 3.0 min | 4.2 min | 4.3 min | 1 | 1 |
| Structural guards (tooling B) | 59 | 2.3 min | 3.1 min | 3.3 min | 4 | 1 |
| Structural guards (tooling C) | 59 | 2.8 min | 4.3 min | 4.4 min | 0 | 1 |
| Structural guards (tooling D) | 59 | 2.4 min | 3.7 min | 3.8 min | 5 | 1 |
| Workflow and shader lints | 59 | 0.5 min | 0.8 min | 1.3 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 30 | 0.2 min | 0.2 min | 0.3 min |
| CI (draft fast tier) | 27 | 0.2 min | 0.3 min | 0.3 min |
| Driving model (characterization traces) | 19 | 3.8 min | 3.9 min | 3.9 min |
| Golden menus on a runner (trial, non-blocking) | 1 | 1.4 min | 1.4 min | 1.4 min |
| Parts option-resolution census | 60 | 0.3 min | 1.7 min | 2.3 min |
| Per-circuit geometry sweeps | 1 | 5.7 min | 5.7 min | 5.7 min |
| Pure-node unit suites | 1 | 9.9 min | 9.9 min | 9.9 min |
| Renderer specs on a real GPU (macos-latest, Metal) 1/2 | 1 | 14.2 min | 14.2 min | 14.2 min |
| Renderer specs on a real GPU (macos-latest, Metal) 2/2 | 1 | 4.5 min | 4.5 min | 4.5 min |
| Select specs for this change | 60 | 0.4 min | 0.5 min | 0.8 min |
| Selected specs (change-aware gate) | 56 | 7.6 min | 8.9 min | 9.8 min |
| Selected specs (verdict) | 56 | 0.2 min | 0.2 min | 0.4 min |
| Smoke (page boots, __apex responds) | 1 | 15.1 min | 15.1 min | 15.1 min |
| Staged build boots (minified _site, as Pages ships it) | 1 | 3.8 min | 3.8 min | 3.8 min |
| Structural guards | 59 | 3.8 min | 4.3 min | 4.4 min |
| Workflow and shader lints | 59 | 0.5 min | 0.8 min | 1.3 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 5%; re-gated SHAs 14 (14 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=3, p50 5.3 min, p90 8.3 min.
- Full tier: n=54, p50 18.1 min, p90 41.3 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=19, p50 15.4 min, p90 28.3 min; superseded (cancelled) 22.
- DORA: deploy freq 25.7/day, lead time p50 15.4 min, change-fail 50%, MTTR p50 36.2 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 9.9 min (n=1) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 15.1 min, p90 15.1 min (n=1) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 7.6 min, p90 8.9 min (n=56) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 18.1 min, p90 41.3 min (n=54) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 15.4 min, p90 28.3 min (n=19) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 14 of 60 runs (23.3%), 14 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 5% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
