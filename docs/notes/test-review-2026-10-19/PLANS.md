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
- **Owned:** `tools/lib/<new: vm-debug-preload>.cjs`, `tests/helpers/fn-source.mjs`, `tests/helpers/game-source.mjs`, `tests/helpers/vm-page.js`, `tools/check/<new: vm-filename-lint>.mjs`, `docs/TESTING.md §Debug a Node test`, `tests/unit/js-debugger-mcp.test.mjs`
- **Closes:** DBG-01, DBG-02, DBG-03, DBG-04, DBG-05, T3-15 (6 findings; effort S×4 M×2 L×0)
- **Draws from batches:** render-1, render-2, render-3, physics-1, tooling-3 — waiting on: render-3, tooling-3
- **Verify:** `node --test tests/unit/js-debugger-*.test.mjs && npm run test:tooling-fast`
- **Effort:** S (#2960) + M (#2961, ~460 mechanical call sites via codemod)
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`); DEBUGGER-B's Q3 table also picks Sonnet for #2960 and #2961
- **Depends on:** #2967 merged for DBG-01/04/05 (they close with it); #2960 before #2961; the helper migration touches tests/unit files other lanes own, so #2961 runs as a codemod-only PR AFTER the test lanes land, or each lane migrates its own files
- **PR slices:** #2960 preload + npm run debug:unit (S); #2962 docs: Debug a Node test (S); #2961 helper migration + vm-filename-lint (M, codemod, last)

### L1 — Camera tests behave, not scan (draft)

- **Goal:** camera tests drive the real rig on a curved track, the tuner scope bug is fixed with its test, and vacuous asserts are gone
- **Owned:** `tests/unit/cam-*.test.mjs`, `tests/unit/camera-*.test.mjs`, `tests/unit/free-cam.test.mjs`, `tests/unit/results-cam.test.mjs`, `tests/specs/camera*.spec.js`, `tests/helpers/camera-*.mjs (new)`, `js/camera/tuner-panel.js`, `tests/unit/extra-rigs.test.mjs`, `tests/specs/camera-hooks.spec.js`
- **Closes:** R1-01, R1-03, R1-05, R1-07, R1-12, R1-14, R1-16, R1-18, R2-06, R3-12, P2-15, R2-28, T2-29, R3-22 (14 findings; effort S×10 M×4 L×0)
- **Draws from batches:** render-1, render-2, render-3, tooling-2 — waiting on: render-3
- **Verify:** `node --test tests/unit/cam-*.test.mjs tests/unit/camera-*.test.mjs tests/unit/free-cam.test.mjs tests/unit/results-cam.test.mjs && npm test -- tests/specs/camera-tuner.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L0 PR 2 for R1-07/R1-18 (behaviour conversions); the rest can start now
- **PR slices:** PR 1: R1-01 bug + test, R1-03, R2-06, R3-12 (S fixes); PR 2: shared curved-track fixture, R1-05, R1-07, R1-12, R1-14, R1-16, R1-18

### L2 — Split gfx-backend-canary; render contracts (draft)

- **Goal:** the 7k-line canary becomes per-behaviour files with honest names, `read()` names the file it reads, and fixed slice windows are gone
- **Owned:** `tests/unit/gfx-backend-canary.test.mjs`, `tests/unit/gfx-*.test.mjs (new splits)`, `tests/unit/render-final-contracts.test.mjs`, `tests/unit/renderer-boot-timeout.test.mjs`, `tests/unit/gfx-debug-overlay.test.mjs`, `tests/unit/render-lighting-prep.test.mjs`, `tests/specs/instanced-draw.spec.js`, `tests/specs/material-shimmer.spec.js`, `tests/specs/render-boot.spec.js`, `tests/specs/webgl-probes.spec.js`, `tests/unit/backend-surface-parity.test.mjs`
- **Closes:** R2-02, R2-03, R2-12, R2-13, R2-16, R2-19, R3-13, T1-17, R3-23, R3-27, R3-28 (11 findings; effort S×8 M×2 L×1)
- **Draws from batches:** render-2, render-3, tooling-1 — waiting on: render-3, tooling-1
- **Verify:** `node --test tests/unit/gfx-*.test.mjs tests/unit/render-*.test.mjs tests/unit/renderer-boot-timeout.test.mjs && npm run gen:check && npm run test:tooling-fast`
- **Effort:** L (split is mechanical but 252 tests; budget two sessions)
- **Model:** claude-opus-5-5 — a 7k-line cross-backend file split where test identity and group membership must survive; it keeps the Sonnet cost cap (launch-policy.md, cost and context)
- **Depends on:** none; must land before L3/L5 touch moved pins
- **PR slices:** PR 1: mechanical split, no assertion changes (gen + groups.json rows); PR 2: slice windows → fnBody/span, read() fix, R2-12/R2-16/R2-19; PR 3: R2-13 delete, R3-13 frameContent

### L3 — TLX/WGX behaviour over text pins (draft)

- **Goal:** TLX and WGX tests run the lifted code on fake GL/GPU instead of matching source; WGX text pins move to one labelled file
- **Owned:** `tests/unit/tlx-*.test.mjs`, `tests/unit/hunt-tlx-*.test.mjs`, `tests/unit/webgpu-lifecycle.test.mjs`, `tests/unit/<new: wgx-source-pins>.test.mjs`, `tests/unit/tex-census.test.mjs`, `tests/unit/glx-resize-hysteresis.test.mjs`, `tests/unit/glx-occlusion.test.mjs`, `tests/unit/renderer-soft-lifecycle.test.mjs`, `tests/unit/road-lut-frame.test.mjs`, `tests/unit/three-inspector.test.mjs`, `tests/unit/wgsl-bindings.test.mjs`, `tests/specs/tlx-probes.spec.js`
- **Closes:** R2-08, R3-04, R3-05, R3-06, R3-15, R3-17, R2-32, R2-33, R2-38, R2-39, T5-27, T5-28, R3-19, R3-20 (14 findings; effort S×10 M×4 L×0)
- **Draws from batches:** render-2, render-3, tooling-5 — waiting on: render-3
- **Verify:** `node --test tests/unit/tlx-*.test.mjs tests/unit/hunt-tlx-*.test.mjs tests/unit/webgpu-lifecycle.test.mjs tests/unit/tex-census.test.mjs; a real WGSL compile needs gpu-census.yml (path rule render-wgx)`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L2 PR 1 (moved pins); L0 PR 2 helps R3-05/R3-06

### L4 — Lighting tests run the real LightStore (draft)

- **Goal:** preset and lamp tests run the real resolver and fail on NaN, missing geometry or a scoped run
- **Owned:** `tests/unit/light-*.test.mjs`, `tests/unit/lamp-*.test.mjs`, `tests/unit/lighting-*.test.mjs`, `tests/unit/night-washout-presets.test.mjs`, `tests/unit/image-grade-shaders.test.mjs`, `tests/specs/image-grade-visual.spec.js`, `tests/unit/slider-effect.test.mjs`, `tests/unit/day-sky-palette-storm-deck.test.mjs`, `tests/specs/lighting-ab.spec.js`, `tests/unit/ambient-env-override.test.mjs`
- **Closes:** R2-04, R2-07, R2-09, R2-14, R2-15, R2-20, R3-09, P1-20, R2-22, R2-25, R2-27, R2-30, R2-31, T4-05, T4-17, T2-07, T1-22, R3-25 (18 findings; effort S×13 M×5 L×0)
- **Draws from batches:** render-1, render-2, render-3, physics-1, tooling-4, tooling-2, tooling-1 — waiting on: render-3, tooling-1
- **Verify:** `node --test tests/unit/light-*.test.mjs tests/unit/lamp-*.test.mjs tests/unit/lighting-*.test.mjs && npm test -- tests/specs/image-grade-visual.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none (lamp-fixture-anchor is a sweeps file: run `npm run test:sweeps` scope for R2-07)

### L5 — Perf and frame-time gates that can fail (draft)

- **Goal:** perf tests either gate on something real or are labelled telemetry; dead assert in perf-try fixed; globals restored
- **Owned:** `tests/unit/perf-*.test.mjs`, `tests/unit/render-rate.test.mjs`, `tests/unit/frame-*.test.mjs`, `tests/specs/perf-frametime.spec.js`, `tests/specs/perf-race-entry.spec.js`, `tests/helpers/perf-frametime.mjs`, `tests/unit/ribbon-cpu-release.test.mjs`, `tests/unit/chunked-index-ranges.test.mjs`, `tests/unit/field-lod.test.mjs`, `tests/specs/image-grade-visual.spec.js`
- **Closes:** R1-04, R1-17, R2-01, R2-05, R2-11, R3-03, RC2-15, R2-26, R2-35, R2-40, T4-12, T2-19, T2-24, R3-26 (14 findings; effort S×10 M×4 L×0)
- **Draws from batches:** render-1, render-2, render-3, tooling-4, tooling-2 — waiting on: render-3
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
- **Owned:** `tests/unit/ui-fit-*.test.mjs`, `tests/unit/appearance-*.test.mjs`, `tests/unit/lap-format-rollover.test.mjs`, `tests/unit/css-*.test.mjs`, `tests/unit/scroll-strips.test.mjs`, `tests/unit/component-inventory.test.mjs`, `tests/unit/cvd-palette.test.mjs`, `tests/unit/delta-sign-colour.test.mjs`, `tests/unit/apca-timing.test.mjs`
- **Closes:** R1-08, R2-21, R3-11, U1-08, U1-14, T4-13, T2-04, T2-18, T2-20, T1-13 (10 findings; effort S×9 M×1 L×0)
- **Draws from batches:** render-1, render-2, render-3, tooling-4, tooling-2, tooling-1 — waiting on: render-3, tooling-1
- **Verify:** `node --test tests/unit/ui-fit-*.test.mjs tests/unit/appearance-*.test.mjs tests/unit/lap-format-rollover.test.mjs`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none

### L9 — Tooling tests on fixtures (draft)

- **Goal:** tooling tests run on fixtures instead of live repo state, misplaced smokes move home, local shader validation is honest
- **Owned:** `tests/unit/apex-memory.test.mjs`, `tests/unit/census-verdict.test.mjs`, `tests/unit/shader-validate.test.mjs`, `tests/unit/skill-render-ui-surface.test.mjs`, `tests/unit/game-tools-help.test.mjs`, `tests/unit/assets-pack.test.mjs`, `tests/unit/vertex-pack.test.mjs`, `tests/unit/elev-presets.test.mjs`, `tests/unit/change-driver-tools.test.mjs`, `tests/unit/vstd-invariant.test.mjs`, `tools/env/apex-memory.mjs`, `tests/unit/desktop-app-protocol.test.mjs`, `tests/unit/desktop-native.test.mjs`
- **Closes:** R1-02, R1-09, R1-13, R1-15, R2-10, R2-18, R3-16, P1-09, P1-23, P2-19, T5-20, T2-14, T2-22 (13 findings; effort S×10 M×3 L×0)
- **Draws from batches:** render-1, render-2, render-3, tooling-5, tooling-2 — waiting on: render-3
- **Verify:** `node --test tests/unit/apex-memory.test.mjs tests/unit/census-verdict.test.mjs tests/unit/shader-validate.test.mjs tests/unit/game-tools-help.test.mjs tests/unit/assets-pack.test.mjs tests/unit/elev-presets.test.mjs && npm run test:tooling-fast`
- **Effort:** S–M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** R2-10 touches lighting-tuner-sweep.test.mjs, which L4 owns: L9 adds the CASES to game-tools-help, L4 deletes them from lighting-tuner-sweep

### L10 — Player physics and collisions that can fail (draft)

- **Goal:** player-physics and collision tests assert the shipped behaviour (both walls, grass drag, scrub, contact extents) instead of test-local copies, and every 'loses speed' title asserts speed
- **Owned:** `tests/unit/wall-clamp.test.mjs`, `tests/unit/collision*.test.mjs`, `tests/unit/physics-rows-vm.test.mjs`, `tests/unit/player-forces.test.mjs`, `tests/unit/steer-lock-taper.test.mjs`, `tests/unit/grip-steer.test.mjs`, `tests/unit/trail-brake-turnin.test.mjs`, `tests/unit/tyre-peak-slip.test.mjs`, `tests/unit/tyre-model.test.mjs`, `tests/specs/longitudinal.spec.js`, `tests/specs/world-physics.spec.js`, `tests/specs/physics-boot.spec.js`, `tests/specs/physics-hotpath.spec.js`, `tests/specs/collisions-deep.spec.js`, `tests/specs/physics-fixes.spec.js`, `tests/specs/drift.spec.js`, `tests/unit/speed-coupling.test.mjs`, `tests/specs/offtrack.spec.js`, `tests/unit/contact-geometry.test.mjs`, `tests/unit/damage.test.mjs`, `tests/unit/dirty-air.test.mjs`
- **Closes:** R3-08, P1-02, P1-03, P1-04, P1-05, P1-06, P1-08, P1-10, P1-11, P1-14, P1-15, P1-17, P1-19, P2-01, P2-02, P2-06, P2-07, P2-08, P2-09, P2-14, P2-18, P2-21, T4-11, T2-11, T2-21, T2-30, TK2-18 (27 findings; effort S×25 M×2 L×0)
- **Draws from batches:** render-3, physics-1, physics-2, tooling-4, tooling-2, tracks-2 — waiting on: render-3, tracks-2
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
- **Owned:** `tests/specs/agent-determinism-frame.spec.js`, `tests/specs/assets-api.spec.js`, `tests/unit/persistence-vm.test.mjs`, `tests/unit/fuzz-untrusted-inputs.test.mjs`, `tests/unit/store-cross-tab.test.mjs`, `tests/unit/store-registry.test.mjs`, `tests/unit/episode-transients.test.mjs`, `tests/unit/html-sink-lint.test.mjs`, `tests/unit/load-order.test.mjs`
- **Closes:** R3-01, R3-02, P1-07, P1-12, T4-14, T4-15, T2-09, T3-14, T3-19 (9 findings; effort S×8 M×1 L×0)
- **Draws from batches:** render-3, physics-1, tooling-4, tooling-2, tooling-3 — waiting on: render-3, tooling-3
- **Verify:** `node --test tests/unit/persistence-vm.test.mjs tests/unit/fuzz-untrusted-inputs.test.mjs && npm test -- tests/specs/agent-determinism-frame.spec.js tests/specs/assets-api.spec.js`
- **Effort:** S–M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** #2963 (determinism bisect) helps R3-01 but is not required

### L14 — Input, steering and settings migration (ready to launch)

- **Goal:** steer-migration runs every old schema version (the only code that rewrites a player's saved settings), and steering/gamepad specs assert what they claim
- **Owned:** `tests/specs/steer-migration.spec.js`, `tests/specs/steering.spec.js`, `tests/specs/gamepad.spec.js`, `tests/unit/<new: input-curves>.test.mjs`
- **Closes:** P2-04, P2-10, P2-20, P2-22, P2-24 (5 findings; effort S×3 M×2 L×0)
- **Draws from batches:** physics-2
- **Verify:** `npm test -- tests/specs/steer-migration.spec.js tests/specs/steering.spec.js tests/specs/gamepad.spec.js`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none; physics-2's chain C never read steer-migration/gamepad results, so re-run them first

### L15 — Race session, quali, start and radio (draft)

- **Goal:** race-session, quali, start-light and radio tests run the shipped code (no copied announce queue or step accounting, no game.js regex for sector maths)
- **Owned:** `tests/unit/race-session-*.test.mjs`, `tests/unit/race-settings-vm.test.mjs`, `tests/unit/race-radio.test.mjs`, `tests/unit/start-lights.test.mjs`, `tests/unit/race-step-snap.test.mjs`, `tests/unit/brake-cue.test.mjs`, `tests/unit/quali-persist.test.mjs`, `tests/specs/quali.spec.js`, `tests/specs/jump-start.spec.js`, `tests/unit/tt-lap-validity-vm.test.mjs`, `tests/unit/duel-row.test.mjs`, `tests/unit/event-journal.test.mjs`, `tests/unit/ot-ahead-scan-gate.test.mjs`
- **Closes:** RC2-03, RC2-04, RC2-09, RC2-10, RC2-11, RC2-12, RC2-14, RC2-16, RC2-18, P1-18, P1-21, T5-23, T2-06, T2-13, T3-06 (15 findings; effort S×7 M×8 L×0)
- **Draws from batches:** physics-1, race-2, tooling-5, tooling-2, tooling-3 — waiting on: race-2, tooling-3
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
- **Owned:** `tests/unit/terrain-*.test.mjs`, `tests/specs/bahrain-foundation.spec.js`, `tests/specs/terrain-over-road.spec.js`, `tests/unit/road-under-floor.test.mjs`, `tests/specs/tracks-walls-a.spec.js`, `tests/specs/tracks-walls.spec.js`, `tests/unit/coplanar-faces.test.mjs`, `tests/unit/curvature-channels.test.mjs`, `tests/unit/kerb-berm-surface.test.mjs`, `tests/unit/shared-track-foundation-characterization.test.cjs`, `tests/unit/track-foundation.test.mjs`, `tests/unit/track-retained-state.test.mjs`, `tests/unit/track-themes-build.test.mjs`, `tests/specs/projection.spec.js`
- **Closes:** RC2-01, RC2-02, RC2-13, RC2-19, RC2-20, RC2-21, T4-04, T2-25, T2-26, TK1-11, TK1-14, TK1-23, TK2-02, TK2-09, TK2-11, TK2-15, R3-21 (17 findings; effort S×11 M×6 L×0)
- **Draws from batches:** race-2, tooling-4, tooling-2, tracks-1, tracks-2, render-3 — waiting on: race-2, tracks-2, render-3
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

### L19 — Car render, garage and livery (draft)

- **Goal:** car and garage tests run the mesh/material builders instead of ~370 source pins, hidden-class asserts are unconditional, and garage specs can fail
- **Owned:** `tests/unit/car-*.test.mjs`, `tests/unit/garage-*.test.mjs`, `tests/unit/crest-marks.test.mjs`, `tests/unit/carve-a-modules.test.mjs`, `tests/unit/finish-coast-rev-vm.test.mjs`, `tests/specs/garage-aero.spec.js`, `tests/specs/parts-persistence.spec.js`, `tests/unit/surface-id-parity.test.mjs`, `tests/unit/setup-preview-hull.test.mjs`, `tests/specs/livery-sidewall.spec.js`, `tests/unit/fill-gating.test.mjs`, `tests/unit/livery-cover-graphics.test.mjs`, `tests/specs/parts-factory-presets.spec.js`
- **Closes:** C1-02, C1-05, C1-06, C1-08, C1-09, C1-10, C1-12, C1-13, C1-14, C1-15, C1-18, P2-12, P2-16, T5-18, T4-02, T2-15, TK1-04, TK2-07, R3-24 (19 findings; effort S×13 M×4 L×2)
- **Draws from batches:** physics-1, physics-2, car-1, tooling-5, tooling-4, tooling-2, tracks-1, tracks-2, render-3 — waiting on: tracks-2, render-3
- **Verify:** `node --test tests/unit/car-*.test.mjs tests/unit/garage-*.test.mjs tests/unit/crest-marks.test.mjs tests/unit/carve-a-modules.test.mjs && npm test -- tests/specs/garage-aero.spec.js`
- **Effort:** L (car-presentation-canary split is the bulk)
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** car-2 report may add rows; L2's canary-split pattern is the template

### L20 — HUD, data hub and i18n (draft)

- **Goal:** HUD tests drive the real layout on the phone profile (844x390), the two todo-pinned HUD bugs are fixed or tracked, and copied helpers are imported
- **Owned:** `tests/unit/hud-*.test.mjs`, `tests/unit/dock-layout.test.mjs`, `tests/unit/meeting-picker-labels.test.mjs`, `tests/unit/a11y-*.test.mjs`, `tests/unit/i18n.test.mjs`, `tests/unit/loading-screen-*.test.mjs`, `tests/unit/captions.test.mjs`, `tests/unit/metrics.test.mjs`
- **Closes:** U1-01, U1-02, U1-03, U1-05, U1-06, U1-07, U1-09, U1-10, U1-11, U1-12, U1-13, U1-15, U1-16, U1-17, T1-09, T3-05 (16 findings; effort S×11 M×5 L×0)
- **Draws from batches:** ui-1, tooling-1, tooling-3 — waiting on: tooling-1, tooling-3
- **Verify:** `node --test tests/unit/hud-*.test.mjs tests/unit/dock-layout.test.mjs tests/unit/meeting-picker-labels.test.mjs tests/unit/a11y-*.test.mjs tests/unit/i18n.test.mjs`
- **Effort:** M–L
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** U1-02's fixes live on unmerged branch cursor/hud-band-allocator-5e2c: land that PR first, then flip the todo tests to real asserts; ui-2 report may add rows

### L21 — Audio paths the race actually takes (draft)

- **Goal:** audio tests call GameAudio the way the race does (scalar skid, pause/resume), so the double-gated squeal and lock-up pitch are caught
- **Owned:** `tests/unit/tyre-squeal-slip.test.mjs`, `tests/unit/pause-silence.test.mjs`, `tests/unit/wind-speed.test.mjs`, `tests/unit/fake-audio-vm.cjs`, `tests/unit/rival-contact-sfx.test.mjs`, `tests/unit/audio-*.test.mjs`, `tests/unit/spotify-refresh.test.mjs`, `tests/unit/career-data-audio-improvements.test.mjs`, `tests/specs/audio-smoke.spec.js`, `tests/specs/music-library.spec.js`, `tests/unit/lazy-audio-yield.test.mjs`, `tests/unit/end-race-music-vm.test.mjs`, `tests/unit/crowd-audio.test.mjs`, `tests/unit/announcer.test.mjs`, `tests/unit/blip-voice-pool.test.mjs`, `tests/unit/mix-duck-radio.test.mjs`, `tests/unit/radio-voice.test.mjs`, `tests/unit/voice-pack.test.mjs`
- **Closes:** P2-13, U1-04, T5-21, A1-01, A1-02, A1-03, A1-04, A1-05, A1-06, A1-07, A1-08, A1-09, A1-10, A1-11, A1-12, A1-13, A1-14, A1-16, A1-17, A1-18, A1-19, A1-20, A1-21, A1-22, T1-04, T3-08, N1-04, N1-11, N1-15 (29 findings; effort S×19 M×10 L×0)
- **Draws from batches:** physics-2, ui-1, car-1, tooling-5, audio-1, tooling-1, tooling-3, net — waiting on: tooling-1, tooling-3, net
- **Verify:** `node --test tests/unit/tyre-squeal-slip.test.mjs tests/unit/pause-silence.test.mjs`
- **Effort:** S (test) + a product fix for P2-13
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** audio-1 report pending; P2-13 is a product bug: open a sub-issue

### L22 — Tooling CLI tests that can fail (draft)

- **Goal:** tool tests run their CLI on fixtures and assert outcomes: no shared-Map tautologies, no live-repo `doesNotMatch`, no CI-absent skips, untested branches of tooling-fast and test-bg covered
- **Owned:** `tests/unit/verify-live.test.mjs`, `tests/unit/validation-cli.test.mjs`, `tests/unit/test-observed.test.mjs`, `tests/unit/tumftm-import.test.mjs`, `tests/unit/trim-comments.test.mjs`, `tests/unit/wake-lock-vm.test.mjs`, `tests/unit/who-is-on-it.test.mjs`, `tests/unit/workflow-lint.test.mjs`, `tests/unit/tools-runnable.test.mjs`, `tests/unit/test-groups.test.mjs`, `tests/unit/sweep-shards.test.mjs`, `tests/unit/twinned-specs.test.mjs`, `tests/unit/sync-pr-robust.test.mjs`, `tests/unit/tools-a12-guards.test.mjs`, `tests/unit/tooling-fast-runner.test.mjs`, `tests/unit/test-bg-outcome.test.mjs`, `tests/unit/twin-fidelity.test.mjs`, `tests/unit/viewer.test.mjs`, `tests/unit/dev-tools-vm.test.mjs`, `tests/unit/diagnostics-tools.test.mjs`, `tests/unit/f1-dev-tools.test.mjs`, `tests/unit/apex-tools-mcp.test.mjs`, `tests/unit/browser-http-mcp.test.mjs`, `tests/unit/capture-tools-regressions.test.mjs`, `tests/unit/catalog-discovery.test.mjs`, `tests/unit/changelog-fragments.test.mjs`
- **Closes:** T5-04, T5-05, T5-06, T5-07, T5-08, T5-09, T5-10, T5-11, T5-12, T5-13, T5-14, T5-15, T5-17, T5-22, T5-24, T5-25, T5-26, T5-29, T5-30, T2-05, T2-12, T2-23, T1-03, T1-10, T1-14, T1-16, T1-19 (27 findings; effort S×21 M×6 L×0)
- **Draws from batches:** tooling-5, tooling-2, tooling-1 — waiting on: tooling-1
- **Verify:** `npm run test:tooling-fast (every owned file is a node unit test)`
- **Effort:** M (18 files, mostly S each)
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none; T5-30 (split validation-cli) needs a tests/groups.json row per new file + `npm run gen`
- **PR slices:** PR 1: T5-04, T5-05, T5-06, T5-08, T5-10, T5-15 (dead or always-true asserts); PR 2: T5-07, T5-09, T5-11–T5-14, T5-17, T5-22, T5-24–T5-26, T5-29, T5-30 (coverage gaps, split)

### L23 — Yaw, throttle and traffic scanners on the real code (draft)

- **Goal:** yaw and throttle tests assert the quantity the title names, and the traffic-arc equivalence test runs the production scanTow/scanOtAhead instead of two in-test copies
- **Owned:** `tests/unit/traffic-arc-buckets.test.mjs`, `tests/unit/yaw-low-speed-substep.test.mjs`, `tests/unit/yaw-damp-speed.test.mjs`, `tests/unit/throttle-latch.test.mjs`, `tests/unit/low-speed-lock.test.mjs`
- **Closes:** T5-01, T5-02, T5-03, T5-16, T3-07 (5 findings; effort S×4 M×1 L×0)
- **Draws from batches:** tooling-5, tooling-3 — waiting on: tooling-3
- **Verify:** `node --test tests/unit/traffic-arc-buckets.test.mjs tests/unit/yaw-low-speed-substep.test.mjs tests/unit/yaw-damp-speed.test.mjs tests/unit/throttle-latch.test.mjs`
- **Effort:** S
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none; T5-01's copies drop finished cars that collide.js keeps: the rewrite must show red against a copy that skips finished cars

### L24 — CI selection, gates and ratchets on fixtures (draft)

- **Goal:** the selector's main entry select(), the ratchet auto-raise refusal and the gate tools run on fixtures and can fail; retired-tool tests and stale headers go
- **Owned:** `tests/unit/select-specs.test.mjs`, `tests/unit/ratchets.test.mjs`, `tests/unit/poll-live-shell.test.mjs`, `tests/unit/sim-bytecode-budget.test.mjs`, `tests/unit/ratchet-merge-hotspot.test.mjs`, `tests/unit/queue-depth.test.mjs`, `tests/unit/select-budget.test.mjs`, `tests/unit/ready-full-cap.test.mjs`, `tests/unit/source-pin-hygiene.test.mjs`, `tests/unit/ci-coverage.test.mjs`, `tests/unit/deploy-pr-rest.test.mjs`, `tests/unit/deploy-staging.test.mjs`, `tests/unit/deploy-tool.test.mjs`, `tests/unit/flaky-quarantine.test.mjs`, `tests/unit/scenery-grounding.test.mjs`, `tests/unit/adapted-specs.test.mjs`, `tests/unit/measure-pr-ci-after-close.test.mjs`, `tests/unit/nightly-group.test.mjs`, `tests/unit/pick-unit-slices.test.mjs`, `tools/ci/run-playwright.mjs`
- **Closes:** T4-01, T4-03, T4-08, T4-16, T4-21, T4-22, T4-27, T4-29, T4-30, T2-01, T2-02, T2-03, T2-10, T2-16, T2-28, TK1-10, T1-15, T3-04, T3-17, N1-20, P2-23 (21 findings; effort S×16 M×5 L×0)
- **Draws from batches:** tooling-4, tooling-2, tracks-1, tooling-1, tooling-3, net, physics-2 — waiting on: tooling-1, tooling-3, net
- **Verify:** `npm run test:tooling-fast`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** T4-30 moves a ceiling into tests/data/ratchets.json: edit the source and `npm run gen`, never the generated file; no ratchet raise
- **PR slices:** PR 1: T4-01 select() fixtures, T4-03 ratchet refusal, T4-16 skip→fail (high); PR 2: T4-08, T4-21, T4-22, T4-27, T4-29, T4-30

### L25 — Test-infra hygiene and agent-surface tools (draft)

- **Goal:** source-integrity parses js/ as classic scripts, agent-surface tool tests drive the real CLI, and tests stop using sleeps, os.tmpdir() and order-dependent state
- **Owned:** `tests/unit/source-integrity.test.mjs`, `tests/unit/shot-survey-runner.test.mjs`, `tests/unit/profile-mcp.test.mjs`, `tests/unit/skill-gameplay-surface.test.mjs`, `tests/unit/skill-progressive.test.mjs`, `tests/unit/report-server.test.mjs`, `tests/unit/publish-shots.test.mjs`, `tests/unit/ready-gate.test.mjs`, `tests/unit/sheetshape-*.test.mjs`, `tests/unit/script-loader-throw.test.mjs`, `tests/unit/clipboard.test.mjs`, `tests/unit/comment-citations.test.mjs`, `tests/unit/docs-integrity.test.mjs`, `tests/unit/menu-nav-spatial.test.mjs`, `tests/unit/offline-precache-nav.test.mjs`, `tests/unit/track-line.test.mjs`, `tests/unit/track-shot-survey.test.mjs`, `tests/unit/trackside.test.mjs`, `tests/unit/agent-config.test.mjs`, `tests/unit/agent-surface.test.mjs`, `tests/unit/assert-audit.test.mjs`, `tests/unit/bash-guard-hardening.test.mjs`, `tests/unit/body-attitude.test.mjs`, `tests/unit/boot-idle-prefetch.test.mjs`, `tests/unit/cdmcp-measure.test.mjs`, `tests/unit/game-ctx-surface.test.mjs`, `tests/unit/game-vm.test.mjs`, `tests/unit/gen-arch-table.test.mjs`, `tests/unit/godray-keep-nearest.test.mjs`, `tests/unit/harness-display.test.mjs`, `tests/unit/key-binds.test.mjs`, `tests/unit/no-bare-console.test.mjs`
- **Closes:** T4-06, T4-07, T4-09, T4-18, T4-19, T4-23, T4-24, T4-25, T4-26, T4-28, T2-08, T2-17, T2-27, TK1-03, TK1-09, TK1-15, TK2-04, TK2-08, T1-01, T1-02, T1-06, T1-07, T1-08, T1-18, T1-20, T1-23, T3-01, T3-10, T3-13, T3-03, T3-16, T3-18, T3-20 (33 findings; effort S×26 M×7 L×0)
- **Draws from batches:** tooling-4, tooling-2, tracks-1, tracks-2, tooling-1, tooling-3 — waiting on: tracks-2, tooling-1, tooling-3
- **Verify:** `npm run test:tooling-fast`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** T4-06 must show red on a classic-script syntax error before the fix (vm.Script per file, not node --check); T4-25's other 7 tmpdir users are listed in reports/tooling-4.md

### L26 — Netcode, rendezvous worker and transport (draft)

- **Goal:** the rendezvous worker's alarm, expiry, OPTIONS/405 and bad-slot paths are tested; rival-attach dead code removed
- **Owned:** `tests/unit/rendezvous-worker.test.mjs`, `tests/unit/rival-attach-init.test.mjs`, `tests/specs/multiplayer-npeer.spec.js`, `tests/specs/multiplayer-room.spec.js`, `tests/unit/net-grid-separation.test.mjs`, `tests/unit/net-qr.test.mjs`, `tests/unit/net-rendezvous.test.mjs`, `tests/unit/net-session.test.mjs`, `tests/unit/net-stub-surface.test.mjs`, `tests/unit/net-transport.test.mjs`, `tests/unit/net-trystero-api.test.mjs`, `tests/unit/netplay-resilience.test.mjs`
- **Closes:** T4-10, T4-20, N1-03, N1-05, N1-12, N1-13, N1-14, N1-17, N1-22, N1-23, N1-25, N1-26 (12 findings; effort S×8 M×4 L×0)
- **Draws from batches:** tooling-4, net — waiting on: net
- **Verify:** `node --test tests/unit/rendezvous-worker.test.mjs tests/unit/rival-attach-init.test.mjs`
- **Effort:** S
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** none (net batch final); lobby and phone-controller rows live in L31

### L27 — Circuit data and foundation specs (draft)

- **Goal:** per-circuit foundation specs and circuit-data units assert real grounding numbers (no `gap === null ||` escapes, no probes that never touch terrain), and def-field checks read the shipped defs instead of copies
- **Owned:** `tests/specs/elevation-tracks.spec.js`, `tests/specs/f1-track-accuracy.spec.js`, `tests/specs/hungaroring-foundation.spec.js`, `tests/specs/monaco-foundation.spec.js`, `tests/specs/qatar-foundation.spec.js`, `tests/specs/zandvoort-foundation.spec.js`, `tests/unit/albert-park-foundation.test.mjs`, `tests/unit/audit-circuit.test.mjs`, `tests/unit/circuit-axis.test.mjs`, `tests/unit/circuit-def-fields.test.mjs`, `tests/unit/elevation-tracks-vm.test.mjs`, `tests/unit/foundation-core-vm.test.mjs`, `tests/unit/suzuka-crossover-span.test.mjs`, `tests/unit/track-def-factory.test.mjs`, `tests/unit/track-line-circuits.test.mjs`, `tests/specs/*-foundation.spec.js`, `tests/unit/baku-migration.test.mjs`
- **Closes:** TK1-06, TK1-16, TK1-17, TK1-18, TK1-19, TK1-20, TK1-21, TK1-22, TK1-26, TK2-01, TK2-05, TK2-10, TK2-12, TK2-16, TK2-17, TK2-19, T1-21 (17 findings; effort S×13 M×3 L×1)
- **Draws from batches:** tracks-1, tracks-2, tooling-1 — waiting on: tracks-2, tooling-1
- **Verify:** `node tools/track/verify-track.cjs <id> for each touched circuit, then that circuit's foundation spec alone via test-bg.mjs; the node units with node --test`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** the tracks-2 report is partial (tracks-walls, vegas, zandvoort verdicts and the props-over-road tail from spa are unfinished): fold its continuation here before launch; TK2-01 needs one browser read of groundY on the lat ±6 probes before the assert is tightened
- **PR slices:** PR 1: TK2-01, TK2-05, TK2-12, TK2-19 (foundation-spec escapes; one circuit per commit); PR 2: TK1-06, TK1-16–TK1-22, TK1-26, TK2-10, TK2-16, TK2-17 (circuit-data units and accuracy spec)

### L28 — Track scenery build tests that bite (draft)

- **Goal:** scenery guards, night override and lazy build run the real build and fail on a floating, missing or wrongly lit prop; span kinds and the scenery(api) contract are asserted from the engine, not a list copy
- **Owned:** `tests/specs/props-over-road.spec.js`, `tests/unit/circuit-vocab.test.mjs`, `tests/unit/lazy-track-build.test.mjs`, `tests/unit/scenery-api-contract.test.mjs`, `tests/unit/scenery-guards.test.mjs`, `tests/unit/span-kinds.test.mjs`, `tests/unit/track-build-vm-release.test.mjs`, `tests/unit/track-night-override.test.mjs`, `tests/unit/marshal-post-grounding.test.mjs`
- **Closes:** TK1-01, TK1-02, TK1-05, TK1-07, TK1-08, TK1-12, TK1-25, TK2-03, T3-09 (9 findings; effort S×5 M×4 L×0)
- **Draws from batches:** tracks-1, tracks-2, tooling-3 — waiting on: tracks-2, tooling-3
- **Verify:** `node --test on the owned units; props-over-road.spec.js alone via test-bg.mjs (or remote-group.mjs on the pushed branch)`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** the tracks-2 report is partial (tracks-walls, vegas, zandvoort verdicts and the props-over-road tail from spa are unfinished): fold its continuation here before launch; L0's absolute-filename helper first for TK1-07 (vm-no-filename)
- **PR slices:** PR 1: TK1-01, TK1-02 (high); PR 2: TK1-05, TK1-07, TK1-08, TK1-12, TK1-25, TK2-03

### L29 — Track designer tests on the real editor (draft)

- **Goal:** designer DOM, canvas, toolbar fit and fleet validation drive js/editor/ and assert what the player sees; the designer spec is green alone before any assert change
- **Owned:** `tests/specs/track-designer.spec.js`, `tests/unit/designer-canvas.test.mjs`, `tests/unit/track-designer-dom.test.mjs`, `tests/unit/track-validate-fleet.test.mjs`, `tests/unit/ui-fit-trackdesigner-toolbar-r6.test.mjs`
- **Closes:** TK1-13, TK1-24, TK2-06, TK2-13, TK2-14 (5 findings; effort S×3 M×2 L×0)
- **Draws from batches:** tracks-1, tracks-2 — waiting on: tracks-2
- **Verify:** `node --test on the owned units; track-designer.spec.js alone via test-bg.mjs`
- **Effort:** S
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** TK2-06 may be an environment timeout: re-run track-designer.spec.js alone at loadavg < 3 before changing it

### L30 — Agent API tests assert the hook, not its copy (draft)

- **Goal:** __apex hook tests (agent-view, anchors, obs/act edges, headless, the apex-tools MCP) call the live hook in the game VM and assert its documented shape and effect, not a hand-built object or a doc string
- **Owned:** `tests/unit/agent-anchors-vm.test.mjs`, `tests/unit/agent-view-vm.test.mjs`, `tests/unit/agentview-api-contract.test.mjs`, `tests/unit/headless-api-vm.test.mjs`, `tests/unit/hooks-documented.test.mjs`, `tests/unit/obs-act-edge-vm.test.mjs`
- **Closes:** T1-05, T1-11, T1-12, T3-02, T3-11, T3-12 (6 findings; effort S×6 M×0 L×0)
- **Draws from batches:** tooling-1, tooling-3 — waiting on: tooling-1, tooling-3
- **Verify:** `node --test on the owned files`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L0's absolute-filename helper helps the vm-loaded hooks; not blocking

### L31 — Multiplayer lobby and phone controller run the real flow (draft)

- **Goal:** lobby, seed sync, seat/role and phone-controller tests drive both peers through the shipped lobby code (no hand-set guest seed, no indexOf-order scans), and the camera-scan cancel test can see a live track
- **Owned:** `tests/specs/multiplayer-lobby.spec.js`, `tests/specs/multiplayer-roles.spec.js`, `tests/specs/multiplayer-scan-cancel.spec.js`, `tests/specs/multiplayer-seats.spec.js`, `tests/unit/desktop-notices.test.mjs`, `tests/unit/lobby-answer-flight.test.mjs`, `tests/unit/net-lobby-lifecycle.test.mjs`, `tests/unit/net-seed-sync-vm.test.mjs`, `tests/unit/net-start-arming.test.mjs`, `tests/unit/phone-pad.test.mjs`, `tests/unit/phone-touch-surface.test.mjs`, `tests/unit/service-worker.test.mjs`
- **Closes:** N1-01, N1-02, N1-06, N1-07, N1-08, N1-09, N1-10, N1-16, N1-18, N1-19, N1-21, N1-24 (12 findings; effort S×8 M×4 L×0)
- **Draws from batches:** net — waiting on: net
- **Verify:** `node --test on the owned units; the multiplayer specs alone via test-bg.mjs (one at a time)`
- **Effort:** M
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** N1-01 needs a liveTracks() probe taken before scan.js clears video.srcObject; coordinate shared helpers with L26

### L11 — Test-tree lints (draft)

- **Goal:** tools/check lints stop the recurring patterns at commit time: fixed slice windows, asserts after //, vm.run* without filename, `>= 0` / always-true asserts
- **Owned:** `tools/check/<new: test-pattern-lint>.mjs`, `tests/unit/<new: test-pattern-lint>.test.mjs`
- **Closes:**  (0 findings; effort S×0 M×0 L×0)
- **Draws from batches:** render-1, render-2, render-3 — waiting on: render-3
- **Verify:** `node --test tests/unit/<new: test-pattern-lint>.test.mjs && npm run test:guards`
- **Effort:** S
- **Model:** claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)
- **Depends on:** L2, L5 and L0 PR 2 landed (so the lint lands green)
