# Process dashboard

Generated 2026-10-19T10:21Z. ci.yml runs in the window: 60 (2026-10-18T15:28Z → 2026-10-19T10:19Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 25 | 0.2 min | 0.2 min | 0.3 min | 4 | 0 |
| CI (draft fast tier) | 9 | 0.2 min | 0.2 min | 0.2 min | 3 | 0 |
| Draft push (CI skipped — add run-ci label) | 24 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Driving model (characterization traces) | 12 | 3.0 min | 3.2 min | 3.3 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 2 | 1.9 min | 4.2 min | 4.2 min | 0 | 0 |
| Golden menus on a runner (trial, non-blocking) | 3 | 1.3 min | 1.5 min | 1.5 min | 0 | 0 |
| Parts option-resolution census | 35 | 0.2 min | 2.5 min | 2.9 min | 0 | 0 |
| Per-circuit geometry sweeps | 32 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 12 | 6.9 min | 8.9 min | 8.9 min | 0 | 1 |
| Per-circuit geometry sweeps (2of4) | 12 | 6.9 min | 7.1 min | 7.1 min | 0 | 1 |
| Per-circuit geometry sweeps (3of4) | 12 | 4.7 min | 5.8 min | 5.9 min | 0 | 1 |
| Per-circuit geometry sweeps (4of4) | 13 | 6.2 min | 6.4 min | 6.6 min | 0 | 0 |
| Pure-node unit suites (page-a) | 11 | 2.6 min | 2.8 min | 2.8 min | 0 | 0 |
| Pure-node unit suites (page-b) | 11 | 6.7 min | 6.9 min | 8.7 min | 0 | 0 |
| Pure-node unit suites (slow) | 17 | 4.1 min | 4.8 min | 4.9 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 14 | 4.1 min | 4.3 min | 4.3 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 13 | 4.6 min | 4.8 min | 4.8 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 14 | 8.3 min | 8.9 min | 8.9 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 15 | 6.7 min | 7.8 min | 7.9 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 8 | 15.7 min | 17.3 min | 17.3 min | 0 | 1 |
| Select specs for this change | 35 | 0.4 min | 0.5 min | 0.5 min | 0 | 0 |
| Selected specs (verdict) | 31 | 0.1 min | 0.2 min | 0.2 min | 1 | 1 |
| Smoke (page boots, __apex responds) (1) | 26 | 2.6 min | 3.2 min | 16.1 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 3 | 2.6 min | 3.0 min | 3.0 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 3 | 2.8 min | 2.8 min | 2.8 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 3 | 3.0 min | 3.4 min | 3.4 min | 0 | 0 |
| Structural guards | 35 | 0.1 min | 0.1 min | 0.1 min | 6 | 0 |
| Structural guards (tooling A) | 35 | 9.0 min | 10.9 min | 11.2 min | 2 | 0 |
| Structural guards (tooling B) | 35 | 7.4 min | 8.8 min | 9.0 min | 5 | 0 |
| Workflow and shader lints | 35 | 0.5 min | 0.6 min | 0.6 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 25 | 0.2 min | 0.2 min | 0.3 min |
| CI (draft fast tier) | 9 | 0.2 min | 0.2 min | 0.2 min |
| Draft push (CI skipped — add run-ci label) | 24 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 12 | 3.0 min | 3.2 min | 3.3 min |
| Emulated VR (IWER / xr-emulated) | 2 | 1.9 min | 4.2 min | 4.2 min |
| Golden menus on a runner (trial, non-blocking) | 3 | 1.3 min | 1.5 min | 1.5 min |
| Parts option-resolution census | 35 | 0.2 min | 2.5 min | 2.9 min |
| Per-circuit geometry sweeps | 13 | 7.1 min | 8.9 min | 8.9 min |
| Pure-node unit suites | 19 | 7.8 min | 8.9 min | 8.9 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 8 | 15.7 min | 17.3 min | 17.3 min |
| Select specs for this change | 35 | 0.4 min | 0.5 min | 0.5 min |
| Selected specs (change-aware gate) | 9 | 10.6 min | 11.5 min | 11.5 min |
| Selected specs (verdict) | 31 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 26 | 2.6 min | 3.2 min | 16.1 min |
| Structural guards | 35 | 9.0 min | 10.9 min | 11.2 min |
| Workflow and shader lints | 35 | 0.5 min | 0.6 min | 0.6 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 3.3%; re-gated SHAs 9 (12 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=9, p50 9.2 min, p90 12.0 min.
- Full tier: n=25, p50 11.7 min, p90 19.4 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=46, p50 13.4 min, p90 26.0 min; superseded (cancelled) 8.
- DORA: deploy freq 58.6/day, lead time p50 13.4 min, change-fail 11.5%, MTTR p50 15.6 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 7.8 min (n=19) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 2.6 min, p90 3.2 min (n=26) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 10.6 min, p90 11.5 min (n=9) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 11.7 min, p90 19.4 min (n=25) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 13.4 min, p90 26.0 min (n=46) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 12 of 60 runs (20%), 9 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 3.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
