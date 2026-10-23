# Process dashboard

Generated 2026-10-23T09:39Z. ci.yml runs in the window: 60 (2026-10-22T10:38Z → 2026-10-23T09:38Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 7 | 0.1 min | 0.2 min | 0.2 min | 2 | 0 |
| CI (draft fast tier) | 18 | 0.2 min | 0.2 min | 0.3 min | 9 | 0 |
| Draft push (CI skipped — add run-ci label) | 27 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Driving model (characterization traces) | 5 | 2.2 min | 3.5 min | 3.5 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 2 | 2.6 min | 3.3 min | 3.3 min | 0 | 0 |
| Parts option-resolution census | 32 | 0.2 min | 0.4 min | 2.6 min | 0 | 0 |
| Per-circuit geometry sweeps | 30 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Per-circuit geometry sweeps (1of4) | 1 | 5.5 min | 5.5 min | 5.5 min | 0 | 1 |
| Per-circuit geometry sweeps (2of4) | 2 | 4.9 min | 4.9 min | 4.9 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 1 | 4.5 min | 4.5 min | 4.5 min | 0 | 1 |
| Per-circuit geometry sweeps (4of4) | 2 | 5.8 min | 5.9 min | 5.9 min | 0 | 0 |
| Pure-node unit suites (page-a) | 5 | 1.8 min | 2.7 min | 2.7 min | 0 | 0 |
| Pure-node unit suites (page-b) | 4 | 5.8 min | 7.6 min | 7.6 min | 0 | 1 |
| Pure-node unit suites (slow) | 3 | 8.4 min | 9.4 min | 9.4 min | 0 | 1 |
| Pure-node unit suites (vm-a1) | 2 | 3.5 min | 4.3 min | 4.3 min | 0 | 1 |
| Pure-node unit suites (vm-a2) | 3 | 2.3 min | 3.6 min | 3.6 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 4 | 7.3 min | 11.0 min | 11.0 min | 0 | 1 |
| Pure-node unit suites (vm-b2) | 3 | 8.9 min | 9.2 min | 9.2 min | 1 | 2 |
| Renderer specs on a real GPU (macos-latest, Metal) | 1 | 18.3 min | 18.3 min | 18.3 min | 0 | 0 |
| Select specs for this change | 32 | 0.4 min | 0.5 min | 0.6 min | 0 | 0 |
| Selected specs (verdict) | 25 | 0.1 min | 0.2 min | 3.2 min | 0 | 7 |
| Smoke (page boots, __apex responds) (1) | 10 | 3.5 min | 3.7 min | 4.1 min | 0 | 1 |
| Staged build boots (minified _site, as Pages ships it) | 10 | 3.5 min | 4.1 min | 4.1 min | 0 | 1 |
| Structural guards | 25 | 0.1 min | 0.1 min | 0.1 min | 10 | 7 |
| Structural guards (tooling A) | 29 | 4.8 min | 6.3 min | 6.7 min | 3 | 3 |
| Structural guards (tooling B) | 27 | 7.7 min | 9.8 min | 10.0 min | 0 | 5 |
| Structural guards (tooling C) | 30 | 4.7 min | 6.2 min | 6.4 min | 9 | 2 |
| Workflow and shader lints | 32 | 0.5 min | 3.1 min | 4.1 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 7 | 0.1 min | 0.2 min | 0.2 min |
| CI (draft fast tier) | 18 | 0.2 min | 0.2 min | 0.3 min |
| Draft push (CI skipped — add run-ci label) | 27 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 5 | 2.2 min | 3.5 min | 3.5 min |
| Emulated VR (IWER / xr-emulated) | 2 | 2.6 min | 3.3 min | 3.3 min |
| Parts option-resolution census | 32 | 0.2 min | 0.4 min | 2.6 min |
| Per-circuit geometry sweeps | 2 | 5.8 min | 5.9 min | 5.9 min |
| Pure-node unit suites | 6 | 7.3 min | 11.0 min | 11.0 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 1 | 18.3 min | 18.3 min | 18.3 min |
| Select specs for this change | 32 | 0.4 min | 0.5 min | 0.6 min |
| Selected specs (change-aware gate) | 4 | 6.8 min | 12.1 min | 12.1 min |
| Selected specs (verdict) | 25 | 0.1 min | 0.2 min | 3.2 min |
| Smoke (page boots, __apex responds) | 10 | 3.5 min | 3.7 min | 4.1 min |
| Staged build boots (minified _site, as Pages ships it) | 10 | 3.5 min | 4.1 min | 4.1 min |
| Structural guards | 30 | 6.5 min | 9.8 min | 10.0 min |
| Workflow and shader lints | 32 | 0.5 min | 3.1 min | 4.1 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 13.3%; re-gated SHAs 13 (13 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=18, p50 10.6 min, p90 13.7 min.
- Full tier: n=7, p50 8.8 min, p90 20.4 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=53, p50 16.0 min, p90 26.5 min; superseded (cancelled) 3.
- DORA: deploy freq 55.3/day, lead time p50 16.0 min, change-fail 5.4%, MTTR p50 20.2 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 7.3 min (n=6) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.5 min, p90 3.7 min (n=10) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 6.8 min, p90 12.1 min (n=4) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 8.8 min, p90 20.4 min (n=7) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 16.0 min, p90 26.5 min (n=53) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 13 of 60 runs (21.7%), 13 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 13.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
