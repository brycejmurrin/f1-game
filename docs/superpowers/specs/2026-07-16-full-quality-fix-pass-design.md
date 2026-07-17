# Full confirmed-findings quality pass

## Goal

Fix every confirmed defect from the July 16 gameplay, graphics, mobile UI, and
test/tooling audits. Add regressions that prove each behavioral fix, preserve
concurrent work, and limit cleanup to comments or documentation that are
demonstrably inconsistent with the implementation.

## Execution model

Implementation is serial and risk ordered. Each behavioral defect follows a
red-green-refactor cycle: add the narrowest useful regression, observe the
expected failure, make the minimal production change, and rerun the focused
test. Reviews may be parallel, but production edits are not.

Existing uncommitted changes in skills, documentation, tests, and tools are
owned by another workstream. Every overlapping file must be reread immediately
before editing, and this pass must merge around those changes rather than
discarding or silently absorbing them.

## Scope

### 1. Runtime and gameplay correctness

1. Custom-team visual invalidation must free and delete every cache entry whose
   key begins with `custom:` in `teamMeshes`, `playerBodies`, and
   `cockpitBodies`. Decal invalidation remains part of the same operation.
2. Keyboard, pointer, and touch control state must reset on window blur and when
   the document becomes hidden, preventing held inputs after app switching.
3. Closing or bypassing the lighting tuner through Escape, pause, or gamepad
   paths must remove `body.lt-open`, exit tuner-owned photo mode, and restore
   normal race controls.
4. Clearing a time-trial ghost must not clear the independent leaderboard best.
   The active record must be recomputed from persisted leaderboard data.
5. Ghost delta lookup must not binary-search non-monotonic raw lap distance.
   Recording will retain only forward-progress samples for the timed lap so the
   stored lookup domain is monotonic.
6. Season points must use a stable driver identity rather than editable display
   codes. Existing saved standings must migrate without losing points.

### 2. Data Hub and accessibility

1. LIVE and TELEMETRY session pickers must own independent request-generation
   counters. Switching tabs cannot invalidate a different picker's request or
   leave a cached picker permanently showing `loading…`.
2. LIVE initial, manual, and automatic refreshes must use a generation guard so
   an older response cannot overwrite newer data or its timestamp.
3. Deselecting every telemetry driver must synchronously replace the spinner
   with the existing “Pick a driver” empty state before returning.
4. Livery edit and delete actions must be real, separately focusable buttons
   with accessible names and keyboard activation, not pointer-only spans nested
   inside another button.
5. Data Hub overlays must expose dialog semantics, manage initial/restored
   focus, and provide correct tablist, tab, and tabpanel state. The telemetry
   popup close button must have an accessible name. Focus trapping applies only
   while a modal overlay is open.

### 3. Offline and service-worker lifecycle

1. Runtime cache writes must be awaited and attached to the fetch event
   lifetime. A network response may be returned immediately, but any background
   cache update must be protected by `event.waitUntil()`.
2. Installation must fail if an essential shell asset cannot be precached.
   Optional assets may remain best effort.
3. A failed new installation must not activate an incomplete cache or delete the
   last healthy generation. Old cache deletion occurs only after a complete new
   essential cache is ready.

### 4. WebGPU correctness and parity

1. Post-processing resize allocation must be transactional. Replacement
   textures and bind groups are built successfully before old resources are
   destroyed; allocation failure leaves a valid fallback binding set.
2. Replaced bloom downsample and upsample uniform buffers must be explicitly
   destroyed during resize.
3. `wetDark`, `bloomKnee`, and `vignetteSoft` must be represented in the WebGPU
   uniform layout, uploaded from live tuning values, and consumed by WGSL rather
   than hard-coded.
4. The guarded clear-coat flake normal basis used by GLSL must be mirrored in
   WGSL so degenerate geometry cannot produce NaN paint pixels.

### 5. Test and tool integrity

1. Track-accuracy coverage must use pinned local reference data during tests,
   verify that every expected circuit is mapped, and assert actual shape and
   direction tolerances for all mapped tracks. Network refresh belongs in a
   separate explicit maintenance tool and cannot turn test failures into skips.
2. Named-group coverage auditing must ignore project-wide catch-all scripts when
   deciding whether a specification belongs to a topical group. Currently
   omitted custom-team, data-lifecycle, and output-path tests must be assigned
   to relevant groups.
3. Specifications that rely on deterministic API mocks, test mode, page-error
   capture, or failure telemetry must import the shared fixture. A static audit
   will prevent those intended consumers from regressing to direct
   `@playwright/test` imports.
4. Audio smoke coverage must exercise the real `GameAudio` graph and a genuine
   user-gesture unlock path instead of unrelated browser primitives.
5. Quick validation must fail when its race-start or camera probes are false and
   must have a self-test covering those failure paths.

### 6. Verified cleanup

Correct only comments and documentation whose mismatch was proven by the audits:

- brake-control count, button-mode throttle behavior, tilt sensitivity
  signature, and ghost monotonicity comments;
- WebGPU composite feature status;
- root specification count, retry behavior, server behavior, and shared-fixture
  claims in testing documentation.

Broad style rewrites and unrelated architectural refactors are excluded.

## Compatibility and migration

- Preserve existing local-storage keys and public `window.__apex` behavior.
- Season standings may gain stable internal driver keys, but display codes and
  existing user-visible standings remain unchanged.
- Service-worker cache naming continues to derive from the deployed build.
- WebGL output remains unchanged except for shared state fixes; WebGPU tuner
  parity changes only values already advertised by the UI.
- No module-system, framework, or build-step changes are introduced.

## Test strategy

Focused regressions are added beside the closest existing suites:

- custom-team, input, pause/tuner, time-trial, and season behavior;
- Data Hub lifecycle and accessibility;
- service-worker installation, activation, and cache-write lifetime;
- WebGPU uniform packing, resize fault injection, resource destruction, and WGSL
  finite-output checks;
- coverage-audit, quick-validator, audio, and track-accuracy self-tests.

After focused tests pass, run the narrow named groups for each changed
subsystem, then `npm run test:fast`. Run UI or visual suites only for changes
whose behavior cannot be established structurally. Perform one final
cache-version increment after all JavaScript and CSS edits, synchronizing every
asset URL, `window.__APEX_BUILD`, and `version.json`.

## Success criteria

- Every confirmed behavioral finding has a regression that failed before its
  fix and passes afterward.
- No stale response can repaint a newer Data Hub state.
- Input, tuner, custom-team, ghost, and season state survive their identified
  lifecycle edges correctly.
- A failed service-worker update preserves the prior healthy offline install.
- WebGPU resize fallback remains valid and all advertised lighting controls
  affect packed state and shader behavior.
- Test and validation tools fail on the defects they claim to detect.
- Verified comments and testing documentation match current behavior.
- Concurrent uncommitted work remains present and semantically intact.
