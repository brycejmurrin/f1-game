# Process dashboard

Generated 2026-11-13T12:44Z. ci.yml runs in the window: 60 (2026-11-11T12:55Z → 2026-11-13T12:27Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 44 | 0.2 min | 0.3 min | 0.4 min | 13 | 0 |
| CI (draft fast tier) | 9 | 0.2 min | 0.3 min | 0.3 min | 1 | 0 |
| Driving model (characterization traces) | 34 | 2.4 min | 3.8 min | 3.9 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 8 | 2.0 min | 3.1 min | 3.1 min | 0 | 0 |
| Golden menus on a runner (nightly) | 2 | 1.7 min | 1.9 min | 1.9 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 1.8 min | 2.4 min | 0 | 0 |
| Per-circuit geometry sweeps | 52 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Per-circuit geometry sweeps (1of4) | 21 | 4.3 min | 5.5 min | 5.7 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 21 | 5.1 min | 6.3 min | 6.6 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 21 | 5.6 min | 6.9 min | 7.3 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 21 | 5.5 min | 7.8 min | 7.9 min | 0 | 0 |
| Pure-node unit suites (page-a) | 39 | 1.2 min | 1.3 min | 1.4 min | 0 | 0 |
| Pure-node unit suites (page-b) | 34 | 1.3 min | 1.5 min | 1.7 min | 0 | 0 |
| Pure-node unit suites (slow) | 36 | 9.8 min | 10.1 min | 10.2 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 36 | 3.6 min | 4.2 min | 4.3 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 36 | 2.1 min | 2.8 min | 3.4 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 36 | 6.6 min | 7.5 min | 7.8 min | 1 | 0 |
| Pure-node unit suites (vm-b2) | 38 | 5.8 min | 6.3 min | 6.5 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 16 | 19.1 min | 23.1 min | 23.5 min | 0 | 0 |
| Select specs for this change | 60 | 0.5 min | 0.6 min | 0.9 min | 0 | 0 |
| Selected specs (verdict) | 51 | 0.2 min | 0.2 min | 0.3 min | 7 | 7 |
| Smoke (page boots, __apex responds) (1) | 45 | 3.9 min | 4.9 min | 10.9 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 2 | 0.5 min | 1.1 min | 1.1 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 2 | 0.6 min | 1.2 min | 1.2 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 2 | 0.8 min | 0.8 min | 0.8 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 45 | 4.0 min | 5.2 min | 5.8 min | 0 | 0 |
| Structural guards | 60 | 0.1 min | 0.1 min | 0.4 min | 6 | 0 |
| Structural guards (tooling A) | 60 | 4.3 min | 5.9 min | 6.3 min | 0 | 0 |
| Structural guards (tooling B) | 60 | 3.6 min | 4.6 min | 4.8 min | 0 | 0 |
| Structural guards (tooling C) | 60 | 4.1 min | 5.3 min | 6.0 min | 1 | 0 |
| Structural guards (tooling D) | 60 | 3.7 min | 4.7 min | 4.8 min | 5 | 0 |
| Workflow and shader lints | 60 | 0.5 min | 0.6 min | 0.9 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 44 | 0.2 min | 0.3 min | 0.4 min |
| CI (draft fast tier) | 9 | 0.2 min | 0.3 min | 0.3 min |
| Driving model (characterization traces) | 34 | 2.4 min | 3.8 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 8 | 2.0 min | 3.1 min | 3.1 min |
| Golden menus on a runner (nightly) | 2 | 1.7 min | 1.9 min | 1.9 min |
| Parts option-resolution census | 60 | 0.3 min | 1.8 min | 2.4 min |
| Per-circuit geometry sweeps | 21 | 6.6 min | 7.8 min | 7.9 min |
| Pure-node unit suites | 39 | 9.7 min | 10.1 min | 10.2 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 16 | 19.1 min | 23.1 min | 23.5 min |
| Select specs for this change | 60 | 0.5 min | 0.6 min | 0.9 min |
| Selected specs (change-aware gate) | 57 | 10.4 min | 12.4 min | 13.1 min |
| Selected specs (verdict) | 51 | 0.2 min | 0.2 min | 0.3 min |
| Smoke (page boots, __apex responds) | 45 | 3.9 min | 4.9 min | 10.9 min |
| Staged build boots (minified _site, as Pages ships it) | 45 | 4.0 min | 5.2 min | 5.8 min |
| Structural guards | 60 | 5.3 min | 6.0 min | 6.3 min |
| Workflow and shader lints | 60 | 0.5 min | 0.6 min | 0.9 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 11.7%; re-gated SHAs 9 (9 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=0, p50 n/a, p90 n/a.
- Full tier: n=53, p50 37.6 min, p90 98.8 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=25, p50 28.9 min, p90 49.5 min; superseded (cancelled) 29.
- DORA: deploy freq 12.6/day, lead time p50 28.9 min, change-fail 19.4%, MTTR p50 29.1 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 9.7 min (n=39) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.9 min, p90 4.9 min (n=45) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 10.4 min, p90 12.4 min (n=57) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 37.6 min, p90 98.8 min (n=53) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 28.9 min, p90 49.5 min (n=25) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 9 of 60 runs (15%), 9 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 11.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
