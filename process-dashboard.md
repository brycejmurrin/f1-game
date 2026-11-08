# Process dashboard

Generated 2026-11-08T11:37Z. ci.yml runs in the window: 60 (2026-11-05T03:30Z → 2026-11-08T06:42Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 19 | 0.2 min | 0.2 min | 0.2 min | 4 | 0 |
| CI (draft fast tier) | 35 | 0.2 min | 0.2 min | 0.4 min | 17 | 0 |
| Driving model (characterization traces) | 22 | 2.4 min | 3.8 min | 3.9 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 4 | 1.9 min | 2.8 min | 2.8 min | 0 | 1 |
| Golden menus on a runner (trial, non-blocking) | 3 | 2.0 min | 2.1 min | 2.1 min | 0 | 0 |
| Parts option-resolution census | 59 | 0.3 min | 1.6 min | 2.3 min | 0 | 1 |
| Per-circuit geometry sweeps | 52 | 0.1 min | 0.1 min | 0.1 min | 0 | 2 |
| Per-circuit geometry sweeps (1of4) | 7 | 5.5 min | 6.4 min | 6.4 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 7 | 6.6 min | 7.3 min | 7.3 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 7 | 6.2 min | 7.3 min | 7.3 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 6 | 6.2 min | 7.8 min | 7.8 min | 0 | 1 |
| Pure-node unit suites (page-a) | 12 | 3.5 min | 6.3 min | 6.3 min | 0 | 0 |
| Pure-node unit suites (page-b) | 12 | 2.0 min | 2.8 min | 3.5 min | 0 | 0 |
| Pure-node unit suites (slow) | 15 | 8.7 min | 10.1 min | 10.1 min | 0 | 1 |
| Pure-node unit suites (vm-a1) | 16 | 3.9 min | 5.0 min | 5.0 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 11 | 2.0 min | 3.5 min | 3.6 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 16 | 9.4 min | 10.9 min | 11.1 min | 2 | 0 |
| Pure-node unit suites (vm-b2) | 16 | 6.5 min | 10.9 min | 10.9 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 3 | 15.5 min | 18.3 min | 18.3 min | 0 | 1 |
| Renderer specs on a real GPU (macos-latest, Metal) 1/2 | 2 | 13.6 min | 13.9 min | 13.9 min | 0 | 1 |
| Renderer specs on a real GPU (macos-latest, Metal) 2/2 | 2 | 4.1 min | 8.8 min | 8.8 min | 0 | 1 |
| Select specs for this change | 59 | 0.5 min | 0.6 min | 0.8 min | 0 | 1 |
| Selected specs (verdict) | 51 | 0.1 min | 0.2 min | 0.3 min | 17 | 6 |
| Smoke (page boots, __apex responds) (1) | 17 | 2.9 min | 3.6 min | 3.6 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 3 | 1.4 min | 2.9 min | 2.9 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 3 | 2.4 min | 2.7 min | 2.7 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 3 | 2.0 min | 2.5 min | 2.5 min | 1 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 17 | 3.3 min | 4.0 min | 4.6 min | 0 | 1 |
| Structural guards | 58 | 0.1 min | 0.1 min | 0.1 min | 2 | 2 |
| Structural guards (tooling A) | 58 | 4.1 min | 5.3 min | 5.5 min | 0 | 2 |
| Structural guards (tooling B) | 59 | 2.5 min | 3.4 min | 3.5 min | 1 | 1 |
| Structural guards (tooling C) | 59 | 3.7 min | 4.9 min | 5.0 min | 0 | 1 |
| Structural guards (tooling D) | 59 | 3.3 min | 4.1 min | 4.3 min | 1 | 1 |
| Workflow and shader lints | 59 | 0.5 min | 0.8 min | 9.1 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 19 | 0.2 min | 0.2 min | 0.2 min |
| CI (draft fast tier) | 35 | 0.2 min | 0.2 min | 0.4 min |
| Driving model (characterization traces) | 22 | 2.4 min | 3.8 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 4 | 1.9 min | 2.8 min | 2.8 min |
| Golden menus on a runner (trial, non-blocking) | 3 | 2.0 min | 2.1 min | 2.1 min |
| Parts option-resolution census | 59 | 0.3 min | 1.6 min | 2.3 min |
| Per-circuit geometry sweeps | 7 | 7.1 min | 7.8 min | 7.8 min |
| Pure-node unit suites | 16 | 10.1 min | 10.9 min | 11.1 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 3 | 15.5 min | 18.3 min | 18.3 min |
| Renderer specs on a real GPU (macos-latest, Metal) 1/2 | 2 | 13.6 min | 13.9 min | 13.9 min |
| Renderer specs on a real GPU (macos-latest, Metal) 2/2 | 2 | 4.1 min | 8.8 min | 8.8 min |
| Select specs for this change | 59 | 0.5 min | 0.6 min | 0.8 min |
| Selected specs (change-aware gate) | 50 | 9.5 min | 12.1 min | 33.9 min |
| Selected specs (verdict) | 51 | 0.1 min | 0.2 min | 0.3 min |
| Smoke (page boots, __apex responds) | 17 | 2.9 min | 3.6 min | 3.6 min |
| Staged build boots (minified _site, as Pages ships it) | 17 | 3.3 min | 4.0 min | 4.6 min |
| Structural guards | 59 | 4.2 min | 5.3 min | 5.5 min |
| Workflow and shader lints | 59 | 0.5 min | 0.8 min | 9.1 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 10%; re-gated SHAs 11 (12 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=6, p50 4.7 min, p90 9.3 min.
- Full tier: n=48, p50 11.9 min, p90 19.8 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=36, p50 12.4 min, p90 19.3 min; superseded (cancelled) 10.
- DORA: deploy freq 11.5/day, lead time p50 12.4 min, change-fail 28%, MTTR p50 49.5 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 10.1 min (n=16) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 2.9 min, p90 3.6 min (n=17) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 9.5 min, p90 12.1 min (n=50) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 11.9 min, p90 19.8 min (n=48) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 12.4 min, p90 19.3 min (n=36) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 12 of 60 runs (20%), 11 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 10% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
