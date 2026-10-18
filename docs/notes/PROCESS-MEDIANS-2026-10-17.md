# Process dashboard

Generated 2026-10-17T20:50Z. ci.yml runs in the window: 60 (2026-10-17T09:28Z → 2026-10-17T20:45Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 23 | 0.2 min | 0.2 min | 0.2 min | 2 | 0 |
| CI (draft fast tier) | 15 | 0.1 min | 0.2 min | 0.2 min | 2 | 0 |
| Draft push (CI skipped — add run-ci label) | 16 | 0.1 min | 0.1 min | 0.1 min | 0 | 2 |
| Driving model (characterization traces) | 13 | 3.0 min | 3.2 min | 3.3 min | 0 | 1 |
| Emulated VR (IWER / xr-emulated) | 7 | 2.4 min | 2.6 min | 2.6 min | 0 | 1 |
| Parts option-resolution census | 41 | 0.2 min | 0.3 min | 2.3 min | 0 | 1 |
| Per-circuit geometry sweeps | 33 | 0.1 min | 0.1 min | 0.1 min | 2 | 1 |
| Per-circuit geometry sweeps (1of4) | 11 | 8.7 min | 8.9 min | 9.0 min | 2 | 0 |
| Per-circuit geometry sweeps (2of4) | 11 | 5.6 min | 7.0 min | 7.1 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 11 | 5.6 min | 5.8 min | 6.1 min | 2 | 0 |
| Per-circuit geometry sweeps (4of4) | 11 | 6.1 min | 6.2 min | 6.4 min | 2 | 0 |
| Pure-node unit suites (page-a) | 10 | 2.1 min | 2.7 min | 2.8 min | 0 | 0 |
| Pure-node unit suites (page-b) | 10 | 6.6 min | 6.9 min | 6.9 min | 0 | 0 |
| Pure-node unit suites (slow) | 8 | 3.5 min | 3.8 min | 3.8 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 13 | 3.8 min | 4.3 min | 4.4 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 13 | 3.7 min | 5.0 min | 5.2 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 11 | 8.7 min | 8.8 min | 8.8 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 11 | 5.4 min | 7.3 min | 7.3 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 3 | 15.6 min | 15.9 min | 15.9 min | 0 | 1 |
| Select specs for this change | 41 | 0.4 min | 0.5 min | 0.6 min | 0 | 1 |
| Selected specs (verdict) | 38 | 0.1 min | 0.2 min | 0.2 min | 0 | 4 |
| Smoke (page boots, __apex responds) (1) | 25 | 2.8 min | 3.0 min | 3.3 min | 0 | 0 |
| Structural guards | 39 | 0.1 min | 0.1 min | 0.1 min | 2 | 3 |
| Structural guards (tooling A) | 39 | 6.6 min | 8.3 min | 9.2 min | 1 | 3 |
| Structural guards (tooling B) | 39 | 6.5 min | 8.3 min | 9.5 min | 1 | 3 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 23 | 0.2 min | 0.2 min | 0.2 min |
| CI (draft fast tier) | 15 | 0.1 min | 0.2 min | 0.2 min |
| Draft push (CI skipped — add run-ci label) | 16 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 13 | 3.0 min | 3.2 min | 3.3 min |
| Emulated VR (IWER / xr-emulated) | 7 | 2.4 min | 2.6 min | 2.6 min |
| Parts option-resolution census | 41 | 0.2 min | 0.3 min | 2.3 min |
| Per-circuit geometry sweeps | 11 | 8.7 min | 8.9 min | 9.0 min |
| Pure-node unit suites | 13 | 8.6 min | 8.8 min | 8.8 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 3 | 15.6 min | 15.9 min | 15.9 min |
| Select specs for this change | 41 | 0.4 min | 0.5 min | 0.6 min |
| Selected specs (change-aware gate) | 12 | 8.1 min | 8.6 min | 8.7 min |
| Selected specs (verdict) | 38 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 25 | 2.8 min | 3.0 min | 3.3 min |
| Structural guards | 39 | 7.6 min | 8.7 min | 9.5 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 10%; re-gated SHAs 10 (11 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=15, p50 8.4 min, p90 11.7 min.
- Full tier: n=23, p50 13.4 min, p90 16.7 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=18, p50 12.6 min, p90 34.2 min; superseded (cancelled) 38.
- DORA: deploy freq 38.3/day, lead time p50 12.6 min, change-fail 18.2%, MTTR p50 19.2 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 8.6 min (n=13) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 2.8 min, p90 3.0 min (n=25) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 8.1 min, p90 8.6 min (n=12) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 13.4 min, p90 16.7 min (n=23) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 12.6 min, p90 34.2 min (n=18) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 11 of 60 runs (18.3%), 10 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 10% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
