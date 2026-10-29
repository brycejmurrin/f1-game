# Process dashboard

Generated 2026-10-29T11:09Z. ci.yml runs in the window: 60 (2026-10-29T01:42Z → 2026-10-29T11:04Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 6 | 0.2 min | 0.2 min | 0.2 min | 2 | 0 |
| CI (draft fast tier) | 9 | 0.2 min | 0.3 min | 0.3 min | 0 | 0 |
| CI draft (opted out) | 6 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| CI edit event (ignored) | 18 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| CI label event (ignored) | 16 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Draft push (CI skipped — add run-ci label) | 6 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Driving model (characterization traces) | 10 | 2.7 min | 3.7 min | 4.0 min | 0 | 4 |
| Emulated VR (IWER / xr-emulated) | 2 | 2.2 min | 3.7 min | 3.7 min | 0 | 3 |
| Parts option-resolution census | 19 | 0.3 min | 2.5 min | 2.7 min | 0 | 1 |
| Per-circuit geometry sweeps | 15 | 0.1 min | 0.1 min | 0.1 min | 0 | 3 |
| Per-circuit geometry sweeps (1of4) | 3 | 6.4 min | 6.6 min | 6.6 min | 0 | 1 |
| Per-circuit geometry sweeps (2of4) | 3 | 6.7 min | 6.9 min | 6.9 min | 0 | 1 |
| Per-circuit geometry sweeps (3of4) | 3 | 5.2 min | 6.6 min | 6.6 min | 0 | 1 |
| Per-circuit geometry sweeps (4of4) | 3 | 6.7 min | 6.7 min | 6.7 min | 0 | 1 |
| Pure-node unit suites (page-a) | 3 | 6.4 min | 6.7 min | 6.7 min | 0 | 1 |
| Pure-node unit suites (page-b) | 3 | 3.1 min | 3.4 min | 3.4 min | 0 | 1 |
| Pure-node unit suites (slow) | 5 | 10.5 min | 10.7 min | 10.7 min | 0 | 1 |
| Pure-node unit suites (vm-a1) | 6 | 2.8 min | 5.1 min | 5.1 min | 0 | 1 |
| Pure-node unit suites (vm-a2) | 5 | 3.0 min | 3.8 min | 3.8 min | 0 | 1 |
| Pure-node unit suites (vm-b1) | 6 | 9.2 min | 11.6 min | 11.6 min | 0 | 1 |
| Pure-node unit suites (vm-b2) | 6 | 7.3 min | 10.0 min | 10.0 min | 0 | 1 |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 16.5 min | 18.6 min | 18.6 min | 2 | 2 |
| Select specs for this change | 18 | 0.4 min | 0.5 min | 0.5 min | 0 | 2 |
| Selected specs (verdict) | 15 | 0.1 min | 0.2 min | 0.2 min | 1 | 5 |
| Smoke (page boots, __apex responds) (1) | 6 | 3.7 min | 3.8 min | 3.8 min | 0 | 1 |
| Staged build boots (minified _site, as Pages ships it) | 6 | 3.6 min | 4.4 min | 4.4 min | 0 | 1 |
| Structural guards | 15 | 0.1 min | 0.1 min | 0.3 min | 1 | 5 |
| Structural guards (tooling A) | 16 | 3.1 min | 5.1 min | 5.2 min | 0 | 4 |
| Structural guards (tooling B) | 16 | 3.6 min | 4.8 min | 4.9 min | 0 | 4 |
| Structural guards (tooling C) | 17 | 2.8 min | 4.6 min | 4.7 min | 1 | 3 |
| Structural guards (tooling D) | 17 | 3.2 min | 5.2 min | 5.3 min | 0 | 3 |
| Workflow and shader lints | 18 | 0.5 min | 0.7 min | 0.9 min | 0 | 2 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 6 | 0.2 min | 0.2 min | 0.2 min |
| CI (draft fast tier) | 9 | 0.2 min | 0.3 min | 0.3 min |
| CI draft (opted out) | 6 | 0.1 min | 0.1 min | 0.1 min |
| CI edit event (ignored) | 18 | 0.1 min | 0.1 min | 0.1 min |
| CI label event (ignored) | 16 | 0.1 min | 0.1 min | 0.1 min |
| Draft push (CI skipped — add run-ci label) | 6 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 10 | 2.7 min | 3.7 min | 4.0 min |
| Emulated VR (IWER / xr-emulated) | 2 | 2.2 min | 3.7 min | 3.7 min |
| Parts option-resolution census | 19 | 0.3 min | 2.5 min | 2.7 min |
| Per-circuit geometry sweeps | 3 | 6.7 min | 6.9 min | 6.9 min |
| Pure-node unit suites | 6 | 10.3 min | 11.6 min | 11.6 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 16.5 min | 18.6 min | 18.6 min |
| Select specs for this change | 18 | 0.4 min | 0.5 min | 0.5 min |
| Selected specs (change-aware gate) | 6 | 8.5 min | 9.7 min | 9.7 min |
| Selected specs (verdict) | 15 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 6 | 3.7 min | 3.8 min | 3.8 min |
| Staged build boots (minified _site, as Pages ships it) | 6 | 3.6 min | 4.4 min | 4.4 min |
| Structural guards | 17 | 4.6 min | 5.2 min | 5.3 min |
| Workflow and shader lints | 18 | 0.5 min | 0.7 min | 0.9 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 8.3%; re-gated SHAs 15 (36 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=9, p50 6.0 min, p90 9.2 min.
- Full tier: n=6, p50 16.7 min, p90 21.8 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=27, p50 18.1 min, p90 31.5 min; superseded (cancelled) 32.
- DORA: deploy freq 69.1/day, lead time p50 18.1 min, change-fail 3.6%, MTTR p50 15.8 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 10.3 min (n=6) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 3.7 min, p90 3.8 min (n=6) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 8.5 min, p90 9.7 min (n=6) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 16.7 min, p90 21.8 min (n=6) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 18.1 min, p90 31.5 min (n=27) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 36 of 60 runs (60%), 15 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 8.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
