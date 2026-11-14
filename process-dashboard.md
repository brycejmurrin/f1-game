# Process dashboard

Generated 2026-11-14T11:51Z. ci.yml runs in the window: 60 (2026-11-11T20:11Z → 2026-11-14T11:44Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 31 | 0.2 min | 0.3 min | 0.3 min | 8 | 0 |
| CI (draft fast tier) | 22 | 0.2 min | 0.2 min | 0.3 min | 3 | 1 |
| Driving model (characterization traces) | 39 | 2.5 min | 3.9 min | 4.4 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 8 | 2.4 min | 3.2 min | 3.2 min | 0 | 0 |
| Golden menus on a runner (nightly) | 1 | 1.4 min | 1.4 min | 1.4 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 1.7 min | 2.4 min | 0 | 0 |
| Per-circuit geometry sweeps | 59 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Per-circuit geometry sweeps (1of4) | 13 | 3.3 min | 5.6 min | 5.6 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 13 | 5.1 min | 6.6 min | 6.6 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 13 | 5.3 min | 6.8 min | 6.9 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 13 | 6.0 min | 7.8 min | 7.8 min | 0 | 0 |
| Pure-node unit suites (page-a) | 29 | 1.1 min | 1.3 min | 1.4 min | 0 | 0 |
| Pure-node unit suites (page-b) | 26 | 1.2 min | 1.5 min | 1.6 min | 0 | 0 |
| Pure-node unit suites (slow) | 29 | 8.3 min | 10.1 min | 10.5 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 29 | 3.8 min | 4.6 min | 4.8 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 25 | 2.3 min | 3.0 min | 3.1 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 29 | 6.7 min | 7.5 min | 7.7 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 29 | 4.6 min | 6.3 min | 6.5 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 9 | 20.8 min | 23.7 min | 23.7 min | 0 | 0 |
| Select specs for this change | 60 | 0.5 min | 0.7 min | 1.4 min | 0 | 0 |
| Selected specs (verdict) | 53 | 0.2 min | 0.3 min | 0.4 min | 8 | 6 |
| Smoke (page boots, __apex responds) (1) | 31 | 3.7 min | 5.0 min | 5.5 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 1 | 0.4 min | 0.4 min | 0.4 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 1 | 0.8 min | 0.8 min | 0.8 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 1 | 0.5 min | 0.5 min | 0.5 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 31 | 4.0 min | 5.2 min | 5.5 min | 0 | 0 |
| Structural guards | 60 | 0.1 min | 0.1 min | 0.1 min | 5 | 0 |
| Structural guards (tooling A) | 60 | 4.3 min | 5.7 min | 6.5 min | 1 | 0 |
| Structural guards (tooling B) | 60 | 2.7 min | 3.8 min | 4.3 min | 0 | 0 |
| Structural guards (tooling C) | 60 | 4.2 min | 5.7 min | 6.4 min | 0 | 0 |
| Structural guards (tooling D) | 60 | 3.7 min | 5.4 min | 5.8 min | 4 | 0 |
| Workflow and shader lints | 60 | 0.5 min | 0.6 min | 0.8 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 31 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 22 | 0.2 min | 0.2 min | 0.3 min |
| Driving model (characterization traces) | 39 | 2.5 min | 3.9 min | 4.4 min |
| Emulated VR (IWER / xr-emulated) | 8 | 2.4 min | 3.2 min | 3.2 min |
| Golden menus on a runner (nightly) | 1 | 1.4 min | 1.4 min | 1.4 min |
| Parts option-resolution census | 60 | 0.3 min | 1.7 min | 2.4 min |
| Per-circuit geometry sweeps | 13 | 6.7 min | 7.8 min | 7.8 min |
| Pure-node unit suites | 29 | 8.3 min | 10.1 min | 10.5 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 9 | 20.8 min | 23.7 min | 23.7 min |
| Select specs for this change | 60 | 0.5 min | 0.7 min | 1.4 min |
| Selected specs (change-aware gate) | 56 | 6.0 min | 11.6 min | 12.3 min |
| Selected specs (verdict) | 53 | 0.2 min | 0.3 min | 0.4 min |
| Smoke (page boots, __apex responds) | 31 | 3.7 min | 5.0 min | 5.5 min |
| Staged build boots (minified _site, as Pages ships it) | 31 | 4.0 min | 5.2 min | 5.5 min |
| Structural guards | 60 | 5.4 min | 5.8 min | 6.5 min |
| Workflow and shader lints | 60 | 0.5 min | 0.6 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 11.7%; re-gated SHAs 9 (9 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=0, p50 n/a, p90 n/a.
- Full tier: n=53, p50 30.3 min, p90 88.8 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=30, p50 27.4 min, p90 44.6 min; superseded (cancelled) 24.
- DORA: deploy freq 11.3/day, lead time p50 27.4 min, change-fail 16.7%, MTTR p50 29.1 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 8.3 min (n=29) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.7 min, p90 5.0 min (n=31) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 6.0 min, p90 11.6 min (n=56) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 30.3 min, p90 88.8 min (n=53) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 27.4 min, p90 44.6 min (n=30) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 9 of 60 runs (15%), 9 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 11.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
