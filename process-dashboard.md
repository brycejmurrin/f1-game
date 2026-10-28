# Process dashboard

Generated 2026-10-28T10:52Z. ci.yml runs in the window: 60 (2026-10-28T00:33Z → 2026-10-28T10:51Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 4 | 0.2 min | 0.2 min | 0.2 min | 0 | 0 |
| CI (draft fast tier) | 3 | 0.2 min | 0.2 min | 0.2 min | 0 | 0 |
| CI draft (opted out) | 12 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| CI edit event (ignored) | 24 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| CI label event (ignored) | 15 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Draft push (CI skipped — add run-ci label) | 12 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Driving model (characterization traces) | 4 | 2.4 min | 3.8 min | 3.8 min | 0 | 0 |
| Emulated VR (IWER / xr-emulated) | 2 | 2.5 min | 3.2 min | 3.2 min | 0 | 0 |
| Parts option-resolution census | 8 | 0.3 min | 2.2 min | 2.2 min | 0 | 0 |
| Per-circuit geometry sweeps | 7 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Per-circuit geometry sweeps (1of4) | 2 | 5.9 min | 6.3 min | 6.3 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 2 | 6.7 min | 6.8 min | 6.8 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 2 | 6.5 min | 6.5 min | 6.5 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 2 | 4.0 min | 6.7 min | 6.7 min | 0 | 0 |
| Pure-node unit suites (page-a) | 3 | 6.3 min | 6.5 min | 6.5 min | 0 | 0 |
| Pure-node unit suites (page-b) | 3 | 3.5 min | 3.5 min | 3.5 min | 0 | 0 |
| Pure-node unit suites (slow) | 3 | 8.4 min | 10.2 min | 10.2 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 3 | 3.6 min | 4.1 min | 4.1 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 3 | 3.6 min | 3.6 min | 3.6 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 3 | 8.7 min | 11.7 min | 11.7 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 3 | 10.0 min | 10.2 min | 10.2 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 16.9 min | 20.6 min | 20.6 min | 0 | 0 |
| Select specs for this change | 8 | 0.5 min | 0.8 min | 0.8 min | 0 | 0 |
| Selected specs (verdict) | 7 | 0.1 min | 0.2 min | 0.2 min | 0 | 1 |
| Smoke (page boots, __apex responds) (1) | 4 | 2.3 min | 3.6 min | 3.6 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 4 | 3.5 min | 3.9 min | 3.9 min | 0 | 0 |
| Structural guards | 7 | 0.1 min | 0.1 min | 0.1 min | 0 | 1 |
| Structural guards (tooling A) | 7 | 3.6 min | 4.8 min | 4.8 min | 0 | 1 |
| Structural guards (tooling B) | 7 | 3.6 min | 5.6 min | 5.6 min | 0 | 1 |
| Structural guards (tooling C) | 7 | 4.6 min | 4.8 min | 4.8 min | 0 | 1 |
| Structural guards (tooling D) | 7 | 3.8 min | 5.4 min | 5.4 min | 0 | 1 |
| Workflow and shader lints | 8 | 0.5 min | 0.7 min | 0.7 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 4 | 0.2 min | 0.2 min | 0.2 min |
| CI (draft fast tier) | 3 | 0.2 min | 0.2 min | 0.2 min |
| CI draft (opted out) | 12 | 0.1 min | 0.1 min | 0.1 min |
| CI edit event (ignored) | 24 | 0.1 min | 0.1 min | 0.1 min |
| CI label event (ignored) | 15 | 0.1 min | 0.1 min | 0.1 min |
| Draft push (CI skipped — add run-ci label) | 12 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 4 | 2.4 min | 3.8 min | 3.8 min |
| Emulated VR (IWER / xr-emulated) | 2 | 2.5 min | 3.2 min | 3.2 min |
| Parts option-resolution census | 8 | 0.3 min | 2.2 min | 2.2 min |
| Per-circuit geometry sweeps | 2 | 6.7 min | 6.8 min | 6.8 min |
| Pure-node unit suites | 3 | 10.2 min | 11.7 min | 11.7 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 2 | 16.9 min | 20.6 min | 20.6 min |
| Select specs for this change | 8 | 0.5 min | 0.8 min | 0.8 min |
| Selected specs (change-aware gate) | 3 | 8.8 min | 9.2 min | 9.2 min |
| Selected specs (verdict) | 7 | 0.1 min | 0.2 min | 0.2 min |
| Smoke (page boots, __apex responds) | 4 | 2.3 min | 3.6 min | 3.6 min |
| Staged build boots (minified _site, as Pages ships it) | 4 | 3.5 min | 3.9 min | 3.9 min |
| Structural guards | 7 | 4.8 min | 5.6 min | 5.6 min |
| Workflow and shader lints | 8 | 0.5 min | 0.7 min | 0.7 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 3.3%; re-gated SHAs 18 (32 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=3, p50 8.4 min, p90 9.8 min.
- Full tier: n=4, p50 34.4 min, p90 41.3 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=21, p50 24.6 min, p90 42.1 min; superseded (cancelled) 36.
- DORA: deploy freq 48.9/day, lead time p50 24.6 min, change-fail 12.5%, MTTR p50 19.5 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 10.2 min (n=3) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 2.3 min, p90 3.6 min (n=4) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 8.8 min, p90 9.2 min (n=3) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 34.4 min, p90 41.3 min (n=4) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 24.6 min, p90 42.1 min (n=21) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 32 of 60 runs (53.3%), 18 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 3.3% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
