# Process dashboard

Generated 2026-11-06T12:34Z. ci.yml runs in the window: 60 (2026-11-04T20:47Z → 2026-11-06T09:58Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 33 | 0.2 min | 0.2 min | 0.3 min | 3 | 0 |
| CI (draft fast tier) | 26 | 0.2 min | 0.3 min | 0.5 min | 7 | 0 |
| Driving model (characterization traces) | 17 | 3.5 min | 3.9 min | 3.9 min | 0 | 0 |
| Golden menus on a runner (trial, non-blocking) | 1 | 1.4 min | 1.4 min | 1.4 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 0.4 min | 2.2 min | 0 | 0 |
| Per-circuit geometry sweeps | 51 | 0.1 min | 0.1 min | 0.1 min | 1 | 0 |
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
| Select specs for this change | 60 | 0.5 min | 0.6 min | 1.0 min | 0 | 0 |
| Selected specs (verdict) | 58 | 0.2 min | 0.2 min | 3.2 min | 7 | 1 |
| Smoke (page boots, __apex responds) (1) | 1 | 10.8 min | 10.8 min | 10.8 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 1 | 15.1 min | 15.1 min | 15.1 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 1 | 12.3 min | 12.3 min | 12.3 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 1 | 4.6 min | 4.6 min | 4.6 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 1 | 3.8 min | 3.8 min | 3.8 min | 0 | 0 |
| Structural guards | 59 | 0.1 min | 0.1 min | 0.9 min | 2 | 1 |
| Structural guards (tooling A) | 59 | 3.0 min | 4.1 min | 4.2 min | 0 | 1 |
| Structural guards (tooling B) | 60 | 2.5 min | 3.2 min | 3.3 min | 2 | 0 |
| Structural guards (tooling C) | 59 | 3.2 min | 4.4 min | 4.6 min | 0 | 1 |
| Structural guards (tooling D) | 60 | 2.4 min | 3.6 min | 3.8 min | 1 | 0 |
| Workflow and shader lints | 59 | 0.5 min | 0.9 min | 4.8 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 33 | 0.2 min | 0.2 min | 0.3 min |
| CI (draft fast tier) | 26 | 0.2 min | 0.3 min | 0.5 min |
| Driving model (characterization traces) | 17 | 3.5 min | 3.9 min | 3.9 min |
| Golden menus on a runner (trial, non-blocking) | 1 | 1.4 min | 1.4 min | 1.4 min |
| Parts option-resolution census | 60 | 0.3 min | 0.4 min | 2.2 min |
| Per-circuit geometry sweeps | 1 | 5.7 min | 5.7 min | 5.7 min |
| Pure-node unit suites | 1 | 9.9 min | 9.9 min | 9.9 min |
| Renderer specs on a real GPU (macos-latest, Metal) 1/2 | 1 | 14.2 min | 14.2 min | 14.2 min |
| Renderer specs on a real GPU (macos-latest, Metal) 2/2 | 1 | 4.5 min | 4.5 min | 4.5 min |
| Select specs for this change | 60 | 0.5 min | 0.6 min | 1.0 min |
| Selected specs (change-aware gate) | 52 | 7.6 min | 8.9 min | 9.4 min |
| Selected specs (verdict) | 58 | 0.2 min | 0.2 min | 3.2 min |
| Smoke (page boots, __apex responds) | 1 | 15.1 min | 15.1 min | 15.1 min |
| Staged build boots (minified _site, as Pages ships it) | 1 | 3.8 min | 3.8 min | 3.8 min |
| Structural guards | 60 | 3.9 min | 4.4 min | 4.6 min |
| Workflow and shader lints | 59 | 0.5 min | 0.9 min | 4.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 1.7%; re-gated SHAs 15 (15 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=8, p50 4.6 min, p90 5.3 min.
- Full tier: n=51, p50 11.8 min, p90 24.9 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=30, p50 13.7 min, p90 26.6 min; superseded (cancelled) 16.
- DORA: deploy freq 19.4/day, lead time p50 13.7 min, change-fail 31.8%, MTTR p50 49.5 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 9.9 min (n=1) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 15.1 min, p90 15.1 min (n=1) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 7.6 min, p90 8.9 min (n=52) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 11.8 min, p90 24.9 min (n=51) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 13.7 min, p90 26.6 min (n=30) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 15 of 60 runs (25%), 15 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 1.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
