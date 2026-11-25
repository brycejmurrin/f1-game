# Process dashboard

Generated 2026-11-25T15:04Z. ci.yml runs in the window: 60 (2026-11-25T03:27Z → 2026-11-25T15:03Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 24 | 0.2 min | 0.4 min | 0.5 min | 4 | 0 |
| CI (draft fast tier) | 36 | 0.2 min | 0.3 min | 0.5 min | 2 | 0 |
| Driving model (characterization traces) | 9 | 0.6 min | 0.8 min | 0.8 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 2 | 2.4 min | 3.0 min | 3.0 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 1.0 min | 1.1 min | 0 | 0 |
| Per-circuit geometry sweeps | 54 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Per-circuit geometry sweeps (1of4) | 8 | 6.7 min | 7.4 min | 7.4 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 8 | 5.5 min | 8.2 min | 8.2 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 8 | 7.7 min | 8.8 min | 8.8 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 8 | 6.1 min | 9.5 min | 9.5 min | 0 | 0 |
| Pure-node unit suites (page-a) | 16 | 2.8 min | 3.0 min | 3.1 min | 0 | 0 |
| Pure-node unit suites (page-b) | 12 | 1.3 min | 1.4 min | 1.5 min | 0 | 0 |
| Pure-node unit suites (slow) | 15 | 6.0 min | 6.6 min | 7.6 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 14 | 3.9 min | 4.1 min | 4.2 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 10 | 2.1 min | 2.3 min | 2.3 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 16 | 5.7 min | 6.4 min | 6.5 min | 2 | 0 |
| Pure-node unit suites (vm-b2) | 16 | 5.7 min | 6.5 min | 6.6 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 20.0 min | 20.6 min | 20.6 min | 0 | 0 |
| Select specs for this change | 60 | 0.5 min | 0.7 min | 1.1 min | 0 | 0 |
| Selected specs (verdict) | 60 | 0.1 min | 0.2 min | 0.3 min | 3 | 0 |
| Smoke (page boots, __apex responds) (1) | 23 | 3.2 min | 4.2 min | 4.5 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 23 | 3.7 min | 4.7 min | 4.8 min | 0 | 0 |
| Structural guards | 60 | 0.1 min | 0.1 min | 0.1 min | 2 | 0 |
| Structural guards (tooling A) | 60 | 5.9 min | 10.5 min | 10.9 min | 0 | 0 |
| Structural guards (tooling B) | 24 | 0.3 min | 5.0 min | 6.0 min | 0 | 0 |
| Structural guards (tooling C) | 60 | 6.2 min | 10.4 min | 11.2 min | 2 | 0 |
| Structural guards (tooling D) | 24 | 0.4 min | 5.6 min | 6.3 min | 0 | 0 |
| Workflow and shader lints | 60 | 0.5 min | 0.7 min | 1.0 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 24 | 0.2 min | 0.4 min | 0.5 min |
| CI (draft fast tier) | 36 | 0.2 min | 0.3 min | 0.5 min |
| Driving model (characterization traces) | 9 | 0.6 min | 0.8 min | 0.8 min |
| Emulated VR (IWER / xr-emulated) | 2 | 2.4 min | 3.0 min | 3.0 min |
| Parts option-resolution census | 60 | 0.3 min | 1.0 min | 1.1 min |
| Per-circuit geometry sweeps | 8 | 7.7 min | 9.5 min | 9.5 min |
| Pure-node unit suites | 18 | 6.3 min | 6.6 min | 7.6 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 20.0 min | 20.6 min | 20.6 min |
| Select specs for this change | 60 | 0.5 min | 0.7 min | 1.1 min |
| Selected specs (change-aware gate) | 23 | 7.3 min | 10.4 min | 10.8 min |
| Selected specs (verdict) | 60 | 0.1 min | 0.2 min | 0.3 min |
| Smoke (page boots, __apex responds) | 23 | 3.2 min | 4.2 min | 4.5 min |
| Staged build boots (minified _site, as Pages ships it) | 23 | 3.7 min | 4.7 min | 4.8 min |
| Structural guards | 60 | 6.3 min | 10.7 min | 11.2 min |
| Workflow and shader lints | 60 | 0.5 min | 0.7 min | 1.0 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 0%; re-gated SHAs 13 (13 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=37, p50 11.2 min, p90 14.1 min.
- Full tier: n=23, p50 9.8 min, p90 37.3 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=28, p50 22.1 min, p90 43.3 min; superseded (cancelled) 28.
- DORA: deploy freq 57.9/day, lead time p50 22.1 min, change-fail 12.5%, MTTR p50 n/a.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 6.3 min (n=18) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.2 min, p90 4.2 min (n=23) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 7.3 min, p90 10.4 min (n=23) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 9.8 min, p90 37.3 min (n=23) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 22.1 min, p90 43.3 min (n=28) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 13 of 60 runs (21.7%), 13 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 0% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
