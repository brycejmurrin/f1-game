# Test suite review 2026-10-19 — pass-2 fix plans

Generated with `SYNTHESIS.md`. Each lane is one PR-sized owner session; OWNED globs are disjoint between lanes. A lane stays **draft** until every batch it draws from has a final report.

Model picks: the launch prompt named `.claude/skills/agent-fleet/references/launch-policy.md` §Model by task, but that section does not exist on this branch or the deploy tip (grep for "Model by task" finds nothing under `.claude/` or `docs/`). The picks below follow what does exist: lanes run Sonnet (memory `sessions-run-sonnet`), and a lane switched to Opus keeps the Sonnet cap (launch-policy.md). Opus is picked only where a lane must redesign a cross-backend file.

Every lane: one draft PR into the deploy branch, `Closes` nothing (the parent #2952 stays open until all lanes land), test-only unless the lane says otherwise; never widen a tolerance or quarantine to get green (AGENTS.md rule 9). A rewritten test must be shown to fail on the defect it targets (revert the guarded line locally, see red, restore).

## Order and dependencies

1. **L0 debugger + loader filenames first.** It gives every later lane line breakpoints in vm-loaded code (DBG-02) and the MCP on Node targets (DBG-01, #2957). Lanes that only fix vacuous asserts (S effort) may start in parallel; lanes converting source scans to behaviour wait for L0's helper change to land.
2. **L2 canary split before L3 and L5.** The canary holds TLX/WGX and perf pins that L3/L5 would otherwise both edit; L2 moves them into per-backend files that L3/L5 then own.
3. **L11 test lints last**: the lint for fixed `slice(x, x+N)` windows and asserts after `//` lands only after L2 and L5 have removed today's hits, so it lands green.
4. Independent, any order: L1 camera, L4 lighting, L6 XR, L7 flyby, L8 UI/CSS, L9 tooling misc, L10 physics and agent contracts.
5. **Product bugs found by tests go to their own issue**, not into a test lane's scope creep. The lane carries the test and the fix together, and each has a sub-issue of #2952: #2974 R1-01 (tuner scope buttons never set `aria-pressed`, L1), #2975 P2-13 (squeal double-gated, lock-up pitch never plays, L21), #2976 P2-15 (`carOrbit` reports the requested index after falling back, L1), #2977 U1-02 (two HUD defects pinned as `todo`; fix on cursor/hud-band-allocator-5e2c, so not `ready`; L20), #2978 U1-06 (gap chip at 9.95 s, L20).

## Lanes

### L0 — Debuggable vm code: preload, then absolute filenames (draft)

- **Goal:** every vm-loaded module carries an absolute filename, so file-path breakpoints and coverage reach it; the MCP half (#2957) is PR #2967 and is not this lane
- **Owned:** `tools/lib/<new: vm-debug-preload>.cjs`, `tests/helpers/fn-source.mjs`, `tests/helpers/game-source.mjs`, `tests/helpers/vm-page.js`, `tools/check/<new: vm-filename-lint>.mjs`, `docs/TESTING.md §Debug a Node test`
- **Closes:** DBG-01, DBG-02, DBG-03, DBG-04, DBG-05 (5 findings; effort S×3 M×2 L×0)
- **Draws from batches:** render-1, render-2, render-3, physics-1 — waiting on: render-3
- **Verify:** `node --test tests/unit/js-debugger-*.test.mjs && npm run test:tooling-fast`
- **Effort:** S (#2960) + M (#2961, ~460 mechanical call sites via codemod)
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`); DEBUGGER-B's Q3 table also picks Sonnet for #2960 and #2961
- **Depends on:** #2967 merged for DBG-01/04/05 (they close with it); #2960 before #2961; the helper migration touches tests/unit files other lanes own, so #2961 runs as a codemod-only PR AFTER the test lanes land, or each lane migrates its own files
- **PR slices:** #2960 preload + npm run debug:unit (S); #2962 docs: Debug a Node test (S); #2961 helper migration + vm-filename-lint (M, codemod, last)

### L1 — Camera tests behave, not scan (draft)

- **Goal:** camera tests drive the real rig on a curved track, the tuner scope bug is fixed with its test, and vacuous asserts are gone
- **Owned:** `tests/unit/cam-*.test.mjs`, `tests/unit/camera-*.test.mjs`, `tests/unit/free-cam.test.mjs`, `tests/unit/results-cam.test.mjs`, `tests/specs/camera*.spec.js`, `tests/helpers/camera-*.mjs (new)`, `js/camera/tuner-panel.js`
- **Closes:** R1-01, R1-03, R1-05, R1-07, R1-12, R1-14, R1-16, R1-18, R2-06, R3-12, P2-15, R2-28 (12 findings; effort S×8 M×4 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/cam-*.test.mjs tests/unit/camera-*.test.mjs tests/unit/free-cam.test.mjs tests/unit/results-cam.test.mjs && npm test -- tests/specs/camera-tuner.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L0 PR 2 for R1-07/R1-18 (behaviour conversions); the rest can start now
- **PR slices:** PR 1: R1-01 bug + test, R1-03, R2-06, R3-12 (S fixes); PR 2: shared curved-track fixture, R1-05, R1-07, R1-12, R1-14, R1-16, R1-18

### L2 — Split gfx-backend-canary; render contracts (draft)

- **Goal:** the 7k-line canary becomes per-behaviour files with honest names, `read()` names the file it reads, and fixed slice windows are gone
- **Owned:** `tests/unit/gfx-backend-canary.test.mjs`, `tests/unit/gfx-*.test.mjs (new splits)`, `tests/unit/render-final-contracts.test.mjs`, `tests/unit/renderer-boot-timeout.test.mjs`, `tests/unit/gfx-debug-overlay.test.mjs`, `tests/unit/render-lighting-prep.test.mjs`, `tests/specs/instanced-draw.spec.js`
- **Closes:** R2-02, R2-03, R2-12, R2-13, R2-16, R2-19, R3-13 (7 findings; effort S×5 M×1 L×1)
- **Draws from batches:** render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/gfx-*.test.mjs tests/unit/render-*.test.mjs tests/unit/renderer-boot-timeout.test.mjs && npm run gen:check && npm run test:tooling-fast`
- **Effort:** L (split is mechanical but 252 tests; budget two sessions)
- **Model:** claude-opus-5-5 — a 7k-line cross-backend file split where test identity and group membership must survive; it keeps the Sonnet cost cap (launch-policy.md, cost and context)
- **Depends on:** none; must land before L3/L5 touch moved pins
- **PR slices:** PR 1: mechanical split, no assertion changes (gen + groups.json rows); PR 2: slice windows → fnBody/span, read() fix, R2-12/R2-16/R2-19; PR 3: R2-13 delete, R3-13 frameContent

### L3 — TLX/WGX behaviour over text pins (draft)

- **Goal:** TLX and WGX tests run the lifted code on fake GL/GPU instead of matching source; WGX text pins move to one labelled file
- **Owned:** `tests/unit/tlx-*.test.mjs`, `tests/unit/hunt-tlx-*.test.mjs`, `tests/unit/webgpu-lifecycle.test.mjs`, `tests/unit/<new: wgx-source-pins>.test.mjs`, `tests/unit/tex-census.test.mjs`, `tests/unit/glx-resize-hysteresis.test.mjs`, `tests/unit/glx-occlusion.test.mjs`, `tests/unit/renderer-soft-lifecycle.test.mjs`, `tests/unit/road-lut-frame.test.mjs`, `tests/unit/three-inspector.test.mjs`, `tests/unit/wgsl-bindings.test.mjs`
- **Closes:** R2-08, R3-04, R3-05, R3-06, R3-15, R3-17, R2-32, R2-33, R2-38, R2-39, T5-27, T5-28 (12 findings; effort S×8 M×4 L×0)
- **Draws from batches:** render-2, render-3, tooling-5 — waiting on: render-3
- **Verify:** `node --test tests/unit/tlx-*.test.mjs tests/unit/hunt-tlx-*.test.mjs tests/unit/webgpu-lifecycle.test.mjs tests/unit/tex-census.test.mjs; a real WGSL compile needs gpu-census.yml (path rule render-wgx)`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L2 PR 1 (moved pins); L0 PR 2 helps R3-05/R3-06

### L4 — Lighting tests run the real LightStore (draft)

- **Goal:** preset and lamp tests run the real resolver and fail on NaN, missing geometry or a scoped run
- **Owned:** `tests/unit/light-*.test.mjs`, `tests/unit/lamp-*.test.mjs`, `tests/unit/lighting-*.test.mjs`, `tests/unit/night-washout-presets.test.mjs`, `tests/unit/image-grade-shaders.test.mjs`, `tests/specs/image-grade-visual.spec.js`
- **Closes:** R2-04, R2-07, R2-09, R2-14, R2-15, R2-20, R3-09, P1-20, R2-22, R2-25, R2-27, R2-30, R2-31 (13 findings; effort S×9 M×4 L×0)
- **Draws from batches:** render-1, render-2, render-3, physics-1 — waiting on: render-3
- **Verify:** `node --test tests/unit/light-*.test.mjs tests/unit/lamp-*.test.mjs tests/unit/lighting-*.test.mjs && npm test -- tests/specs/image-grade-visual.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none (lamp-fixture-anchor is a sweeps file: run `npm run test:sweeps` scope for R2-07)

### L5 — Perf and frame-time gates that can fail (draft)

- **Goal:** perf tests either gate on something real or are labelled telemetry; dead assert in perf-try fixed; globals restored
- **Owned:** `tests/unit/perf-*.test.mjs`, `tests/unit/render-rate.test.mjs`, `tests/unit/frame-*.test.mjs`, `tests/specs/perf-frametime.spec.js`, `tests/specs/perf-race-entry.spec.js`, `tests/helpers/perf-frametime.mjs`
- **Closes:** R1-04, R1-17, R2-01, R2-05, R2-11, R3-03, RC2-15, R2-26, R2-35, R2-40 (10 findings; effort S×8 M×2 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/perf-*.test.mjs tests/unit/render-rate.test.mjs tests/unit/frame-*.test.mjs && npm test -- tests/specs/perf-frametime.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L2 PR 1 if perf pins move; R2-01 (S) can go now
- **PR slices:** PR 1: R2-01, R2-05, R1-04 (S); PR 2: R3-03 decision (STRICT vs telemetry: ask Bryce), R2-11, R1-17

### L6 — XR asserts and gaps (draft)

- **Goal:** XR tests assert exact fallback reasons and the VR spec checks pause, pin and capture for real
- **Owned:** `tests/unit/xr-*.test.mjs`, `tests/specs/vr-emulated.spec.js`, `tests/specs/xr-plan.spec.js`, `tests/specs/presets.spec.js`
- **Closes:** R3-07, R3-10, R3-14, R3-18 (4 findings; effort S×3 M×1 L×0)
- **Draws from batches:** render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/xr-*.test.mjs && npm test -- tests/specs/vr-emulated.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none

### L7 — Flyby files: split the slow one, reconcile limits (ready to launch)

- **Goal:** flyby-shots leaves toolingFast in fast pieces, and the flyby audit has a negative control
- **Owned:** `tests/unit/flyby-*.test.mjs`, `tests/helpers/flyby-audit-rules.mjs`
- **Closes:** R1-06, R1-10, R1-11 (3 findings; effort S×2 M×1 L×0)
- **Draws from batches:** render-1
- **Verify:** `node --test tests/unit/flyby-*.test.mjs && npm run gen:check && npm run test:tooling-fast`
- **Effort:** S–M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none

### L8 — UI/CSS fit tests on cssRules; one formatter table (draft)

- **Goal:** tuner CSS fit checks parse rules instead of regex, contrast is computed, and every lap/race-clock formatter shares one table test
- **Owned:** `tests/unit/ui-fit-*.test.mjs`, `tests/unit/appearance-*.test.mjs`, `tests/unit/lap-format-rollover.test.mjs`, `tests/unit/css-*.test.mjs`
- **Closes:** R1-08, R2-21, R3-11, U1-08, U1-14 (5 findings; effort S×4 M×1 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/ui-fit-*.test.mjs tests/unit/appearance-*.test.mjs tests/unit/lap-format-rollover.test.mjs`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none

### L9 — Tooling tests on fixtures (draft)

- **Goal:** tooling tests run on fixtures instead of live repo state, misplaced smokes move home, local shader validation is honest
- **Owned:** `tests/unit/apex-memory.test.mjs`, `tests/unit/census-verdict.test.mjs`, `tests/unit/shader-validate.test.mjs`, `tests/unit/skill-render-ui-surface.test.mjs`, `tests/unit/game-tools-help.test.mjs`, `tests/unit/assets-pack.test.mjs`, `tests/unit/vertex-pack.test.mjs`, `tests/unit/elev-presets.test.mjs`, `tests/unit/change-driver-tools.test.mjs`, `tests/unit/vstd-invariant.test.mjs`, `tools/env/apex-memory.mjs`
- **Closes:** R1-02, R1-09, R1-13, R1-15, R2-10, R2-18, R3-16, P1-09, P1-23, P2-19, T5-20 (11 findings; effort S×10 M×1 L×0)
- **Draws from batches:** render-1, render-2, render-3, tooling-5 — waiting on: render-3
- **Verify:** `node --test tests/unit/apex-memory.test.mjs tests/unit/census-verdict.test.mjs tests/unit/shader-validate.test.mjs tests/unit/game-tools-help.test.mjs tests/unit/assets-pack.test.mjs tests/unit/elev-presets.test.mjs && npm run test:tooling-fast`
- **Effort:** S–M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** R2-10 touches lighting-tuner-sweep.test.mjs, which L4 owns: L9 adds the CASES to game-tools-help, L4 deletes them from lighting-tuner-sweep

### L10 — Player physics and collisions that can fail (draft)

- **Goal:** player-physics and collision tests assert the shipped behaviour (both walls, grass drag, scrub, contact extents) instead of test-local copies, and every 'loses speed' title asserts speed
- **Owned:** `tests/unit/wall-clamp.test.mjs`, `tests/unit/collision*.test.mjs`, `tests/unit/physics-rows-vm.test.mjs`, `tests/unit/player-forces.test.mjs`, `tests/unit/steer-lock-taper.test.mjs`, `tests/unit/grip-steer.test.mjs`, `tests/unit/trail-brake-turnin.test.mjs`, `tests/unit/tyre-peak-slip.test.mjs`, `tests/unit/tyre-model.test.mjs`, `tests/specs/longitudinal.spec.js`, `tests/specs/world-physics.spec.js`, `tests/specs/physics-boot.spec.js`, `tests/specs/physics-hotpath.spec.js`, `tests/specs/collisions-deep.spec.js`, `tests/specs/physics-fixes.spec.js`, `tests/specs/drift.spec.js`
- **Closes:** R3-08, P1-02, P1-03, P1-04, P1-05, P1-06, P1-08, P1-10, P1-11, P1-14, P1-15, P1-17, P1-19, P2-01, P2-02, P2-06, P2-07, P2-08, P2-09, P2-14, P2-18, P2-21 (22 findings; effort S×20 M×2 L×0)
- **Draws from batches:** render-3, physics-1, physics-2 — waiting on: render-3
- **Verify:** `node --test tests/unit/wall-clamp.test.mjs tests/unit/collision*.test.mjs tests/unit/physics-rows-vm.test.mjs tests/unit/player-forces.test.mjs tests/unit/steer-lock-taper.test.mjs tests/unit/grip-steer.test.mjs tests/unit/tyre-*.test.mjs; specs via node tools/ci/remote-group.mjs <group> on the pushed branch (longitudinal.spec alone is 556 s locally)`
- **Effort:** L (22 findings; three PRs)
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none; P1-17 (arc must not reach the driver) wants agent physics-contract-auditor first
- **PR slices:** PR 1: vacuous/tautology fixes in unit files (P1-02, P1-08, P1-10, P1-11, P1-19, P2-09); PR 2: collision contact + wall (R3-08, P1-03, P1-04, P1-06, P1-14, P2-06, P2-14); PR 3: specs (P2-01, P2-02, P2-07, P2-08, P2-21) + P1-05, P1-15, P1-17, P2-18

### L12 — Master physics gate, aero and ERS (ready to launch)

- **Goal:** the physics-characterization gate covers ERS, X-mode, wet, kerbs and AI beyond 4 Monza dry scenarios, its baseline blessing is provable, and aero/ERS specs assert what their titles promise
- **Owned:** `tests/specs/physics-characterization.spec.js`, `tests/unit/physics-characterization-vm.test.mjs`, `tests/unit/physics-baseline-provenance.test.mjs`, `tests/helpers/baseline-blessing.mjs`, `tests/unit/aero-*.test.mjs`, `tests/specs/aero-zones.spec.js`, `tests/specs/parts-ers.spec.js`
- **Closes:** P1-01, P1-13, P1-22, P2-03, P2-05, P2-11, P2-17 (7 findings; effort S×5 M×2 L×0)
- **Draws from batches:** physics-1, physics-2
- **Verify:** `node --test tests/unit/physics-characterization-vm.test.mjs tests/unit/physics-baseline-provenance.test.mjs tests/unit/aero-*.test.mjs && npm test -- tests/specs/physics-characterization.spec.js`
- **Effort:** M–L
- **Model:** claude-opus-5-5 — it widens the master gate that makes game.js extraction safe; scenario choice and baseline re-blessing are design calls; it keeps the Sonnet cost cap (launch-policy.md, cost and context)
- **Depends on:** none; a new baseline needs Bryce's blessing (re-bless is a ratchet-class change)

### L13 — Determinism, assets, persistence and untrusted-input contracts (draft)

- **Goal:** the determinism spec can fail, the assets spec reads real GL errors, the save-failed warning is proven to fire, and fuzzing asserts every shape branch
- **Owned:** `tests/specs/agent-determinism-frame.spec.js`, `tests/specs/assets-api.spec.js`, `tests/unit/persistence-vm.test.mjs`, `tests/unit/fuzz-untrusted-inputs.test.mjs`
- **Closes:** R3-01, R3-02, P1-07, P1-12 (4 findings; effort S×4 M×0 L×0)
- **Draws from batches:** render-3, physics-1 — waiting on: render-3
- **Verify:** `node --test tests/unit/persistence-vm.test.mjs tests/unit/fuzz-untrusted-inputs.test.mjs && npm test -- tests/specs/agent-determinism-frame.spec.js tests/specs/assets-api.spec.js`
- **Effort:** S–M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** #2963 (determinism bisect) helps R3-01 but is not required

### L14 — Input, steering and settings migration (ready to launch)

- **Goal:** steer-migration runs every old schema version (the only code that rewrites a player's saved settings), and steering/gamepad specs assert what they claim
- **Owned:** `tests/specs/steer-migration.spec.js`, `tests/specs/steering.spec.js`, `tests/specs/gamepad.spec.js`, `tests/unit/<new: input-curves>.test.mjs`
- **Closes:** P2-04, P2-10, P2-20, P2-22 (4 findings; effort S×3 M×1 L×0)
- **Draws from batches:** physics-2
- **Verify:** `npm test -- tests/specs/steer-migration.spec.js tests/specs/steering.spec.js tests/specs/gamepad.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none; physics-2's chain C never read steer-migration/gamepad results, so re-run them first

### L15 — Race session, quali, start and radio (draft)

- **Goal:** race-session, quali, start-light and radio tests run the shipped code (no copied announce queue or step accounting, no game.js regex for sector maths)
- **Owned:** `tests/unit/race-session-*.test.mjs`, `tests/unit/race-settings-vm.test.mjs`, `tests/unit/race-radio.test.mjs`, `tests/unit/start-lights.test.mjs`, `tests/unit/race-step-snap.test.mjs`, `tests/unit/brake-cue.test.mjs`, `tests/unit/quali-persist.test.mjs`, `tests/specs/quali.spec.js`, `tests/specs/jump-start.spec.js`, `tests/unit/tt-lap-validity-vm.test.mjs`
- **Closes:** RC2-03, RC2-04, RC2-09, RC2-10, RC2-11, RC2-12, RC2-14, RC2-16, RC2-18, P1-18, P1-21, T5-23 (12 findings; effort S×6 M×6 L×0)
- **Draws from batches:** physics-1, race-2, tooling-5 — waiting on: race-2
- **Verify:** `node --test tests/unit/race-session-*.test.mjs tests/unit/race-settings-vm.test.mjs tests/unit/race-radio.test.mjs tests/unit/start-lights.test.mjs tests/unit/brake-cue.test.mjs tests/unit/quali-persist.test.mjs && npm test -- tests/specs/jump-start.spec.js`
- **Effort:** M–L
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** race-2 part 2 (spec debugger column) before the spec slice

### L16 — Weather, real-race replay and debris (draft)

- **Goal:** weather tests assert the arc not their own arithmetic, real-race laps-down is checked, and the debris wall-hit flake is root-caused
- **Owned:** `tests/unit/weather-*.test.mjs`, `tests/unit/storm-weather.test.mjs`, `tests/unit/real-race.test.mjs`, `tests/specs/debris.spec.js`, `tests/unit/wind.test.mjs`
- **Closes:** RC2-05, RC2-07, RC2-08, RC2-17, T5-19 (5 findings; effort S×5 M×0 L×0)
- **Draws from batches:** race-2, tooling-5 — waiting on: race-2
- **Verify:** `node --test tests/unit/weather-*.test.mjs tests/unit/storm-weather.test.mjs tests/unit/real-race.test.mjs && npm test -- tests/specs/debris.spec.js (run 5×; AGENTS rule 9: a retry-pass is a red)`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none

### L17 — Track geometry tests that bite (draft)

- **Goal:** terrain/normal tests fail under the mutations the reviewer tried (TRI_EPS=0, banking() called per sample), and foundation overlap checks have no blind band
- **Owned:** `tests/unit/terrain-*.test.mjs`, `tests/specs/bahrain-foundation.spec.js`, `tests/specs/terrain-over-road.spec.js`
- **Closes:** RC2-01, RC2-02, RC2-13, RC2-19, RC2-20, RC2-21 (6 findings; effort S×5 M×1 L×0)
- **Draws from batches:** race-2 — waiting on: race-2
- **Verify:** `node --test tests/unit/terrain-*.test.mjs && node tools/track/verify-track.cjs bahrain && npm test -- tests/specs/bahrain-foundation.spec.js`
- **Effort:** S–M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** tracks-1/tracks-2 reports may add rows here

### L18 — Career tests on the real modules (draft)

- **Goal:** career tests load career-planning.js and real Teams/Hash32, guard loops against empty lists, and cover facility/money/reliability paths players hit
- **Owned:** `tests/unit/career-*.test.mjs`, `tests/unit/reliability.test.mjs`
- **Closes:** C1-01, C1-03, C1-04, C1-07, C1-11, C1-16, C1-17, RC2-06 (8 findings; effort S×5 M×3 L×0)
- **Draws from batches:** race-2, car-1 — waiting on: race-2
- **Verify:** `node --test tests/unit/career-*.test.mjs tests/unit/reliability.test.mjs`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** modes-1 report may add career rows

### L19 — Car render, garage and livery (ready to launch)

- **Goal:** car and garage tests run the mesh/material builders instead of ~370 source pins, hidden-class asserts are unconditional, and garage specs can fail
- **Owned:** `tests/unit/car-*.test.mjs`, `tests/unit/garage-*.test.mjs`, `tests/unit/crest-marks.test.mjs`, `tests/unit/carve-a-modules.test.mjs`, `tests/unit/finish-coast-rev-vm.test.mjs`, `tests/specs/garage-aero.spec.js`, `tests/specs/parts-persistence.spec.js`, `tests/unit/surface-id-parity.test.mjs`
- **Closes:** C1-02, C1-05, C1-06, C1-08, C1-09, C1-10, C1-12, C1-13, C1-14, C1-15, C1-18, P2-12, P2-16, T5-18 (14 findings; effort S×8 M×4 L×2)
- **Draws from batches:** physics-1, physics-2, car-1, tooling-5
- **Verify:** `node --test tests/unit/car-*.test.mjs tests/unit/garage-*.test.mjs tests/unit/crest-marks.test.mjs tests/unit/carve-a-modules.test.mjs && npm test -- tests/specs/garage-aero.spec.js`
- **Effort:** L (car-presentation-canary split is the bulk)
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** car-2 report may add rows; L2's canary-split pattern is the template

### L20 — HUD, data hub and i18n (ready to launch)

- **Goal:** HUD tests drive the real layout on the phone profile (844x390), the two todo-pinned HUD bugs are fixed or tracked, and copied helpers are imported
- **Owned:** `tests/unit/hud-*.test.mjs`, `tests/unit/dock-layout.test.mjs`, `tests/unit/meeting-picker-labels.test.mjs`, `tests/unit/a11y-*.test.mjs`, `tests/unit/i18n.test.mjs`, `tests/unit/loading-screen-*.test.mjs`
- **Closes:** U1-01, U1-02, U1-03, U1-05, U1-06, U1-07, U1-09, U1-10, U1-11, U1-12, U1-13, U1-15, U1-16, U1-17 (14 findings; effort S×9 M×5 L×0)
- **Draws from batches:** ui-1
- **Verify:** `node --test tests/unit/hud-*.test.mjs tests/unit/dock-layout.test.mjs tests/unit/meeting-picker-labels.test.mjs tests/unit/a11y-*.test.mjs tests/unit/i18n.test.mjs`
- **Effort:** M–L
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** U1-02's fixes live on unmerged branch cursor/hud-band-allocator-5e2c: land that PR first, then flip the todo tests to real asserts; ui-2 report may add rows

### L21 — Audio paths the race actually takes (ready to launch)

- **Goal:** audio tests call GameAudio the way the race does (scalar skid, pause/resume), so the double-gated squeal and lock-up pitch are caught
- **Owned:** `tests/unit/tyre-squeal-slip.test.mjs`, `tests/unit/pause-silence.test.mjs`, `tests/unit/wind-speed.test.mjs`
- **Closes:** P2-13, U1-04, T5-21 (3 findings; effort S×3 M×0 L×0)
- **Draws from batches:** physics-2, ui-1, car-1, tooling-5
- **Verify:** `node --test tests/unit/tyre-squeal-slip.test.mjs tests/unit/pause-silence.test.mjs`
- **Effort:** S (test) + a product fix for P2-13
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** audio-1 report pending; P2-13 is a product bug: open a sub-issue

### L22 — Tooling CLI tests that can fail (ready to launch)

- **Goal:** tool tests run their CLI on fixtures and assert outcomes: no shared-Map tautologies, no live-repo `doesNotMatch`, no CI-absent skips, untested branches of tooling-fast and test-bg covered
- **Owned:** `tests/unit/verify-live.test.mjs`, `tests/unit/validation-cli.test.mjs`, `tests/unit/test-observed.test.mjs`, `tests/unit/tumftm-import.test.mjs`, `tests/unit/trim-comments.test.mjs`, `tests/unit/wake-lock-vm.test.mjs`, `tests/unit/who-is-on-it.test.mjs`, `tests/unit/workflow-lint.test.mjs`, `tests/unit/tools-runnable.test.mjs`, `tests/unit/test-groups.test.mjs`, `tests/unit/sweep-shards.test.mjs`, `tests/unit/twinned-specs.test.mjs`, `tests/unit/sync-pr-robust.test.mjs`, `tests/unit/tools-a12-guards.test.mjs`, `tests/unit/tooling-fast-runner.test.mjs`, `tests/unit/test-bg-outcome.test.mjs`, `tests/unit/twin-fidelity.test.mjs`, `tests/unit/viewer.test.mjs`
- **Closes:** T5-04, T5-05, T5-06, T5-07, T5-08, T5-09, T5-10, T5-11, T5-12, T5-13, T5-14, T5-15, T5-17, T5-22, T5-24, T5-25, T5-26, T5-29, T5-30 (19 findings; effort S×15 M×4 L×0)
- **Draws from batches:** tooling-5
- **Verify:** `npm run test:tooling-fast (every owned file is a node unit test)`
- **Effort:** M (18 files, mostly S each)
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none; T5-30 (split validation-cli) needs a tests/groups.json row per new file + `npm run gen`
- **PR slices:** PR 1: T5-04, T5-05, T5-06, T5-08, T5-10, T5-15 (dead or always-true asserts); PR 2: T5-07, T5-09, T5-11–T5-14, T5-17, T5-22, T5-24–T5-26, T5-29, T5-30 (coverage gaps, split)

### L23 — Yaw, throttle and traffic scanners on the real code (ready to launch)

- **Goal:** yaw and throttle tests assert the quantity the title names, and the traffic-arc equivalence test runs the production scanTow/scanOtAhead instead of two in-test copies
- **Owned:** `tests/unit/traffic-arc-buckets.test.mjs`, `tests/unit/yaw-low-speed-substep.test.mjs`, `tests/unit/yaw-damp-speed.test.mjs`, `tests/unit/throttle-latch.test.mjs`
- **Closes:** T5-01, T5-02, T5-03, T5-16 (4 findings; effort S×3 M×1 L×0)
- **Draws from batches:** tooling-5
- **Verify:** `node --test tests/unit/traffic-arc-buckets.test.mjs tests/unit/yaw-low-speed-substep.test.mjs tests/unit/yaw-damp-speed.test.mjs tests/unit/throttle-latch.test.mjs`
- **Effort:** S
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none; T5-01's copies drop finished cars that collide.js keeps: the rewrite must show red against a copy that skips finished cars

### L11 — Test-tree lints (draft)

- **Goal:** tools/check lints stop the recurring patterns at commit time: fixed slice windows, asserts after //, vm.run* without filename, `>= 0` / always-true asserts
- **Owned:** `tools/check/<new: test-pattern-lint>.mjs`, `tests/unit/<new: test-pattern-lint>.test.mjs`
- **Closes:**  (0 findings; effort S×0 M×0 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/<new: test-pattern-lint>.test.mjs && npm run test:guards`
- **Effort:** S
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L2, L5 and L0 PR 2 landed (so the lint lands green)
