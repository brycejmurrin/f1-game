# Multi-round quality pass

## Goal

Fix a bounded set of confirmed user-facing defects, strengthen their regression
coverage, and correct nearby stale maintenance guidance. Preserve the user's
existing touch-input work and avoid expanding this pass into broad renderer,
PWA, CI, or architectural refactoring.

## Scope

### Gameplay correctness

1. Initialize sector timing from the car's actual starting sector.
2. Record the third-sector transition before resetting state at the finish line,
   so a completed lap has valid S1, S2, and S3 splits.
3. Start time-trial ghost recording at the first flying-lap boundary rather than
   at lights-out. Stored samples must begin near the start line and remain
   monotonic in lap distance.
4. Replace the fixed six-minute race cutoff with an emergency cutoff of
   `360 seconds * lapsTarget`. Configured 10-, 25-, and 57-lap races must not
   end at 360 seconds.
5. Make the `finishRace()` development hook classify cars in their current field
   order instead of construction order.

### Lifecycle and data correctness

1. Invalidate and free cached custom-team decal textures when custom-team visual
   settings change.
2. Record meeting start dates returned by `meetings()`. Use the existing
   ten-minute live cache lifetime for session lists from meetings whose start is
   no more than seven days old; retain the seven-day historical lifetime for
   older meetings.
3. Add monotonically increasing request-generation guards to
   year/meeting/session pickers and telemetry driver loading. Each selection
   change invalidates all older requests; a response may update the DOM only
   when its captured generation still equals the current generation.
4. When sound is re-enabled during a race, restore the appropriate race music.
   Existing pause/resume engine behavior remains unchanged.

### Tests and maintenance guidance

1. Add focused regression tests before each production fix and observe the
   expected failure.
2. Strengthen the smoke test for `__apex.jump()` so it checks fraction, speed,
   and lateral offset rather than only track length.
3. Correct verified stale comments or documentation concerning Data Hub tabs,
   active renderer integration, camera modes, architecture/build descriptions,
   and renamed tooling.
4. Avoid broad prose rewrites and unrelated cleanup.

## Explicit exclusions

- CI and GitHub Pages workflow changes.
- Service-worker installation or cache-generation redesign.
- WebGPU lighting-tuner parity work.
- Broad test discovery or fixture migration.
- Large `game.js` extraction or module-system refactoring.
- Changes to touch/pointer behavior currently being developed in `js/input.js`.

## Existing work protection

The pre-existing modifications to `index.html`, `js/input.js`, and
`version.json`, plus untracked `_probe-autosteer.mjs`, belong to the user and
must not be reverted or overwritten. Since this pass changes JavaScript, the
cache build will be advanced once from the user's current build 541 to build 542
after all production edits are complete.

## Implementation boundaries

Work is split into independently reviewable tasks:

1. Sector timing and race-completion behavior.
2. Time-trial ghost lap-boundary behavior.
3. Custom-team decal cache invalidation.
4. Active-weekend freshness and stale-response guards.
5. Race-music restoration.
6. Test assertion and maintenance-guidance cleanup.
7. One final cache-version bump and integration validation.

Tasks that touch the same central file run sequentially. Independent discovery,
task review, and final review run in parallel rounds. Each behavioral change
uses test-driven development and receives an independent review before the next
integration stage.

## Verification

- Run the narrow specification covering each change during its TDD cycle.
- Run `npm run test:modes` for sector, ghost, and race-completion behavior.
- Run `npm run test:smoke` for startup and `__apex.jump()`.
- Run the relevant API/Data Hub tests for freshness and stale-response behavior.
- Run focused UI/audio coverage for sound restoration and custom-team visuals.
- Run `npm run test:fast` after integration.
- Confirm every `?v=` value in `index.html` and `version.json` uses the same new
  build number.
- Run parallel final reviewers for correctness, regression risk, and scope
  compliance; fix confirmed findings and re-review.

## Success criteria

- All scoped regressions fail before their fixes and pass afterward.
- Existing targeted suites remain green.
- Long configured races no longer end at six minutes.
- Completed laps expose valid S1, S2, and S3 timing.
- Saved ghosts contain only a monotonic flying lap.
- Async Data Hub results always correspond to the latest selection.
- Custom-team visuals and race music refresh correctly.
- Existing user work remains intact.
