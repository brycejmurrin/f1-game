# Process dashboard

Generated 2026-11-10T13:06Z. ci.yml runs in the window: 60 (2026-11-09T03:20Z → 2026-11-10T12:58Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 26 | 0.2 min | 0.3 min | 0.3 min | 4 | 0 |
| CI (draft fast tier) | 25 | 0.2 min | 0.2 min | 0.4 min | 4 | 1 |
| Driving model (characterization traces) | 29 | 2.4 min | 3.7 min | 3.9 min | 0 | 2 |
| Emulated VR (IWER / xr-emulated) | 2 | 1.8 min | 2.8 min | 2.8 min | 0 | 2 |
| Parts option-resolution census | 58 | 0.3 min | 2.1 min | 2.3 min | 0 | 2 |
| Per-circuit geometry sweeps | 45 | 0.1 min | 0.1 min | 0.1 min | 1 | 2 |
| Per-circuit geometry sweeps (1of4) | 9 | 4.0 min | 6.5 min | 6.5 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 9 | 4.4 min | 7.3 min | 7.3 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 9 | 4.9 min | 6.4 min | 6.4 min | 1 | 0 |
| Per-circuit geometry sweeps (4of4) | 9 | 4.1 min | 6.7 min | 6.7 min | 0 | 0 |
| Pure-node unit suites (page-a) | 19 | 4.8 min | 6.5 min | 6.5 min | 0 | 0 |
| Pure-node unit suites (page-b) | 18 | 2.4 min | 3.4 min | 3.5 min | 0 | 0 |
| Pure-node unit suites (slow) | 16 | 3.2 min | 10.9 min | 11.1 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 20 | 3.8 min | 5.2 min | 5.3 min | 1 | 0 |
| Pure-node unit suites (vm-a2) | 17 | 2.6 min | 3.6 min | 3.7 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 19 | 6.3 min | 10.8 min | 10.9 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 19 | 6.4 min | 10.6 min | 10.9 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 17.3 min | 21.4 min | 21.4 min | 0 | 2 |
| Select specs for this change | 58 | 0.4 min | 0.5 min | 0.8 min | 0 | 2 |
| Selected specs (verdict) | 52 | 0.1 min | 0.2 min | 0.3 min | 5 | 8 |
| Smoke (page boots, __apex responds) (1) | 28 | 2.8 min | 3.9 min | 4.8 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 28 | 3.4 min | 5.0 min | 5.7 min | 0 | 1 |
| Structural guards | 58 | 0.1 min | 0.1 min | 0.1 min | 3 | 2 |
| Structural guards (tooling A) | 58 | 4.4 min | 5.8 min | 6.6 min | 0 | 2 |
| Structural guards (tooling B) | 59 | 3.0 min | 4.5 min | 4.8 min | 2 | 1 |
| Structural guards (tooling C) | 58 | 3.9 min | 5.1 min | 5.7 min | 0 | 2 |
| Structural guards (tooling D) | 58 | 3.4 min | 4.4 min | 4.5 min | 1 | 2 |
| Workflow and shader lints | 59 | 0.6 min | 1.1 min | 1.6 min | 0 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 26 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 25 | 0.2 min | 0.2 min | 0.4 min |
| Driving model (characterization traces) | 29 | 2.4 min | 3.7 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 2 | 1.8 min | 2.8 min | 2.8 min |
| Parts option-resolution census | 58 | 0.3 min | 2.1 min | 2.3 min |
| Per-circuit geometry sweeps | 9 | 6.5 min | 7.3 min | 7.3 min |
| Pure-node unit suites | 21 | 9.6 min | 10.9 min | 11.1 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 17.3 min | 21.4 min | 21.4 min |
| Select specs for this change | 58 | 0.4 min | 0.5 min | 0.8 min |
| Selected specs (change-aware gate) | 34 | 9.8 min | 12.6 min | 13.2 min |
| Selected specs (verdict) | 52 | 0.1 min | 0.2 min | 0.3 min |
| Smoke (page boots, __apex responds) | 28 | 2.8 min | 3.9 min | 4.8 min |
| Staged build boots (minified _site, as Pages ships it) | 28 | 3.4 min | 5.0 min | 5.7 min |
| Structural guards | 59 | 4.6 min | 5.8 min | 6.6 min |
| Workflow and shader lints | 59 | 0.6 min | 1.1 min | 1.6 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 15%; re-gated SHAs 3 (3 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=3, p50 12.0 min, p90 15.1 min.
- Full tier: n=48, p50 78.6 min, p90 136.2 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=23, p50 22.7 min, p90 47.1 min; superseded (cancelled) 28.
- DORA: deploy freq 16.4/day, lead time p50 22.7 min, change-fail 28.1%, MTTR p50 34.1 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 9.6 min (n=21) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 2.8 min, p90 3.9 min (n=28) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 9.8 min, p90 12.6 min (n=34) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 78.6 min, p90 136.2 min (n=48) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 22.7 min, p90 47.1 min (n=23) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 3 of 60 runs (5%), 3 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 15% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
