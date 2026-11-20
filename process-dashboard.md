# Process dashboard

Generated 2026-11-20T13:44Z. ci.yml runs in the window: 60 (2026-11-19T14:27Z → 2026-11-20T13:30Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 13 | 0.2 min | 0.3 min | 0.3 min | 4 | 0 |
| CI (draft fast tier) | 8 | 0.2 min | 0.3 min | 0.3 min | 1 | 0 |
| Driving model (characterization traces) | 31 | 2.4 min | 3.8 min | 3.9 min | 0 | 8 |
| Emulated VR (IWER / xr-emulated) | 8 | 2.5 min | 3.2 min | 3.2 min | 0 | 4 |
| Golden menus on a runner (nightly) | 1 | 1.8 min | 1.8 min | 1.8 min | 0 | 0 |
| Parts option-resolution census | 55 | 0.3 min | 2.2 min | 2.3 min | 0 | 4 |
| Per-circuit geometry sweeps | 33 | 0.1 min | 0.1 min | 0.1 min | 0 | 6 |
| Per-circuit geometry sweeps (1of4) | 12 | 4.2 min | 4.8 min | 5.0 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 12 | 5.4 min | 6.8 min | 7.0 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 12 | 5.9 min | 7.4 min | 7.5 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 12 | 5.5 min | 6.6 min | 7.3 min | 0 | 0 |
| Pure-node unit suites (page-a) | 19 | 1.0 min | 1.3 min | 1.4 min | 0 | 0 |
| Pure-node unit suites (page-b) | 17 | 1.3 min | 1.5 min | 1.5 min | 0 | 0 |
| Pure-node unit suites (slow) | 16 | 9.0 min | 10.0 min | 10.1 min | 1 | 2 |
| Pure-node unit suites (vm-a1) | 18 | 3.9 min | 4.9 min | 6.2 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 15 | 2.4 min | 2.9 min | 3.0 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 19 | 5.5 min | 7.0 min | 7.3 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 18 | 5.7 min | 7.7 min | 7.9 min | 1 | 1 |
| Renderer specs on a real GPU (macos-latest, Metal) | 8 | 20.5 min | 25.1 min | 25.1 min | 0 | 6 |
| Select specs for this change | 55 | 0.5 min | 0.7 min | 1.0 min | 0 | 4 |
| Selected specs (verdict) | 21 | 0.2 min | 0.2 min | 0.2 min | 5 | 38 |
| Smoke (page boots, __apex responds) (1) | 21 | 3.6 min | 4.8 min | 5.2 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 1 | 0.4 min | 0.4 min | 0.4 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 1 | 0.4 min | 0.4 min | 0.4 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 1 | 0.4 min | 0.4 min | 0.4 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 21 | 3.8 min | 5.0 min | 5.5 min | 0 | 0 |
| Structural guards | 45 | 0.1 min | 0.1 min | 0.1 min | 3 | 14 |
| Structural guards (tooling A) | 50 | 4.0 min | 5.3 min | 5.3 min | 3 | 9 |
| Structural guards (tooling B) | 51 | 3.2 min | 4.2 min | 4.6 min | 2 | 8 |
| Structural guards (tooling C) | 48 | 5.6 min | 7.5 min | 7.8 min | 2 | 11 |
| Structural guards (tooling D) | 49 | 3.4 min | 5.0 min | 5.4 min | 2 | 10 |
| Workflow and shader lints | 54 | 0.5 min | 0.8 min | 0.8 min | 0 | 5 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 13 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 8 | 0.2 min | 0.3 min | 0.3 min |
| Driving model (characterization traces) | 31 | 2.4 min | 3.8 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 8 | 2.5 min | 3.2 min | 3.2 min |
| Golden menus on a runner (nightly) | 1 | 1.8 min | 1.8 min | 1.8 min |
| Parts option-resolution census | 55 | 0.3 min | 2.2 min | 2.3 min |
| Per-circuit geometry sweeps | 12 | 6.8 min | 7.4 min | 7.5 min |
| Pure-node unit suites | 19 | 8.4 min | 10.0 min | 10.1 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 8 | 20.5 min | 25.1 min | 25.1 min |
| Select specs for this change | 55 | 0.5 min | 0.7 min | 1.0 min |
| Selected specs (change-aware gate) | 26 | 8.2 min | 12.1 min | 12.9 min |
| Selected specs (verdict) | 21 | 0.2 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 21 | 3.6 min | 4.8 min | 5.2 min |
| Staged build boots (minified _site, as Pages ships it) | 21 | 3.8 min | 5.0 min | 5.5 min |
| Structural guards | 51 | 5.4 min | 7.5 min | 7.8 min |
| Workflow and shader lints | 54 | 0.5 min | 0.8 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 65%; re-gated SHAs 3 (3 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=1, p50 6.3 min, p90 6.3 min.
- Full tier: n=20, p50 49.0 min, p90 105.7 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=38, p50 20.3 min, p90 42.2 min; superseded (cancelled) 14.
- DORA: deploy freq 39.6/day, lead time p50 20.3 min, change-fail 17.4%, MTTR p50 47.1 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 8.4 min (n=19) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.6 min, p90 4.8 min (n=21) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 8.2 min, p90 12.1 min (n=26) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 49.0 min, p90 105.7 min (n=20) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 20.3 min, p90 42.2 min (n=38) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 3 of 60 runs (5%), 3 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 65% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
