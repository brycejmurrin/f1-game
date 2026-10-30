# Process dashboard

Generated 2026-10-30T11:04Z. ci.yml runs in the window: 60 (2026-10-29T06:07Z → 2026-10-30T11:03Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 7 | 0.2 min | 0.3 min | 0.3 min | 0 | 0 |
| CI (draft fast tier) | 6 | 0.2 min | 0.3 min | 0.3 min | 3 | 0 |
| CI edit event (ignored) | 22 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| CI label event (ignored) | 14 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Driving model (characterization traces) | 5 | 2.4 min | 4.0 min | 4.0 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 2 | 3.0 min | 3.6 min | 3.6 min | 0 | 0 |
| Parts option-resolution census | 18 | 0.2 min | 2.1 min | 2.5 min | 0 | 1 |
| Per-circuit geometry sweeps | 16 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 2 | 0.3 min | 6.5 min | 6.5 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 2 | 0.8 min | 4.2 min | 4.2 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 2 | 0.3 min | 5.2 min | 5.2 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 2 | 0.4 min | 6.6 min | 6.6 min | 0 | 0 |
| Pure-node unit suites (page-a) | 2 | 5.1 min | 6.3 min | 6.3 min | 0 | 0 |
| Pure-node unit suites (page-b) | 2 | 2.0 min | 3.4 min | 3.4 min | 0 | 0 |
| Pure-node unit suites (slow) | 3 | 10.0 min | 10.3 min | 10.3 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 4 | 2.7 min | 4.9 min | 4.9 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 2 | 2.1 min | 3.2 min | 3.2 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 4 | 8.3 min | 11.3 min | 11.3 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 4 | 9.5 min | 9.9 min | 9.9 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 1 | 17.4 min | 17.4 min | 17.4 min | 0 | 0 |
| Select specs for this change | 19 | 0.5 min | 0.6 min | 0.7 min | 0 | 0 |
| Selected specs (verdict) | 13 | 0.1 min | 0.2 min | 0.2 min | 0 | 6 |
| Smoke (page boots, __apex responds) (1) | 7 | 3.3 min | 3.6 min | 3.6 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 7 | 3.3 min | 3.8 min | 3.8 min | 0 | 0 |
| Structural guards | 14 | 0.1 min | 0.1 min | 0.1 min | 4 | 5 |
| Structural guards (tooling A) | 15 | 3.5 min | 4.8 min | 4.9 min | 1 | 4 |
| Structural guards (tooling B) | 14 | 3.0 min | 4.5 min | 4.6 min | 0 | 5 |
| Structural guards (tooling C) | 16 | 3.5 min | 4.6 min | 4.8 min | 1 | 3 |
| Structural guards (tooling D) | 16 | 3.8 min | 5.1 min | 5.1 min | 5 | 3 |
| Workflow and shader lints | 18 | 0.5 min | 0.7 min | 0.7 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 7 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 6 | 0.2 min | 0.3 min | 0.3 min |
| CI edit event (ignored) | 22 | 0.1 min | 0.1 min | 0.1 min |
| CI label event (ignored) | 14 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 5 | 2.4 min | 4.0 min | 4.0 min |
| Emulated VR (IWER / xr-emulated) | 2 | 3.0 min | 3.6 min | 3.6 min |
| Parts option-resolution census | 18 | 0.2 min | 2.1 min | 2.5 min |
| Per-circuit geometry sweeps | 2 | 0.8 min | 6.6 min | 6.6 min |
| Pure-node unit suites | 5 | 10.0 min | 11.3 min | 11.3 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 1 | 17.4 min | 17.4 min | 17.4 min |
| Select specs for this change | 19 | 0.5 min | 0.6 min | 0.7 min |
| Selected specs (change-aware gate) | 4 | 7.1 min | 8.3 min | 8.3 min |
| Selected specs (verdict) | 13 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 7 | 3.3 min | 3.6 min | 3.6 min |
| Staged build boots (minified _site, as Pages ships it) | 7 | 3.3 min | 3.8 min | 3.8 min |
| Structural guards | 16 | 4.6 min | 5.1 min | 5.1 min |
| Workflow and shader lints | 18 | 0.5 min | 0.7 min | 0.7 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 18.3%; re-gated SHAs 19 (32 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=6, p50 9.6 min, p90 12.8 min.
- Full tier: n=7, p50 15.1 min, p90 22.7 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=37, p50 17.4 min, p90 31.5 min; superseded (cancelled) 21.
- DORA: deploy freq 30.7/day, lead time p50 17.4 min, change-fail 5.1%, MTTR p50 23.7 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 10.0 min (n=5) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.3 min, p90 3.6 min (n=7) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 7.1 min, p90 8.3 min (n=4) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 15.1 min, p90 22.7 min (n=7) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 17.4 min, p90 31.5 min (n=37) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 32 of 60 runs (53.3%), 19 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 18.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
