# Process dashboard

Generated 2026-11-26T14:34Z. ci.yml runs in the window: 60 (2026-11-25T21:02Z → 2026-11-26T14:22Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 36 | 0.2 min | 0.3 min | 0.3 min | 4 | 0 |
| CI (draft fast tier) | 21 | 0.2 min | 0.3 min | 0.4 min | 0 | 0 |
| Driving model (characterization traces) | 24 | 0.7 min | 0.8 min | 1.0 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 16 | 2.5 min | 2.9 min | 3.3 min | 0 | 0 |
| Parts option-resolution census | 60 | 0.3 min | 0.8 min | 1.1 min | 0 | 0 |
| Per-circuit geometry sweeps | 48 | 0.1 min | 0.1 min | 0.1 min | 0 | 2 |
| Per-circuit geometry sweeps (1of4) | 17 | 5.4 min | 7.0 min | 7.1 min | 0 | 1 |
| Per-circuit geometry sweeps (2of4) | 17 | 6.8 min | 8.9 min | 9.0 min | 0 | 1 |
| Per-circuit geometry sweeps (3of4) | 16 | 8.6 min | 10.0 min | 10.4 min | 0 | 2 |
| Per-circuit geometry sweeps (4of4) | 17 | 8.0 min | 10.2 min | 10.4 min | 0 | 1 |
| Pure-node unit suites (page-a) | 32 | 2.8 min | 3.1 min | 3.2 min | 0 | 1 |
| Pure-node unit suites (page-b) | 26 | 1.2 min | 1.3 min | 1.6 min | 0 | 0 |
| Pure-node unit suites (slow) | 27 | 5.7 min | 6.1 min | 6.5 min | 0 | 1 |
| Pure-node unit suites (vm-a1) | 30 | 3.9 min | 4.1 min | 4.3 min | 1 | 2 |
| Pure-node unit suites (vm-a2) | 26 | 2.1 min | 2.3 min | 2.7 min | 0 | 1 |
| Pure-node unit suites (vm-b1) | 30 | 5.2 min | 5.6 min | 5.8 min | 0 | 2 |
| Pure-node unit suites (vm-b2) | 32 | 6.1 min | 6.6 min | 7.8 min | 0 | 2 |
| Select specs for this change | 60 | 0.5 min | 0.7 min | 1.5 min | 0 | 0 |
| Selected specs (verdict) | 57 | 0.1 min | 0.3 min | 0.3 min | 3 | 3 |
| Smoke (page boots, __apex responds) (1) | 37 | 3.5 min | 4.5 min | 4.8 min | 0 | 2 |
| Staged build boots (minified _site, as Pages ships it) | 37 | 3.4 min | 4.6 min | 4.9 min | 0 | 2 |
| Structural guards | 59 | 0.1 min | 0.1 min | 0.1 min | 1 | 1 |
| Structural guards (tooling A) | 59 | 3.8 min | 8.6 min | 10.8 min | 0 | 1 |
| Structural guards (tooling B) | 38 | 0.4 min | 5.6 min | 5.8 min | 0 | 1 |
| Structural guards (tooling C) | 59 | 3.9 min | 10.0 min | 10.4 min | 1 | 1 |
| Structural guards (tooling D) | 38 | 0.3 min | 5.1 min | 5.4 min | 0 | 1 |
| Workflow and shader lints | 60 | 0.5 min | 0.7 min | 0.8 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 36 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 21 | 0.2 min | 0.3 min | 0.4 min |
| Driving model (characterization traces) | 24 | 0.7 min | 0.8 min | 1.0 min |
| Emulated VR (IWER / xr-emulated) | 16 | 2.5 min | 2.9 min | 3.3 min |
| Parts option-resolution census | 60 | 0.3 min | 0.8 min | 1.1 min |
| Per-circuit geometry sweeps | 17 | 8.8 min | 10.4 min | 10.4 min |
| Pure-node unit suites | 34 | 6.1 min | 6.6 min | 7.8 min |
| Select specs for this change | 60 | 0.5 min | 0.7 min | 1.5 min |
| Selected specs (change-aware gate) | 38 | 9.4 min | 11.2 min | 11.7 min |
| Selected specs (verdict) | 57 | 0.1 min | 0.3 min | 0.3 min |
| Smoke (page boots, __apex responds) | 37 | 3.5 min | 4.5 min | 4.8 min |
| Staged build boots (minified _site, as Pages ships it) | 37 | 3.4 min | 4.6 min | 4.9 min |
| Structural guards | 59 | 5.3 min | 10.2 min | 10.8 min |
| Workflow and shader lints | 60 | 0.5 min | 0.7 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 5%; re-gated SHAs 15 (15 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=21, p50 11.8 min, p90 14.4 min.
- Full tier: n=36, p50 17.5 min, p90 32.0 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=52, p50 14.6 min, p90 26.6 min; superseded (cancelled) 7.
- DORA: deploy freq 72/day, lead time p50 14.6 min, change-fail 1.9%, MTTR p50 86.5 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 6.1 min (n=34) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.5 min, p90 4.5 min (n=37) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 9.4 min, p90 11.2 min (n=38) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 17.5 min, p90 32.0 min (n=36) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 14.6 min, p90 26.6 min (n=52) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 15 of 60 runs (25%), 15 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 5% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
