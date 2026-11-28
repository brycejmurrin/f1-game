# Process dashboard

Generated 2026-11-28T13:44Z. ci.yml runs in the window: 60 (2026-11-27T08:18Z → 2026-11-28T13:30Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 38 | 0.2 min | 0.3 min | 0.3 min | 12 | 0 |
| CI (draft fast tier) | 21 | 0.2 min | 0.3 min | 0.4 min | 0 | 0 |
| Driving model (characterization traces) | 23 | 0.7 min | 0.9 min | 0.9 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 19 | 2.3 min | 3.3 min | 3.5 min | 0 | 1 |
| Golden menus on a runner (nightly) | 3 | 1.5 min | 1.6 min | 1.6 min | 0 | 0 |
| Parts option-resolution census | 59 | 0.3 min | 0.7 min | 1.1 min | 0 | 1 |
| Per-circuit geometry sweeps | 51 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 24 | 6.7 min | 8.5 min | 8.6 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 24 | 9.3 min | 12.2 min | 12.4 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 24 | 6.0 min | 8.6 min | 8.8 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 24 | 7.6 min | 9.7 min | 9.8 min | 0 | 0 |
| Pure-node unit suites (page-a) | 37 | 2.7 min | 3.0 min | 3.5 min | 0 | 0 |
| Pure-node unit suites (page-b) | 28 | 1.1 min | 1.2 min | 1.5 min | 0 | 0 |
| Pure-node unit suites (slow) | 26 | 5.8 min | 6.6 min | 8.2 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 30 | 3.9 min | 4.1 min | 5.0 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 28 | 2.1 min | 2.3 min | 3.1 min | 1 | 0 |
| Pure-node unit suites (vm-b1) | 29 | 5.4 min | 6.5 min | 7.3 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 30 | 8.5 min | 8.8 min | 12.2 min | 1 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 18 | 21.5 min | 26.4 min | 26.4 min | 1 | 1 |
| Select specs for this change | 59 | 0.5 min | 0.8 min | 1.4 min | 0 | 1 |
| Selected specs (verdict) | 59 | 0.1 min | 0.2 min | 0.5 min | 8 | 1 |
| Smoke (page boots, __apex responds) (1) | 38 | 3.6 min | 4.8 min | 22.6 min | 1 | 0 |
| Smoke (page boots, __apex responds) (2) | 3 | 6.8 min | 8.6 min | 8.6 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 3 | 6.7 min | 6.8 min | 6.8 min | 1 | 0 |
| Smoke (page boots, __apex responds) (4) | 3 | 7.1 min | 8.9 min | 8.9 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 38 | 3.3 min | 4.8 min | 5.1 min | 0 | 1 |
| Structural guards | 59 | 0.1 min | 0.1 min | 0.1 min | 2 | 1 |
| Structural guards (tooling A) | 59 | 4.9 min | 10.0 min | 11.7 min | 1 | 1 |
| Structural guards (tooling B) | 38 | 0.4 min | 5.0 min | 6.8 min | 1 | 1 |
| Structural guards (tooling C) | 59 | 4.8 min | 10.4 min | 10.9 min | 0 | 1 |
| Structural guards (tooling D) | 38 | 0.4 min | 5.3 min | 5.5 min | 0 | 1 |
| Workflow and shader lints | 59 | 0.5 min | 0.7 min | 0.7 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 38 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 21 | 0.2 min | 0.3 min | 0.4 min |
| Driving model (characterization traces) | 23 | 0.7 min | 0.9 min | 0.9 min |
| Emulated VR (IWER / xr-emulated) | 19 | 2.3 min | 3.3 min | 3.5 min |
| Golden menus on a runner (nightly) | 3 | 1.5 min | 1.6 min | 1.6 min |
| Parts option-resolution census | 59 | 0.3 min | 0.7 min | 1.1 min |
| Per-circuit geometry sweeps | 24 | 9.7 min | 12.2 min | 12.4 min |
| Pure-node unit suites | 37 | 8.3 min | 8.8 min | 12.2 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 18 | 21.5 min | 26.4 min | 26.4 min |
| Select specs for this change | 59 | 0.5 min | 0.8 min | 1.4 min |
| Selected specs (change-aware gate) | 35 | 9.6 min | 10.6 min | 11.3 min |
| Selected specs (verdict) | 59 | 0.1 min | 0.2 min | 0.5 min |
| Smoke (page boots, __apex responds) | 38 | 3.6 min | 4.8 min | 22.6 min |
| Staged build boots (minified _site, as Pages ships it) | 38 | 3.3 min | 4.8 min | 5.1 min |
| Structural guards | 59 | 5.5 min | 10.6 min | 11.7 min |
| Workflow and shader lints | 59 | 0.5 min | 0.7 min | 0.7 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 1.7%; re-gated SHAs 13 (14 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=21, p50 11.6 min, p90 21.6 min.
- Full tier: n=38, p50 25.6 min, p90 48.6 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=53, p50 10.6 min, p90 31.3 min; superseded (cancelled) 7.
- DORA: deploy freq 43.6/day, lead time p50 10.6 min, change-fail 0%, MTTR p50 n/a.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 8.3 min (n=37) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.6 min, p90 4.8 min (n=38) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 9.6 min, p90 10.6 min (n=35) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 25.6 min, p90 48.6 min (n=38) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 10.6 min, p90 31.3 min (n=53) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 14 of 60 runs (23.3%), 13 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 1.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
