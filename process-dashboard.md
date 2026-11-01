# Process dashboard

Generated 2026-11-01T11:33Z. ci.yml runs in the window: 60 (2026-10-31T00:16Z → 2026-11-01T11:31Z).
Job percentiles use runs that finished success or failure. Cancelled jobs are counted and left out of the percentile. A family row is the slowest matrix cell of that family in each run; a bare rollup counts only when no cell ran. Tier walls are workflow updated_at minus run_started_at (queue plus jobs). A run that only printed the draft-skip notice is in neither tier.

## Jobs

| Job | n | p50 | p90 | max | fail | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| CI | 11 | 0.2 min | 0.2 min | 0.3 min | 0 | 0 |
| CI (draft fast tier) | 10 | 0.2 min | 0.3 min | 0.3 min | 0 | 0 |
| CI draft (opted out) | 3 | 0.1 min | 0.1 min | 0.1 min | 0 | 3 |
| CI edit event (ignored) | 16 | 0.1 min | 0.1 min | 0.2 min | 0 | 0 |
| CI label event (ignored) | 16 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Draft push (CI skipped — add run-ci label) | 3 | 0.1 min | 0.1 min | 0.1 min | 0 | 3 |
| Driving model (characterization traces) | 2 | 0.2 min | 3.7 min | 3.7 min | 0 | 0 |
| Golden menus on a runner (trial, non-blocking) | 1 | 2.1 min | 2.1 min | 2.1 min | 0 | 0 |
| Parts option-resolution census | 22 | 0.3 min | 0.3 min | 2.1 min | 0 | 0 |
| Per-circuit geometry sweeps | 17 | 0.1 min | 0.1 min | 0.1 min | 0 | 0 |
| Per-circuit geometry sweeps (1of4) | 3 | 6.4 min | 6.4 min | 6.4 min | 0 | 0 |
| Per-circuit geometry sweeps (2of4) | 3 | 6.9 min | 6.9 min | 6.9 min | 0 | 0 |
| Per-circuit geometry sweeps (3of4) | 3 | 6.2 min | 6.3 min | 6.3 min | 0 | 0 |
| Per-circuit geometry sweeps (4of4) | 3 | 6.7 min | 6.8 min | 6.8 min | 0 | 0 |
| Pure-node unit suites (page-a) | 2 | 6.2 min | 6.4 min | 6.4 min | 0 | 0 |
| Pure-node unit suites (page-b) | 2 | 2.0 min | 3.3 min | 3.3 min | 0 | 0 |
| Pure-node unit suites (slow) | 6 | 5.9 min | 10.0 min | 10.0 min | 0 | 0 |
| Pure-node unit suites (vm-a1) | 7 | 3.5 min | 5.0 min | 5.0 min | 0 | 0 |
| Pure-node unit suites (vm-a2) | 4 | 2.3 min | 3.5 min | 3.5 min | 0 | 0 |
| Pure-node unit suites (vm-b1) | 7 | 8.2 min | 11.0 min | 11.0 min | 0 | 0 |
| Pure-node unit suites (vm-b2) | 7 | 9.1 min | 10.8 min | 10.8 min | 0 | 0 |
| Renderer specs on a real GPU (macos-latest, Metal) | 1 | 14.7 min | 14.7 min | 14.7 min | 0 | 0 |
| Select specs for this change | 22 | 0.4 min | 0.5 min | 0.8 min | 0 | 0 |
| Selected specs (verdict) | 20 | 0.1 min | 0.1 min | 0.2 min | 0 | 1 |
| Smoke (page boots, __apex responds) (1) | 11 | 0.1 min | 3.5 min | 3.6 min | 0 | 0 |
| Smoke (page boots, __apex responds) (2) | 1 | 0.6 min | 0.6 min | 0.6 min | 0 | 0 |
| Smoke (page boots, __apex responds) (3) | 1 | 0.6 min | 0.6 min | 0.6 min | 0 | 0 |
| Smoke (page boots, __apex responds) (4) | 1 | 0.8 min | 0.8 min | 0.8 min | 0 | 0 |
| Staged build boots (minified _site, as Pages ships it) | 11 | 3.0 min | 3.8 min | 4.6 min | 0 | 0 |
| Structural guards | 22 | 0.1 min | 0.1 min | 0.2 min | 0 | 0 |
| Structural guards (tooling A) | 22 | 0.5 min | 5.2 min | 5.3 min | 0 | 0 |
| Structural guards (tooling B) | 22 | 0.5 min | 4.6 min | 4.7 min | 0 | 0 |
| Structural guards (tooling C) | 22 | 0.4 min | 4.4 min | 4.6 min | 0 | 0 |
| Structural guards (tooling D) | 22 | 0.4 min | 5.1 min | 5.3 min | 0 | 0 |
| Workflow and shader lints | 22 | 0.6 min | 0.7 min | 1.0 min | 0 | 0 |

## Families

| Family | n | p50 | p90 | max |
|---|---:|---:|---:|---:|
| CI | 11 | 0.2 min | 0.2 min | 0.3 min |
| CI (draft fast tier) | 10 | 0.2 min | 0.3 min | 0.3 min |
| CI draft (opted out) | 3 | 0.1 min | 0.1 min | 0.1 min |
| CI edit event (ignored) | 16 | 0.1 min | 0.1 min | 0.2 min |
| CI label event (ignored) | 16 | 0.1 min | 0.1 min | 0.1 min |
| Draft push (CI skipped — add run-ci label) | 3 | 0.1 min | 0.1 min | 0.1 min |
| Driving model (characterization traces) | 2 | 0.2 min | 3.7 min | 3.7 min |
| Golden menus on a runner (trial, non-blocking) | 1 | 2.1 min | 2.1 min | 2.1 min |
| Parts option-resolution census | 22 | 0.3 min | 0.3 min | 2.1 min |
| Per-circuit geometry sweeps | 3 | 6.9 min | 6.9 min | 6.9 min |
| Pure-node unit suites | 7 | 10.8 min | 11.0 min | 11.0 min |
| Renderer specs on a real GPU (macos-latest, Metal) | 1 | 14.7 min | 14.7 min | 14.7 min |
| Select specs for this change | 22 | 0.4 min | 0.5 min | 0.8 min |
| Selected specs (change-aware gate) | 5 | 10.6 min | 11.6 min | 11.6 min |
| Selected specs (verdict) | 20 | 0.1 min | 0.1 min | 0.2 min |
| Smoke (page boots, __apex responds) | 11 | 0.1 min | 3.5 min | 3.6 min |
| Staged build boots (minified _site, as Pages ships it) | 11 | 3.0 min | 3.8 min | 4.6 min |
| Structural guards | 22 | 0.5 min | 5.2 min | 5.3 min |
| Workflow and shader lints | 22 | 0.6 min | 0.7 min | 1.0 min |

## Runs and deploy

- ci.yml runs: 60; cancelled 6.7%; re-gated SHAs 15 (44 extra runs).
- Fast tier (no smoke, geometry sweep, or selected-specs job ran): n=10, p50 5.6 min, p90 5.8 min.
- Full tier: n=11, p50 9.9 min, p90 11.9 min.
- Deploy push→live (successful pages.yml on claude/f1-game-project-26h3ng): n=36, p50 14.3 min, p90 30.0 min; superseded (cancelled) 21.
- DORA: deploy freq 24.5/day, lead time p50 14.3 min, change-fail 7.7%, MTTR p50 20.4 min.

## Compared with 2026-09-16

Source of the earlier column: docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md §0. The speed-up plan's item 14 aimed at ≈ 8 min median push-to-live (from ≈ 14).
The ci.yml sample is the newest 60 completed runs on every branch. The pages.yml sample is the newest 60 completed runs on the deploy branch. When those runs fall in one afternoon, deploy frequency per day is that afternoon spread over the span, not a monthly rate, and a cancelled pages run is a train the next push replaced.

| Step | 2026-09-16 | This window |
|---|---|---|
| CI node-suites | 11.3 min median (40/40 runs, one serial job) | slowest slice per run p50 10.8 min (n=7) |
| CI smoke, slowest shard | slowest shard median 7.4 min, p90 14.5 min | p50 0.1 min, p90 3.5 min (n=11) |
| CI selected, slowest shard | agent-view 22–40 min; wake-lock 18.6 min | p50 10.6 min, p90 11.6 min (n=5) |
| Full tier wall | median 14.3 min, p90 19.3 (23 runs) | p50 9.9 min, p90 11.9 min (n=11) |
| Push → live | median ≈ 14 min, p90 28–44 min; target after the speed-ups ≈ 8 min | p50 14.3 min, p90 30.0 min (n=36) |
| Same-SHA re-gate | 12 of 60 runs (20%) | 44 of 60 runs (73.3%), 15 SHAs |
| Cancelled ci.yml runs | 9 of 59 (15%) | 6.7% of 60 |

cancelled runs may hide a real failure — a killed job runs no always() step
