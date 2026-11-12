# Process dashboard

Generated 2026-11-12T13:24Z. ci.yml runs in the window: 60 (2026-11-11T05:22Z → 2026-11-12T13:15Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 40 | 0.2 min | 0.3 min | 0.4 min | 8 | 0 |
| CI (draft fast tier) | 9 | 0.2 min | 0.3 min | 0.3 min | 1 | 0 |
| Driving model (characterization traces) | 30 | 2.6 min | 3.8 min | 3.9 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 7 | 2.2 min | 3.1 min | 3.1 min | 0 | 1 |
| Golden menus on a runner (nightly) | 1 | 1.7 min | 1.7 min | 1.7 min | 0 | 0 |
| Parts option-resolution census | 59 | 0.3 min | 2.1 min | 2.4 min | 0 | 1 |
| Per-circuit geometry sweeps | 54 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 16 | 3.6 min | 5.4 min | 5.5 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 16 | 5.1 min | 6.4 min | 6.7 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 16 | 5.6 min | 6.7 min | 6.8 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 16 | 4.9 min | 7.8 min | 7.9 min | 0 | 0 |
| Pure-node unit suites (page-a) | 35 | 1.2 min | 1.5 min | 2.3 min | 0 | 0 |
| Pure-node unit suites (page-b) | 31 | 1.4 min | 1.8 min | 1.9 min | 0 | 0 |
| Pure-node unit suites (slow) | 28 | 9.7 min | 10.2 min | 10.7 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 31 | 3.7 min | 4.2 min | 4.3 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 29 | 2.1 min | 2.8 min | 2.8 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 30 | 5.5 min | 7.2 min | 7.5 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 31 | 5.8 min | 6.2 min | 6.4 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 15 | 19.2 min | 21.0 min | 22.1 min | 0 | 1 |
| Select specs for this change | 59 | 0.5 min | 0.6 min | 0.9 min | 0 | 1 |
| Selected specs (verdict) | 48 | 0.2 min | 0.3 min | 0.6 min | 8 | 11 |
| Smoke (page boots, __apex responds) (1) | 42 | 4.1 min | 4.7 min | 10.9 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 1 | 1.1 min | 1.1 min | 1.1 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 1 | 1.2 min | 1.2 min | 1.2 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 1 | 0.8 min | 0.8 min | 0.8 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 42 | 3.6 min | 4.8 min | 4.9 min | 0 | 0 |
| Structural guards | 59 | 0.1 min | 0.1 min | 0.4 min | 2 | 1 |
| Structural guards (tooling A) | 59 | 5.2 min | 6.0 min | 6.3 min | 0 | 1 |
| Structural guards (tooling B) | 59 | 3.3 min | 4.6 min | 4.8 min | 0 | 1 |
| Structural guards (tooling C) | 59 | 3.5 min | 4.6 min | 5.0 min | 2 | 1 |
| Structural guards (tooling D) | 59 | 3.5 min | 4.5 min | 4.7 min | 0 | 1 |
| Workflow and shader lints | 59 | 0.5 min | 1.5 min | 1.9 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 40 | 0.2 min | 0.3 min | 0.4 min |
| CI (draft fast tier) | 9 | 0.2 min | 0.3 min | 0.3 min |
| Driving model (characterization traces) | 30 | 2.6 min | 3.8 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 7 | 2.2 min | 3.1 min | 3.1 min |
| Golden menus on a runner (nightly) | 1 | 1.7 min | 1.7 min | 1.7 min |
| Parts option-resolution census | 59 | 0.3 min | 2.1 min | 2.4 min |
| Per-circuit geometry sweeps | 16 | 6.0 min | 7.8 min | 7.9 min |
| Pure-node unit suites | 35 | 8.3 min | 10.1 min | 10.7 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 15 | 19.2 min | 21.0 min | 22.1 min |
| Select specs for this change | 59 | 0.5 min | 0.6 min | 0.9 min |
| Selected specs (change-aware gate) | 54 | 11.5 min | 13.6 min | 25.8 min |
| Selected specs (verdict) | 48 | 0.2 min | 0.3 min | 0.6 min |
| Smoke (page boots, __apex responds) | 42 | 4.1 min | 4.7 min | 10.9 min |
| Staged build boots (minified _site, as Pages ships it) | 42 | 3.6 min | 4.8 min | 4.9 min |
| Structural guards | 59 | 5.2 min | 6.0 min | 6.3 min |
| Workflow and shader lints | 59 | 0.5 min | 1.5 min | 1.9 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 23.3%; re-gated SHAs 8 (8 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=0, p50 n/a, p90 n/a.
- Full tier: n=46, p50 99.5 min, p90 193.0 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=26, p50 29.7 min, p90 49.9 min; superseded (cancelled) 30.
- DORA: deploy freq 19.6/day, lead time p50 29.7 min, change-fail 13.3%, MTTR p50 44.2 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 8.3 min (n=35) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 4.1 min, p90 4.7 min (n=42) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 11.5 min, p90 13.6 min (n=54) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 99.5 min, p90 193.0 min (n=46) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 29.7 min, p90 49.9 min (n=26) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 8 of 60 runs (13.3%), 8 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 23.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
