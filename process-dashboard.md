# Process dashboard

Generated 2026-10-31T10:38Z. ci.yml runs in the window: 60 (2026-10-30T21:14Z → 2026-10-31T10:29Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 12 | 0.2 min | 0.2 min | 0.2 min | 1 | 0 |
| CI (draft fast tier) | 8 | 0.2 min | 0.3 min | 0.3 min | 3 | 0 |
| CI edit event (ignored) | 27 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| CI label event (ignored) | 12 | 0.1 min | 0.1 min | 0.2 min | 0 | 0 |
| Driving model (characterization traces) | 9 | 3.6 min | 3.8 min | 3.8 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 1 | 2.9 min | 2.9 min | 2.9 min | 0 | 0 |
| Parts option-resolution census | 20 | 0.3 min | 2.1 min | 2.2 min | 0 | 0 |
| Per-circuit geometry sweeps | 17 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Per-circuit geometry sweeps (1of4) | 2 | 3.8 min | 4.9 min | 4.9 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 2 | 4.2 min | 6.9 min | 6.9 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 2 | 5.7 min | 6.3 min | 6.3 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 2 | 5.0 min | 6.5 min | 6.5 min | 0 | 0 |
| Pure-node unit suites (page-a) | 8 | 4.8 min | 6.3 min | 6.3 min | 0 | 0 |
| Pure-node unit suites (page-b) | 8 | 3.3 min | 3.6 min | 3.6 min | 0 | 0 |
| Pure-node unit suites (slow) | 10 | 7.7 min | 10.1 min | 10.1 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 9 | 3.6 min | 5.0 min | 5.0 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 7 | 3.5 min | 3.6 min | 3.6 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 9 | 10.5 min | 11.3 min | 11.3 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 9 | 8.3 min | 11.3 min | 11.3 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 3 | 16.6 min | 17.6 min | 17.6 min | 0 | 0 |
| Select specs for this change | 20 | 0.4 min | 0.5 min | 0.5 min | 0 | 0 |
| Selected specs (verdict) | 20 | 0.1 min | 0.2 min | 0.2 min | 1 | 0 |
| Smoke (page boots, __apex responds) (1) | 12 | 2.3 min | 3.8 min | 4.0 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 12 | 3.6 min | 3.8 min | 3.9 min | 0 | 0 |
| Structural guards | 20 | 0.1 min | 0.1 min | 0.1 min | 3 | 0 |
| Structural guards (tooling A) | 20 | 3.1 min | 5.0 min | 5.5 min | 0 | 0 |
| Structural guards (tooling B) | 20 | 3.1 min | 4.4 min | 4.5 min | 0 | 0 |
| Structural guards (tooling C) | 20 | 2.9 min | 4.6 min | 4.7 min | 0 | 0 |
| Structural guards (tooling D) | 20 | 3.5 min | 5.2 min | 5.3 min | 3 | 0 |
| Workflow and shader lints | 20 | 0.5 min | 0.6 min | 1.0 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 12 | 0.2 min | 0.2 min | 0.2 min |
| CI (draft fast tier) | 8 | 0.2 min | 0.3 min | 0.3 min |
| CI edit event (ignored) | 27 | 0.1 min | 0.1 min | 0.1 min |
| CI label event (ignored) | 12 | 0.1 min | 0.1 min | 0.2 min |
| Driving model (characterization traces) | 9 | 3.6 min | 3.8 min | 3.8 min |
| Emulated VR (IWER / xr-emulated) | 1 | 2.9 min | 2.9 min | 2.9 min |
| Parts option-resolution census | 20 | 0.3 min | 2.1 min | 2.2 min |
| Per-circuit geometry sweeps | 2 | 5.7 min | 6.9 min | 6.9 min |
| Pure-node unit suites | 10 | 10.6 min | 10.9 min | 11.3 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 3 | 16.6 min | 17.6 min | 17.6 min |
| Select specs for this change | 20 | 0.4 min | 0.5 min | 0.5 min |
| Selected specs (change-aware gate) | 5 | 9.9 min | 10.3 min | 10.3 min |
| Selected specs (verdict) | 20 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 12 | 2.3 min | 3.8 min | 4.0 min |
| Staged build boots (minified _site, as Pages ships it) | 12 | 3.6 min | 3.8 min | 3.9 min |
| Structural guards | 20 | 4.5 min | 5.3 min | 5.5 min |
| Workflow and shader lints | 20 | 0.5 min | 0.6 min | 1.0 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 1.7%; re-gated SHAs 14 (42 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=8, p50 5.3 min, p90 6.8 min.
- Full tier: n=12, p50 11.0 min, p90 18.4 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=22, p50 22.6 min, p90 33.9 min; superseded (cancelled) 30.
- DORA: deploy freq 39.8/day, lead time p50 22.6 min, change-fail 26.7%, MTTR p50 20.9 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 10.6 min (n=10) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 2.3 min, p90 3.8 min (n=12) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 9.9 min, p90 10.3 min (n=5) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 11.0 min, p90 18.4 min (n=12) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 22.6 min, p90 33.9 min (n=22) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 42 of 60 runs (70%), 14 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 1.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
