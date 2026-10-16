# Spec-timings audit — 2026-10-10

Trigger: PR #1356 full-tier shard `selected-5` hit the 10-minute job cap because
`garage-out-before-card.spec.js` had <3 llvmpipe samples and was billed at the
7.5 s/test constant (`tools/ci/select-budget.mjs`, `MIN_SAMPLES = 3`) while it costs ~60 s/test.
That spec was fixed on #1356 (commit 772f3a7d3) and is deliberately NOT touched here.

## Method
- Planner input = committed `tests/data/spec-timings.json` unioned with the `bot/spec-timings` overlay (ci-select-specs-step.sh).
  Against that union, 28 of 138 specs still billed at the constant (13 with no sample at all).
- Free harvest first: every CI run uploads `spec-timings-junit-*` artifacts; ~2,200 from successful ci/pages runs since 2026-10-03
  were scanned. Only vr-emulated and logging had usable samples (PR runs rarely select these groups).
- Then `node tools/ci/remote-group.mjs <group>` (4 llvmpipe shards) on this branch: wave 1 hooks, physics-core, aero;
  wave 2 hooks, physics-core, collisions; wave 3 circuits, hooks, car (never more than 3 in flight).
  Samples come from the shard job logs (success junit is not uploaded by browser-group.yml), GitHub timestamp prefix and ANSI
  stripped, merged with `tools/ci/spec-timings.mjs --env llvmpipe`. No hand edits of the data file.
- Waves had red shards from flaky-on-retry tests (APEX_FAIL_ON_FLAKY) and two retried failures
  (longitudinal "driving onto the grass bleeds speed", offtrack "prog tracks s"); the tool records passing attempts only.
  Flakes are not quarantined here.

## Billed cost per test, before -> after (now measured, >=3 llvmpipe samples)
| spec | before s/test | after s/test | llvmpipe samples |
|---|---|---|---|
| active-aero | 7.5 (constant) | 9.3 | 4 |
| aero-zones | 7.5 (constant) | 9.1 | 3 |
| agent-drive-bench | 7.5 (constant) | 11.6 | 3 |
| agent-view | 7.5 (constant) | 1.4 | 9 |
| collisions-deep | 7.5 (constant) | 17.6 | 3 |
| drift | 7.5 (constant) | 18.1 | 4 |
| headless-api | 7.5 (constant) | 2.9 | 6 |
| logging | 7.5 (constant) | 2 | 5 |
| longitudinal | 7.5 (constant) | 18.7 | 3 |
| obs-act-edge | 7.5 (constant) | 7.4 | 3 |
| offtrack | 7.5 (constant) | 16 | 5 |
| physics-fixes | 7.5 (constant) | 18.9 | 4 |
| pit-lane | 7.5 (constant) | 8.8 | 3 |
| projection | 7.5 (constant) | 8.9 | 6 |
| race-control | 7.5 (constant) | 5.6 | 3 |
| vr-emulated | 7.5 (constant) | 40.2 | 3 |
| wake-lock | 7.5 (constant) | 12.4 | 3 |
| world-physics | 7.5 (constant) | 16.4 | 3 |

Local-box numbers mislead: wake-lock measured 64 s/test on this container but 12.4 s on llvmpipe.

## Still billed at the 7.5 s constant (<3 llvmpipe samples)
| spec | llvmpipe samples |
|---|---|
| albert-park-foundation | 1 |
| autopilot | 1 |
| collision-ai-fixes | 2 |
| collisions | 1 |
| cota-foundation | 1 |
| elevation-tracks | 1 |
| imola-foundation | 2 |
| material-shimmer | 0 |
| parts-livery-contrast | 1 |
| xr-plan | 1 |

Not sampled: circuits specs (imola-foundation ~43 s/test with 1 test, cota/albert-park/autopilot/elevation-tracks),
collisions / collision-ai-fixes, parts-livery-contrast, xr-plan (~3 s/test, harmless). `material-shimmer` is a manual opt-in spec that
the selector never puts on a command. Each needs 1-2 more group runs (`circuits`, `collisions`, `car`).
The data file also gained whole-group samples for already-measured specs (rolling window of 10).

## Selector pin fallout (2026-10-11 steward)
Honest llvmpipe medians flipped several high-`test.setTimeout` specs to
`measuredCheap` (`sec * 3 <= 180`): bahrain-foundation (~15 s/test),
physics-hotpath / map-hooks (~7–8 s/test), hud-layout (~38 s/test → oversize).
`tests/unit/select-specs.test.mjs` pins moved: over-budget example is now
`track-switch-memory` (~76 s/test, still not cheap); the race-fixture /
hud-layout pins accept the measuredCheap path. Ship sync also re-serialised
the union via `tools/ci/spec-timings.mjs` `serialise()` and absorbed #1437's
HUD ratchet raise so the merge could commit.
