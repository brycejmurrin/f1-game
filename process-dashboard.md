# Process dashboard

Generated 2026-11-18T13:34Z. ci.yml runs in the window: 60 (2026-11-15T17:49Z → 2026-11-18T13:22Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 12 | 0.2 min | 0.3 min | 0.3 min | 0 | 0 |
| CI (draft fast tier) | 29 | 0.2 min | 0.3 min | 0.5 min | 10 | 1 |
| Driving model (characterization traces) | 18 | 2.3 min | 3.9 min | 3.9 min | 0 | 4 |
| Emulated VR (IWER / xr-emulated) | 1 | 2.4 min | 2.4 min | 2.4 min | 0 | 1 |
| Parts option-resolution census | 59 | 0.3 min | 0.3 min | 1.8 min | 0 | 1 |
| Per-circuit geometry sweeps | 50 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Pure-node unit suites (page-a) | 3 | 1.1 min | 1.3 min | 1.3 min | 0 | 0 |
| Pure-node unit suites (page-b) | 2 | 1.4 min | 1.4 min | 1.4 min | 0 | 0 |
| Pure-node unit suites (slow) | 4 | 6.1 min | 9.7 min | 9.7 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 3 | 3.8 min | 4.5 min | 4.5 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 2 | 1.9 min | 3.0 min | 3.0 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 3 | 5.0 min | 5.3 min | 5.3 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 3 | 4.7 min | 6.2 min | 6.2 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 20.7 min | 22.9 min | 22.9 min | 0 | 1 |
| Select specs for this change | 59 | 0.5 min | 0.6 min | 0.8 min | 0 | 1 |
| Selected specs (verdict) | 42 | 0.2 min | 0.3 min | 0.4 min | 0 | 18 |
| Smoke (page boots, __apex responds) (1) | 13 | 2.7 min | 5.0 min | 5.0 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 13 | 3.9 min | 5.2 min | 5.2 min | 0 | 0 |
| Structural guards | 55 | 0.1 min | 0.1 min | 0.1 min | 12 | 5 |
| Structural guards (tooling A) | 57 | 4.9 min | 6.3 min | 6.6 min | 14 | 3 |
| Structural guards (tooling B) | 59 | 3.2 min | 4.6 min | 5.0 min | 1 | 1 |
| Structural guards (tooling C) | 58 | 4.3 min | 5.9 min | 6.2 min | 2 | 2 |
| Structural guards (tooling D) | 59 | 3.4 min | 5.0 min | 5.2 min | 2 | 1 |
| Workflow and shader lints | 59 | 0.5 min | 0.8 min | 0.8 min | 1 | 1 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 12 | 0.2 min | 0.3 min | 0.3 min |
| CI (draft fast tier) | 29 | 0.2 min | 0.3 min | 0.5 min |
| Driving model (characterization traces) | 18 | 2.3 min | 3.9 min | 3.9 min |
| Emulated VR (IWER / xr-emulated) | 1 | 2.4 min | 2.4 min | 2.4 min |
| Parts option-resolution census | 59 | 0.3 min | 0.3 min | 1.8 min |
| Per-circuit geometry sweeps | 50 | 0.1 min | 0.1 min | 0.1 min |
| Pure-node unit suites | 5 | 6.1 min | 9.7 min | 9.7 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 20.7 min | 22.9 min | 22.9 min |
| Select specs for this change | 59 | 0.5 min | 0.6 min | 0.8 min |
| Selected specs (change-aware gate) | 38 | 1.1 min | 2.7 min | 8.6 min |
| Selected specs (verdict) | 42 | 0.2 min | 0.3 min | 0.4 min |
| Smoke (page boots, __apex responds) | 13 | 2.7 min | 5.0 min | 5.0 min |
| Staged build boots (minified _site, as Pages ships it) | 13 | 3.9 min | 5.2 min | 5.2 min |
| Structural guards | 59 | 5.2 min | 6.3 min | 6.6 min |
| Workflow and shader lints | 59 | 0.5 min | 0.8 min | 0.8 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 31.7%; re-gated SHAs 8 (8 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=2, p50 14.9 min, p90 20.3 min.
- Full tier: n=39, p50 15.5 min, p90 39.7 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=39, p50 16.3 min, p90 51.2 min; superseded (cancelled) 12.
- DORA: deploy freq 13.9/day, lead time p50 16.3 min, change-fail 18.8%, MTTR p50 53.9 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 6.1 min (n=5) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 2.7 min, p90 5.0 min (n=13) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 1.1 min, p90 2.7 min (n=38) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 15.5 min, p90 39.7 min (n=39) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 16.3 min, p90 51.2 min (n=39) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 8 of 60 runs (13.3%), 8 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 31.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
