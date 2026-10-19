SON = "claude-sonnet-5-5 — scoped test rewrites inside one subsystem; the fleet default for lanes (Bryce 2026-10-16, memory `sessions-run-sonnet`)"
OPUS = "claude-opus-5-5 — {}; it keeps the Sonnet cost cap (launch-policy.md, cost and context)"
PREAMBLE = [
 "Model picks: the launch prompt named `.claude/skills/agent-fleet/references/launch-policy.md` §Model by task, but that section does not exist on this branch or the deploy tip (grep for \"Model by task\" finds nothing under `.claude/` or `docs/`). The picks below follow what does exist: lanes run Sonnet (memory `sessions-run-sonnet`), and a lane switched to Opus keeps the Sonnet cap (launch-policy.md). Opus is picked only where a lane must redesign a cross-backend file.",
 "",
 "Every lane: one draft PR into the deploy branch, `Closes` nothing (the parent #2952 stays open until all lanes land), test-only unless the lane says otherwise; never widen a tolerance or quarantine to get green (AGENTS.md rule 9). A rewritten test must be shown to fail on the defect it targets (revert the guarded line locally, see red, restore).",
]
ORDER = [
 "1. **L0 debugger + loader filenames first.** It gives every later lane line breakpoints in vm-loaded code (DBG-02) and the MCP on Node targets (DBG-01, #2957). Lanes that only fix vacuous asserts (S effort) may start in parallel; lanes converting source scans to behaviour wait for L0's helper change to land.",
 "2. **L2 canary split before L3 and L5.** The canary holds TLX/WGX and perf pins that L3/L5 would otherwise both edit; L2 moves them into per-backend files that L3/L5 then own.",
 "3. **L11 test lints last**: the lint for fixed `slice(x, x+N)` windows and asserts after `//` lands only after L2 and L5 have removed today's hits, so it lands green.",
 "4. Independent, any order: L1 camera, L4 lighting, L6 XR, L7 flyby, L8 UI/CSS, L9 tooling misc, L10 physics and agent contracts.",
 "5. **Product bugs found by tests go to their own issue**, not into a test lane's scope creep. The lane carries the test and the fix together, and each has a sub-issue of #2952: #2974 R1-01 (tuner scope buttons never set `aria-pressed`, L1), #2975 P2-13 (squeal double-gated, lock-up pitch never plays, L21), #2976 P2-15 (`carOrbit` reports the requested index after falling back, L1), #2977 U1-02 (two HUD defects pinned as `todo`; fix on cursor/hud-band-allocator-5e2c, so not `ready`; L20), #2978 U1-06 (gap chip at 9.95 s, L20).",
]
LANES = [
 dict(id="L0", name="Debuggable vm code: preload, then absolute filenames", batches=["render-1","render-2","render-3","physics-1"],
  goal="every vm-loaded module carries an absolute filename, so file-path breakpoints and coverage reach it; the MCP half (#2957) is PR #2967 and is not this lane",
  owned=["tools/lib/<new: vm-debug-preload>.cjs","tests/helpers/fn-source.mjs","tests/helpers/game-source.mjs","tests/helpers/vm-page.js","tools/check/<new: vm-filename-lint>.mjs","docs/TESTING.md §Debug a Node test"],
  ids=["DBG-01","DBG-02","DBG-03","DBG-04","DBG-05"], verify="node --test tests/unit/js-debugger-*.test.mjs && npm run test:tooling-fast",
  effort="S (#2960) + M (#2961, ~460 mechanical call sites via codemod)", model=SON + "; DEBUGGER-B's Q3 table also picks Sonnet for #2960 and #2961",
  deps="#2967 merged for DBG-01/04/05 (they close with it); #2960 before #2961; the helper migration touches tests/unit files other lanes own, so #2961 runs as a codemod-only PR AFTER the test lanes land, or each lane migrates its own files",
  slices=["#2960 preload + npm run debug:unit (S)","#2962 docs: Debug a Node test (S)","#2961 helper migration + vm-filename-lint (M, codemod, last)"]),
 dict(id="L1", name="Camera tests behave, not scan", batches=["render-1","render-2","render-3"],
  goal="camera tests drive the real rig on a curved track, the tuner scope bug is fixed with its test, and vacuous asserts are gone",
  owned=["tests/unit/cam-*.test.mjs","tests/unit/camera-*.test.mjs","tests/unit/free-cam.test.mjs","tests/unit/results-cam.test.mjs","tests/specs/camera*.spec.js","tests/helpers/camera-*.mjs (new)","js/camera/tuner-panel.js"],
  ids=["R1-01","R1-03","R1-05","R1-07","R1-12","R1-14","R1-16","R1-18","R2-06","R3-12","P2-15"],
  verify="node --test tests/unit/cam-*.test.mjs tests/unit/camera-*.test.mjs tests/unit/free-cam.test.mjs tests/unit/results-cam.test.mjs && npm test -- tests/specs/camera-tuner.spec.js",
  effort="M", model=SON, deps="L0 PR 2 for R1-07/R1-18 (behaviour conversions); the rest can start now",
  slices=["PR 1: R1-01 bug + test, R1-03, R2-06, R3-12 (S fixes)","PR 2: shared curved-track fixture, R1-05, R1-07, R1-12, R1-14, R1-16, R1-18"]),
 dict(id="L2", name="Split gfx-backend-canary; render contracts", batches=["render-2","render-3"],
  goal="the 7k-line canary becomes per-behaviour files with honest names, `read()` names the file it reads, and fixed slice windows are gone",
  owned=["tests/unit/gfx-backend-canary.test.mjs","tests/unit/gfx-*.test.mjs (new splits)","tests/unit/render-final-contracts.test.mjs","tests/unit/renderer-boot-timeout.test.mjs","tests/unit/gfx-debug-overlay.test.mjs","tests/unit/render-lighting-prep.test.mjs","tests/specs/instanced-draw.spec.js"],
  ids=["R2-02","R2-03","R2-12","R2-13","R2-16","R2-19","R3-13"],
  verify="node --test tests/unit/gfx-*.test.mjs tests/unit/render-*.test.mjs tests/unit/renderer-boot-timeout.test.mjs && npm run gen:check && npm run test:tooling-fast",
  effort="L (split is mechanical but 252 tests; budget two sessions)", model=OPUS.format("a 7k-line cross-backend file split where test identity and group membership must survive"),
  deps="none; must land before L3/L5 touch moved pins", slices=["PR 1: mechanical split, no assertion changes (gen + groups.json rows)","PR 2: slice windows → fnBody/span, read() fix, R2-12/R2-16/R2-19","PR 3: R2-13 delete, R3-13 frameContent"]),
 dict(id="L3", name="TLX/WGX behaviour over text pins", batches=["render-2","render-3"],
  goal="TLX and WGX tests run the lifted code on fake GL/GPU instead of matching source; WGX text pins move to one labelled file",
  owned=["tests/unit/tlx-*.test.mjs","tests/unit/hunt-tlx-*.test.mjs","tests/unit/webgpu-lifecycle.test.mjs","tests/unit/<new: wgx-source-pins>.test.mjs","tests/unit/tex-census.test.mjs"],
  ids=["R2-08","R3-04","R3-05","R3-06","R3-15","R3-17"],
  verify="node --test tests/unit/tlx-*.test.mjs tests/unit/hunt-tlx-*.test.mjs tests/unit/webgpu-lifecycle.test.mjs tests/unit/tex-census.test.mjs; a real WGSL compile needs gpu-census.yml (path rule render-wgx)",
  effort="M", model=SON, deps="L2 PR 1 (moved pins); L0 PR 2 helps R3-05/R3-06"),
 dict(id="L4", name="Lighting tests run the real LightStore", batches=["render-1","render-2","render-3","physics-1"],
  goal="preset and lamp tests run the real resolver and fail on NaN, missing geometry or a scoped run",
  owned=["tests/unit/light-*.test.mjs","tests/unit/lamp-*.test.mjs","tests/unit/lighting-*.test.mjs","tests/unit/night-washout-presets.test.mjs","tests/unit/image-grade-shaders.test.mjs","tests/specs/image-grade-visual.spec.js"],
  ids=["R2-04","R2-07","R2-09","R2-14","R2-15","R2-20","R3-09","P1-20"],
  verify="node --test tests/unit/light-*.test.mjs tests/unit/lamp-*.test.mjs tests/unit/lighting-*.test.mjs && npm test -- tests/specs/image-grade-visual.spec.js",
  effort="M", model=SON, deps="none (lamp-fixture-anchor is a sweeps file: run `npm run test:sweeps` scope for R2-07)"),
 dict(id="L5", name="Perf and frame-time gates that can fail", batches=["render-1","render-2","render-3"],
  goal="perf tests either gate on something real or are labelled telemetry; dead assert in perf-try fixed; globals restored",
  owned=["tests/unit/perf-*.test.mjs","tests/unit/render-rate.test.mjs","tests/unit/frame-*.test.mjs","tests/specs/perf-frametime.spec.js","tests/specs/perf-race-entry.spec.js","tests/helpers/perf-frametime.mjs"],
  ids=["R1-04","R1-17","R2-01","R2-05","R2-11","R3-03","RC2-15"],
  verify="node --test tests/unit/perf-*.test.mjs tests/unit/render-rate.test.mjs tests/unit/frame-*.test.mjs && npm test -- tests/specs/perf-frametime.spec.js",
  effort="M", model=SON, deps="L2 PR 1 if perf pins move; R2-01 (S) can go now",
  slices=["PR 1: R2-01, R2-05, R1-04 (S)","PR 2: R3-03 decision (STRICT vs telemetry: ask Bryce), R2-11, R1-17"]),
 dict(id="L6", name="XR asserts and gaps", batches=["render-3"],
  goal="XR tests assert exact fallback reasons and the VR spec checks pause, pin and capture for real",
  owned=["tests/unit/xr-*.test.mjs","tests/specs/vr-emulated.spec.js","tests/specs/xr-plan.spec.js","tests/specs/presets.spec.js"],
  ids=["R3-07","R3-10","R3-14","R3-18"], verify="node --test tests/unit/xr-*.test.mjs && npm test -- tests/specs/vr-emulated.spec.js",
  effort="M", model=SON, deps="none"),
 dict(id="L7", name="Flyby files: split the slow one, reconcile limits", batches=["render-1"],
  goal="flyby-shots leaves toolingFast in fast pieces, and the flyby audit has a negative control",
  owned=["tests/unit/flyby-*.test.mjs","tests/helpers/flyby-audit-rules.mjs"],
  ids=["R1-06","R1-10","R1-11"], verify="node --test tests/unit/flyby-*.test.mjs && npm run gen:check && npm run test:tooling-fast",
  effort="S–M", model=SON, deps="none"),
 dict(id="L8", name="UI/CSS fit tests on cssRules; one formatter table", batches=["render-1","render-2","render-3"],
  goal="tuner CSS fit checks parse rules instead of regex, contrast is computed, and every lap/race-clock formatter shares one table test",
  owned=["tests/unit/ui-fit-*.test.mjs","tests/unit/appearance-*.test.mjs","tests/unit/lap-format-rollover.test.mjs","tests/unit/css-*.test.mjs"],
  ids=["R1-08","R2-21","R3-11","U1-08","U1-14"], verify="node --test tests/unit/ui-fit-*.test.mjs tests/unit/appearance-*.test.mjs tests/unit/lap-format-rollover.test.mjs",
  effort="M", model=SON, deps="none"),
 dict(id="L9", name="Tooling tests on fixtures", batches=["render-1","render-2","render-3"],
  goal="tooling tests run on fixtures instead of live repo state, misplaced smokes move home, local shader validation is honest",
  owned=["tests/unit/apex-memory.test.mjs","tests/unit/census-verdict.test.mjs","tests/unit/shader-validate.test.mjs","tests/unit/skill-render-ui-surface.test.mjs","tests/unit/game-tools-help.test.mjs","tests/unit/assets-pack.test.mjs","tests/unit/vertex-pack.test.mjs","tests/unit/elev-presets.test.mjs","tests/unit/change-driver-tools.test.mjs","tests/unit/vstd-invariant.test.mjs","tools/env/apex-memory.mjs"],
  ids=["R1-02","R1-09","R1-13","R1-15","R2-10","R2-18","R3-16","P1-09","P1-23","P2-19"],
  verify="node --test tests/unit/apex-memory.test.mjs tests/unit/census-verdict.test.mjs tests/unit/shader-validate.test.mjs tests/unit/game-tools-help.test.mjs tests/unit/assets-pack.test.mjs tests/unit/elev-presets.test.mjs && npm run test:tooling-fast",
  effort="S–M", model=SON, deps="R2-10 touches lighting-tuner-sweep.test.mjs, which L4 owns: L9 adds the CASES to game-tools-help, L4 deletes them from lighting-tuner-sweep"),
 dict(id="L10", name="Player physics and collisions that can fail", batches=["render-3","physics-1","physics-2"],
  goal="player-physics and collision tests assert the shipped behaviour (both walls, grass drag, scrub, contact extents) instead of test-local copies, and every 'loses speed' title asserts speed",
  owned=["tests/unit/wall-clamp.test.mjs","tests/unit/collision*.test.mjs","tests/unit/physics-rows-vm.test.mjs","tests/unit/player-forces.test.mjs","tests/unit/steer-lock-taper.test.mjs","tests/unit/grip-steer.test.mjs","tests/unit/trail-brake-turnin.test.mjs","tests/unit/tyre-peak-slip.test.mjs","tests/unit/tyre-model.test.mjs","tests/specs/longitudinal.spec.js","tests/specs/world-physics.spec.js","tests/specs/physics-boot.spec.js","tests/specs/physics-hotpath.spec.js","tests/specs/collisions-deep.spec.js","tests/specs/physics-fixes.spec.js","tests/specs/drift.spec.js"],
  ids=["R3-08","P1-02","P1-03","P1-04","P1-05","P1-06","P1-08","P1-10","P1-11","P1-14","P1-15","P1-17","P1-19","P2-01","P2-02","P2-06","P2-07","P2-08","P2-09","P2-14","P2-18","P2-21"],
  verify="node --test tests/unit/wall-clamp.test.mjs tests/unit/collision*.test.mjs tests/unit/physics-rows-vm.test.mjs tests/unit/player-forces.test.mjs tests/unit/steer-lock-taper.test.mjs tests/unit/grip-steer.test.mjs tests/unit/tyre-*.test.mjs; specs via node tools/ci/remote-group.mjs <group> on the pushed branch (longitudinal.spec alone is 556 s locally)",
  effort="L (22 findings; three PRs)", model=SON, deps="none; P1-17 (arc must not reach the driver) wants agent physics-contract-auditor first",
  slices=["PR 1: vacuous/tautology fixes in unit files (P1-02, P1-08, P1-10, P1-11, P1-19, P2-09)","PR 2: collision contact + wall (R3-08, P1-03, P1-04, P1-06, P1-14, P2-06, P2-14)","PR 3: specs (P2-01, P2-02, P2-07, P2-08, P2-21) + P1-05, P1-15, P1-17, P2-18"]),
 dict(id="L12", name="Master physics gate, aero and ERS", batches=["physics-1","physics-2"],
  goal="the physics-characterization gate covers ERS, X-mode, wet, kerbs and AI beyond 4 Monza dry scenarios, its baseline blessing is provable, and aero/ERS specs assert what their titles promise",
  owned=["tests/specs/physics-characterization.spec.js","tests/unit/physics-characterization-vm.test.mjs","tests/unit/physics-baseline-provenance.test.mjs","tests/helpers/baseline-blessing.mjs","tests/unit/aero-*.test.mjs","tests/specs/aero-zones.spec.js","tests/specs/parts-ers.spec.js"],
  ids=["P1-01","P1-13","P1-22","P2-03","P2-05","P2-11","P2-17"],
  verify="node --test tests/unit/physics-characterization-vm.test.mjs tests/unit/physics-baseline-provenance.test.mjs tests/unit/aero-*.test.mjs && npm test -- tests/specs/physics-characterization.spec.js",
  effort="M–L", model=OPUS.format("it widens the master gate that makes game.js extraction safe; scenario choice and baseline re-blessing are design calls"),
  deps="none; a new baseline needs Bryce's blessing (re-bless is a ratchet-class change)"),
 dict(id="L13", name="Determinism, assets, persistence and untrusted-input contracts", batches=["render-3","physics-1"],
  goal="the determinism spec can fail, the assets spec reads real GL errors, the save-failed warning is proven to fire, and fuzzing asserts every shape branch",
  owned=["tests/specs/agent-determinism-frame.spec.js","tests/specs/assets-api.spec.js","tests/unit/persistence-vm.test.mjs","tests/unit/fuzz-untrusted-inputs.test.mjs"],
  ids=["R3-01","R3-02","P1-07","P1-12"],
  verify="node --test tests/unit/persistence-vm.test.mjs tests/unit/fuzz-untrusted-inputs.test.mjs && npm test -- tests/specs/agent-determinism-frame.spec.js tests/specs/assets-api.spec.js",
  effort="S–M", model=SON, deps="#2963 (determinism bisect) helps R3-01 but is not required"),
 dict(id="L14", name="Input, steering and settings migration", batches=["physics-2"],
  goal="steer-migration runs every old schema version (the only code that rewrites a player's saved settings), and steering/gamepad specs assert what they claim",
  owned=["tests/specs/steer-migration.spec.js","tests/specs/steering.spec.js","tests/specs/gamepad.spec.js","tests/unit/<new: input-curves>.test.mjs"],
  ids=["P2-04","P2-10","P2-20","P2-22"],
  verify="npm test -- tests/specs/steer-migration.spec.js tests/specs/steering.spec.js tests/specs/gamepad.spec.js",
  effort="M", model=SON, deps="none; physics-2's chain C never read steer-migration/gamepad results, so re-run them first"),
 dict(id="L15", name="Race session, quali, start and radio", batches=["physics-1","race-2"],
  goal="race-session, quali, start-light and radio tests run the shipped code (no copied announce queue or step accounting, no game.js regex for sector maths)",
  owned=["tests/unit/race-session-*.test.mjs","tests/unit/race-settings-vm.test.mjs","tests/unit/race-radio.test.mjs","tests/unit/start-lights.test.mjs","tests/unit/race-step-snap.test.mjs","tests/unit/brake-cue.test.mjs","tests/unit/quali-persist.test.mjs","tests/specs/quali.spec.js","tests/specs/jump-start.spec.js"],
  ids=["RC2-03","RC2-04","RC2-09","RC2-10","RC2-11","RC2-12","RC2-14","RC2-16","RC2-18","P1-18","P1-21"],
  verify="node --test tests/unit/race-session-*.test.mjs tests/unit/race-settings-vm.test.mjs tests/unit/race-radio.test.mjs tests/unit/start-lights.test.mjs tests/unit/brake-cue.test.mjs tests/unit/quali-persist.test.mjs && npm test -- tests/specs/jump-start.spec.js",
  effort="M–L", model=SON, deps="race-2 part 2 (spec debugger column) before the spec slice"),
 dict(id="L16", name="Weather, real-race replay and debris", batches=["race-2"],
  goal="weather tests assert the arc not their own arithmetic, real-race laps-down is checked, and the debris wall-hit flake is root-caused",
  owned=["tests/unit/weather-*.test.mjs","tests/unit/storm-weather.test.mjs","tests/unit/real-race.test.mjs","tests/specs/debris.spec.js"],
  ids=["RC2-05","RC2-07","RC2-08","RC2-17"],
  verify="node --test tests/unit/weather-*.test.mjs tests/unit/storm-weather.test.mjs tests/unit/real-race.test.mjs && npm test -- tests/specs/debris.spec.js (run 5×; AGENTS rule 9: a retry-pass is a red)",
  effort="M", model=SON, deps="none"),
 dict(id="L17", name="Track geometry tests that bite", batches=["race-2"],
  goal="terrain/normal tests fail under the mutations the reviewer tried (TRI_EPS=0, banking() called per sample), and foundation overlap checks have no blind band",
  owned=["tests/unit/terrain-*.test.mjs","tests/specs/bahrain-foundation.spec.js"],
  ids=["RC2-01","RC2-02","RC2-13"],
  verify="node --test tests/unit/terrain-*.test.mjs && node tools/track/verify-track.cjs bahrain && npm test -- tests/specs/bahrain-foundation.spec.js",
  effort="S–M", model=SON, deps="tracks-1/tracks-2 reports may add rows here"),
 dict(id="L18", name="Career tests on the real modules", batches=["race-2","car-1"],
  goal="career tests load career-planning.js and real Teams/Hash32, guard loops against empty lists, and cover facility/money/reliability paths players hit",
  owned=["tests/unit/career-*.test.mjs","tests/unit/reliability.test.mjs"],
  ids=["C1-01","C1-03","C1-04","C1-07","C1-11","C1-16","C1-17","RC2-06"],
  verify="node --test tests/unit/career-*.test.mjs tests/unit/reliability.test.mjs",
  effort="M", model=SON, deps="modes-1 report may add career rows"),
 dict(id="L19", name="Car render, garage and livery", batches=["physics-1","physics-2","car-1"],
  goal="car and garage tests run the mesh/material builders instead of ~370 source pins, hidden-class asserts are unconditional, and garage specs can fail",
  owned=["tests/unit/car-*.test.mjs","tests/unit/garage-*.test.mjs","tests/unit/crest-marks.test.mjs","tests/unit/carve-a-modules.test.mjs","tests/unit/finish-coast-rev-vm.test.mjs","tests/specs/garage-aero.spec.js","tests/specs/parts-persistence.spec.js"],
  ids=["C1-02","C1-05","C1-06","C1-08","C1-09","C1-10","C1-12","C1-13","C1-14","C1-15","C1-18","P2-12","P2-16"],
  verify="node --test tests/unit/car-*.test.mjs tests/unit/garage-*.test.mjs tests/unit/crest-marks.test.mjs tests/unit/carve-a-modules.test.mjs && npm test -- tests/specs/garage-aero.spec.js",
  effort="L (car-presentation-canary split is the bulk)", model=SON, deps="car-2 report may add rows; L2's canary-split pattern is the template"),
 dict(id="L20", name="HUD, data hub and i18n", batches=["ui-1"],
  goal="HUD tests drive the real layout on the phone profile (844x390), the two todo-pinned HUD bugs are fixed or tracked, and copied helpers are imported",
  owned=["tests/unit/hud-*.test.mjs","tests/unit/dock-layout.test.mjs","tests/unit/meeting-picker-labels.test.mjs","tests/unit/a11y-*.test.mjs","tests/unit/i18n.test.mjs","tests/unit/loading-screen-*.test.mjs"],
  ids=["U1-01","U1-02","U1-03","U1-05","U1-06","U1-07","U1-09","U1-10","U1-11","U1-12","U1-13","U1-15","U1-16","U1-17"],
  verify="node --test tests/unit/hud-*.test.mjs tests/unit/dock-layout.test.mjs tests/unit/meeting-picker-labels.test.mjs tests/unit/a11y-*.test.mjs tests/unit/i18n.test.mjs",
  effort="M–L", model=SON, deps="U1-02's fixes live on unmerged branch cursor/hud-band-allocator-5e2c: land that PR first, then flip the todo tests to real asserts; ui-2 report may add rows"),
 dict(id="L21", name="Audio paths the race actually takes", batches=["physics-2","ui-1","car-1"],
  goal="audio tests call GameAudio the way the race does (scalar skid, pause/resume), so the double-gated squeal and lock-up pitch are caught",
  owned=["tests/unit/tyre-squeal-slip.test.mjs","tests/unit/pause-silence.test.mjs"],
  ids=["P2-13","U1-04"],
  verify="node --test tests/unit/tyre-squeal-slip.test.mjs tests/unit/pause-silence.test.mjs",
  effort="S (test) + a product fix for P2-13", model=SON, deps="audio-1 report pending; P2-13 is a product bug: open a sub-issue"),
 dict(id="L11", name="Test-tree lints", batches=["render-1","render-2","render-3"], ready=False,
  goal="tools/check lints stop the recurring patterns at commit time: fixed slice windows, asserts after //, vm.run* without filename, `>= 0` / always-true asserts",
  owned=["tools/check/<new: test-pattern-lint>.mjs","tests/unit/<new: test-pattern-lint>.test.mjs"],
  ids=[], verify="node --test tests/unit/<new: test-pattern-lint>.test.mjs && npm run test:guards",
  effort="S", model=SON, deps="L2, L5 and L0 PR 2 landed (so the lint lands green)"),
]
# ---- Pass 3 (REVIEW-SYNTH-2): tooling-5 (final) and the render-2 mutation addendum, folded into existing lanes
# plus two new ones. Owned globs stay disjoint: each added file is named once.
_FOLD = {
 "L1": (["render-2"], [], ["R2-28"]),
 "L3": (["render-2", "tooling-5"], ["tests/unit/glx-resize-hysteresis.test.mjs", "tests/unit/glx-occlusion.test.mjs", "tests/unit/renderer-soft-lifecycle.test.mjs", "tests/unit/road-lut-frame.test.mjs", "tests/unit/three-inspector.test.mjs", "tests/unit/wgsl-bindings.test.mjs"],
        ["R2-32", "R2-33", "R2-38", "R2-39", "T5-27", "T5-28"]),
 "L4": (["render-2"], [], ["R2-22", "R2-25", "R2-27", "R2-30", "R2-31"]),
 "L5": (["render-2"], [], ["R2-26", "R2-35", "R2-40"]),
 "L9": (["tooling-5"], [], ["T5-20"]),
 "L15": (["tooling-5"], ["tests/unit/tt-lap-validity-vm.test.mjs"], ["T5-23"]),
 "L16": (["tooling-5"], ["tests/unit/wind.test.mjs"], ["T5-19"]),
 "L19": (["tooling-5"], ["tests/unit/surface-id-parity.test.mjs"], ["T5-18"]),
 "L21": (["tooling-5", "audio-1"], ["tests/unit/wind-speed.test.mjs"] + ['tests/unit/fake-audio-vm.cjs', 'tests/unit/rival-contact-sfx.test.mjs', 'tests/unit/audio-*.test.mjs', 'tests/unit/spotify-refresh.test.mjs', 'tests/unit/career-data-audio-improvements.test.mjs', 'tests/specs/audio-smoke.spec.js', 'tests/specs/music-library.spec.js', 'tests/unit/lazy-audio-yield.test.mjs', 'tests/unit/end-race-music-vm.test.mjs', 'tests/unit/crowd-audio.test.mjs'],
        ["T5-21"] + ['A1-01', 'A1-02', 'A1-03', 'A1-04', 'A1-05', 'A1-06', 'A1-07', 'A1-08', 'A1-09', 'A1-10', 'A1-11', 'A1-12', 'A1-13', 'A1-14', 'A1-16', 'A1-17', 'A1-18', 'A1-19', 'A1-20', 'A1-21', 'A1-22']),
 "L17": ([], ["tests/specs/terrain-over-road.spec.js"], ["RC2-19", "RC2-20", "RC2-21"]),
}
_FOLD2 = {  # tooling-4 (final), pass 4
 "L19": (["tooling-4"], ["tests/unit/setup-preview-hull.test.mjs"], ["T4-02"]),
 "L4": (["tooling-4"], ["tests/unit/slider-effect.test.mjs"], ["T4-05", "T4-17"]),
 "L10": (["tooling-4"], ["tests/unit/speed-coupling.test.mjs"], ["T4-11"]),
 "L5": (["tooling-4"], ["tests/unit/ribbon-cpu-release.test.mjs"], ["T4-12"]),
 "L8": (["tooling-4"], ["tests/unit/scroll-strips.test.mjs"], ["T4-13"]),
 "L13": (["tooling-4"], ["tests/unit/store-cross-tab.test.mjs", "tests/unit/store-registry.test.mjs"], ["T4-14", "T4-15"]),
 "L17": (["tooling-4"], ["tests/unit/road-under-floor.test.mjs"], ["T4-04"]),
}
for _k, (_b, _o, _i) in _FOLD2.items():
    _p = _FOLD.get(_k, ([], [], []))
    _FOLD[_k] = (_p[0] + _b, _p[1] + _o, _p[2] + _i)
for _L in LANES:
    if _L["id"] in _FOLD:
        _b, _o, _i = _FOLD[_L["id"]]
        _L["batches"] = _L["batches"] + [b for b in _b if b not in _L["batches"]]
        _L["owned"] = _L["owned"] + _o
        _L["ids"] = _L["ids"] + _i
LANES[-1:-1] = [
 dict(id="L22", name="Tooling CLI tests that can fail", batches=["tooling-5"],
  goal="tool tests run their CLI on fixtures and assert outcomes: no shared-Map tautologies, no live-repo `doesNotMatch`, no CI-absent skips, untested branches of tooling-fast and test-bg covered",
  owned=["tests/unit/verify-live.test.mjs","tests/unit/validation-cli.test.mjs","tests/unit/test-observed.test.mjs","tests/unit/tumftm-import.test.mjs","tests/unit/trim-comments.test.mjs","tests/unit/wake-lock-vm.test.mjs","tests/unit/who-is-on-it.test.mjs","tests/unit/workflow-lint.test.mjs","tests/unit/tools-runnable.test.mjs","tests/unit/test-groups.test.mjs","tests/unit/sweep-shards.test.mjs","tests/unit/twinned-specs.test.mjs","tests/unit/sync-pr-robust.test.mjs","tests/unit/tools-a12-guards.test.mjs","tests/unit/tooling-fast-runner.test.mjs","tests/unit/test-bg-outcome.test.mjs","tests/unit/twin-fidelity.test.mjs","tests/unit/viewer.test.mjs"],
  ids=["T5-04","T5-05","T5-06","T5-07","T5-08","T5-09","T5-10","T5-11","T5-12","T5-13","T5-14","T5-15","T5-17","T5-22","T5-24","T5-25","T5-26","T5-29","T5-30"],
  verify="npm run test:tooling-fast (every owned file is a node unit test)",
  effort="M (18 files, mostly S each)", model=SON, deps="none; T5-30 (split validation-cli) needs a tests/groups.json row per new file + `npm run gen`",
  slices=["PR 1: T5-04, T5-05, T5-06, T5-08, T5-10, T5-15 (dead or always-true asserts)","PR 2: T5-07, T5-09, T5-11–T5-14, T5-17, T5-22, T5-24–T5-26, T5-29, T5-30 (coverage gaps, split)"]),
 dict(id="L23", name="Yaw, throttle and traffic scanners on the real code", batches=["tooling-5"],
  goal="yaw and throttle tests assert the quantity the title names, and the traffic-arc equivalence test runs the production scanTow/scanOtAhead instead of two in-test copies",
  owned=["tests/unit/traffic-arc-buckets.test.mjs","tests/unit/yaw-low-speed-substep.test.mjs","tests/unit/yaw-damp-speed.test.mjs","tests/unit/throttle-latch.test.mjs"],
  ids=["T5-01","T5-02","T5-03","T5-16"],
  verify="node --test tests/unit/traffic-arc-buckets.test.mjs tests/unit/yaw-low-speed-substep.test.mjs tests/unit/yaw-damp-speed.test.mjs tests/unit/throttle-latch.test.mjs",
  effort="S", model=SON, deps="none; T5-01's copies drop finished cars that collide.js keeps: the rewrite must show red against a copy that skips finished cars"),
 dict(id="L24", name="CI selection, gates and ratchets on fixtures", batches=["tooling-4"],
  goal="the selector's main entry select(), the ratchet auto-raise refusal and the gate tools run on fixtures and can fail; retired-tool tests and stale headers go",
  owned=["tests/unit/select-specs.test.mjs","tests/unit/ratchets.test.mjs","tests/unit/poll-live-shell.test.mjs","tests/unit/sim-bytecode-budget.test.mjs","tests/unit/ratchet-merge-hotspot.test.mjs","tests/unit/queue-depth.test.mjs","tests/unit/select-budget.test.mjs","tests/unit/ready-full-cap.test.mjs","tests/unit/source-pin-hygiene.test.mjs"],
  ids=["T4-01","T4-03","T4-08","T4-16","T4-21","T4-22","T4-27","T4-29","T4-30"],
  verify="npm run test:tooling-fast", effort="M", model=SON,
  deps="T4-30 moves a ceiling into tests/data/ratchets.json: edit the source and `npm run gen`, never the generated file; no ratchet raise",
  slices=["PR 1: T4-01 select() fixtures, T4-03 ratchet refusal, T4-16 skip→fail (high)","PR 2: T4-08, T4-21, T4-22, T4-27, T4-29, T4-30"]),
 dict(id="L25", name="Test-infra hygiene and agent-surface tools", batches=["tooling-4"],
  goal="source-integrity parses js/ as classic scripts, agent-surface tool tests drive the real CLI, and tests stop using sleeps, os.tmpdir() and order-dependent state",
  owned=["tests/unit/source-integrity.test.mjs","tests/unit/shot-survey-runner.test.mjs","tests/unit/profile-mcp.test.mjs","tests/unit/skill-gameplay-surface.test.mjs","tests/unit/skill-progressive.test.mjs","tests/unit/report-server.test.mjs","tests/unit/publish-shots.test.mjs","tests/unit/ready-gate.test.mjs","tests/unit/sheetshape-*.test.mjs","tests/unit/script-loader-throw.test.mjs"],
  ids=["T4-06","T4-07","T4-09","T4-18","T4-19","T4-23","T4-24","T4-25","T4-26","T4-28"],
  verify="npm run test:tooling-fast", effort="M", model=SON,
  deps="T4-06 must show red on a classic-script syntax error before the fix (vm.Script per file, not node --check); T4-25's other 7 tmpdir users are listed in reports/tooling-4.md"),
 dict(id="L26", name="Net worker and rival attach", batches=["tooling-4","net"],
  goal="the rendezvous worker's alarm, expiry, OPTIONS/405 and bad-slot paths are tested; rival-attach dead code removed",
  owned=["tests/unit/rendezvous-worker.test.mjs","tests/unit/rival-attach-init.test.mjs"],
  ids=["T4-10","T4-20"], verify="node --test tests/unit/rendezvous-worker.test.mjs tests/unit/rival-attach-init.test.mjs",
  effort="S", model=SON, deps="the net batch report is pending: fold its rows here before launch"),
]

# ---- pass 5: tooling-2 (final), tracks-1 (final), tracks-2 (partial 1/n)
def _files(ids):
    import rows as _r
    by = {x[0]: x[2] for x in _r.ROWS}
    return sorted({by[i] for i in ids if by[i].endswith((".mjs", ".cjs", ".js"))})
_FOLD3 = {
 "L1": (["tooling-2"], ["T2-29"]),
 "L4": (["tooling-2"], ["T2-07"]),
 "L5": (["tooling-2"], ["T2-19", "T2-24"]),
 "L8": (["tooling-2"], ["T2-04", "T2-18", "T2-20"]),
 "L9": (["tooling-2"], ["T2-14", "T2-22"]),
 "L10": (["tooling-2", "tracks-2"], ["T2-11", "T2-21", "T2-30", "TK2-18"]),
 "L13": (["tooling-2"], ["T2-09"]),
 "L15": (["tooling-2"], ["T2-06", "T2-13"]),
 "L17": (["tooling-2", "tracks-1", "tracks-2"], ["T2-25", "T2-26", "TK1-11", "TK1-14", "TK1-23", "TK2-02", "TK2-09", "TK2-11", "TK2-15"]),
 "L19": (["tooling-2", "tracks-1", "tracks-2"], ["T2-15", "TK1-04", "TK2-07"]),
 "L22": (["tooling-2"], ["T2-05", "T2-12", "T2-23"]),
 "L24": (["tooling-2", "tracks-1"], ["T2-01", "T2-02", "T2-03", "T2-10", "T2-16", "T2-28", "TK1-10"]),
 "L25": (["tooling-2", "tracks-1", "tracks-2"], ["T2-08", "T2-17", "T2-27", "TK1-03", "TK1-09", "TK1-15", "TK2-04", "TK2-08"]),
}
for _L in LANES:
    if _L["id"] in _FOLD3:
        _b, _i = _FOLD3[_L["id"]]
        _L["batches"] = _L["batches"] + [b for b in _b if b not in _L["batches"]]
        _L["owned"] = _L["owned"] + [f for f in _files(_i) if f not in _L["owned"]]
        _L["ids"] = _L["ids"] + _i
_TRK = "the tracks-2 report is partial (tracks-walls, vegas, zandvoort verdicts and the props-over-road tail from spa are unfinished): fold its continuation here before launch"
LANES[-1:-1] = [
 dict(id="L27", name="Circuit data and foundation specs", batches=["tracks-1", "tracks-2"],
  goal="per-circuit foundation specs and circuit-data units assert real grounding numbers (no `gap === null ||` escapes, no probes that never touch terrain), and def-field checks read the shipped defs instead of copies",
  owned=_files(["TK1-06", "TK1-16", "TK1-17", "TK1-18", "TK1-19", "TK1-20", "TK1-21", "TK1-22", "TK1-26", "TK2-01", "TK2-05", "TK2-10", "TK2-12", "TK2-16", "TK2-19"]) + ["tests/specs/*-foundation.spec.js"],
  ids=["TK1-06", "TK1-16", "TK1-17", "TK1-18", "TK1-19", "TK1-20", "TK1-21", "TK1-22", "TK1-26", "TK2-01", "TK2-05", "TK2-10", "TK2-12", "TK2-16", "TK2-17", "TK2-19"],
  verify="node tools/track/verify-track.cjs <id> for each touched circuit, then that circuit's foundation spec alone via test-bg.mjs; the node units with node --test",
  effort="M", model=SON, deps=_TRK + "; TK2-01 needs one browser read of groundY on the lat ±6 probes before the assert is tightened",
  slices=["PR 1: TK2-01, TK2-05, TK2-12, TK2-19 (foundation-spec escapes; one circuit per commit)", "PR 2: TK1-06, TK1-16–TK1-22, TK1-26, TK2-10, TK2-16, TK2-17 (circuit-data units and accuracy spec)"]),
 dict(id="L28", name="Track scenery build tests that bite", batches=["tracks-1", "tracks-2"],
  goal="scenery guards, night override and lazy build run the real build and fail on a floating, missing or wrongly lit prop; span kinds and the scenery(api) contract are asserted from the engine, not a list copy",
  owned=_files(["TK1-01", "TK1-02", "TK1-05", "TK1-07", "TK1-08", "TK1-12", "TK1-25", "TK2-03"]),
  ids=["TK1-01", "TK1-02", "TK1-05", "TK1-07", "TK1-08", "TK1-12", "TK1-25", "TK2-03"],
  verify="node --test on the owned units; props-over-road.spec.js alone via test-bg.mjs (or remote-group.mjs on the pushed branch)",
  effort="M", model=SON, deps=_TRK + "; L0's absolute-filename helper first for TK1-07 (vm-no-filename)",
  slices=["PR 1: TK1-01, TK1-02 (high)", "PR 2: TK1-05, TK1-07, TK1-08, TK1-12, TK1-25, TK2-03"]),
 dict(id="L29", name="Track designer tests on the real editor", batches=["tracks-1", "tracks-2"],
  goal="designer DOM, canvas, toolbar fit and fleet validation drive js/editor/ and assert what the player sees; the designer spec is green alone before any assert change",
  owned=_files(["TK1-13", "TK1-24", "TK2-06", "TK2-13", "TK2-14"]),
  ids=["TK1-13", "TK1-24", "TK2-06", "TK2-13", "TK2-14"],
  verify="node --test on the owned units; track-designer.spec.js alone via test-bg.mjs",
  effort="S", model=SON, deps="TK2-06 may be an environment timeout: re-run track-designer.spec.js alone at loadavg < 3 before changing it"),
]

# ---- pass 6b: tooling-1, tooling-3, net (final); physics-2 part 3a, render-3 part 2/2 (continuations)
_FOLD4 = {
 "L0": (["tooling-3"], ["T3-15"]),
 "L1": (["render-3"], ["R3-22"]),
 "L2": (["tooling-1", "render-3"], ["T1-17", "R3-23", "R3-27", "R3-28"]),
 "L3": (["render-3"], ["R3-19", "R3-20"]),
 "L4": (["tooling-1", "render-3"], ["T1-22", "R3-25"]),
 "L5": (["render-3"], ["R3-26"]),
 "L8": (["tooling-1"], ["T1-13"]),
 "L13": (["tooling-3"], ["T3-14", "T3-19"]),
 "L14": (["physics-2"], ["P2-24"]),
 "L15": (["tooling-3"], ["T3-06"]),
 "L17": (["render-3"], ["R3-21"]),
 "L19": (["render-3"], ["R3-24"]),
 "L20": (["tooling-1", "tooling-3"], ["T1-09", "T3-05"]),
 "L21": (["tooling-1", "tooling-3", "net"], ["T1-04", "T3-08", "N1-04", "N1-11", "N1-15"]),
 "L22": (["tooling-1"], ["T1-03", "T1-10", "T1-14", "T1-16", "T1-19"]),
 "L23": (["tooling-3"], ["T3-07"]),
 "L24": (["tooling-1", "tooling-3", "net", "physics-2"], ["T1-15", "T3-04", "T3-17", "N1-20", "P2-23"]),
 "L25": (["tooling-1", "tooling-3"], ["T1-01", "T1-02", "T1-06", "T1-07", "T1-08", "T1-18", "T1-20", "T1-23", "T3-01", "T3-10", "T3-13", "T3-03", "T3-16", "T3-18", "T3-20"]),
 "L26": (["net"], ["N1-03", "N1-05", "N1-12", "N1-13", "N1-14", "N1-17", "N1-22", "N1-23", "N1-25", "N1-26"]),
 "L27": (["tooling-1"], ["T1-21"]),
 "L28": (["tooling-3"], ["T3-09"]),
}
for _L in LANES:
    if _L["id"] in _FOLD4:
        _b, _i = _FOLD4[_L["id"]]
        _L["batches"] = _L["batches"] + [b for b in _b if b not in _L["batches"]]
        _L["owned"] = _L["owned"] + [f for f in _files(_i) if f not in _L["owned"]]
        _L["ids"] = _L["ids"] + _i
for _L in LANES:
    if _L["id"] == "L26":
        _L["name"] = "Netcode, rendezvous worker and transport"
        _L["deps"] = "none (net batch final); lobby and phone-controller rows live in L31"
_NET_LOBBY = ["N1-01", "N1-02", "N1-06", "N1-07", "N1-08", "N1-09", "N1-10", "N1-16", "N1-18", "N1-19", "N1-21", "N1-24"]
LANES[-1:-1] = [
 dict(id="L30", name="Agent API tests assert the hook, not its copy", batches=["tooling-1", "tooling-3"],
  goal="__apex hook tests (agent-view, anchors, obs/act edges, headless, the apex-tools MCP) call the live hook in the game VM and assert its documented shape and effect, not a hand-built object or a doc string",
  owned=_files(["T1-05", "T1-11", "T1-12", "T3-02", "T3-11", "T3-12"]),
  ids=["T1-05", "T1-11", "T1-12", "T3-02", "T3-11", "T3-12"],
  verify="node --test on the owned files", effort="M", model=SON, deps="L0's absolute-filename helper helps the vm-loaded hooks; not blocking"),
 dict(id="L31", name="Multiplayer lobby and phone controller run the real flow", batches=["net"],
  goal="lobby, seed sync, seat/role and phone-controller tests drive both peers through the shipped lobby code (no hand-set guest seed, no indexOf-order scans), and the camera-scan cancel test can see a live track",
  owned=_files(_NET_LOBBY),
  ids=_NET_LOBBY,
  verify="node --test on the owned units; the multiplayer specs alone via test-bg.mjs (one at a time)",
  effort="M", model=SON, deps="N1-01 needs a liveTracks() probe taken before scan.js clears video.srcObject; coordinate shared helpers with L26"),
]

# ---- pass 6a: race-1, ui-2, car-2 (partial), modes-1 (final)
def _r(p, *n): return [f"{p}-{i:02d}" for i in n]
_C2 = _r("C2", *[i for i in range(1, 21) if i != 5])
_FOLD5 = {
 "L4": (["race-1"], _r("RC1", 12, 13, 15)),
 "L3": (["ui-2"], ["U2-14"]),
 "L5": (["race-1"], ["RC1-18"]),
 "L8": (["ui-2", "modes-1"], ["U2-05", "M1-02"]),
 "L13": (["modes-1"], _r("M1", 5, 16, 17, 18, 19)),
 "L14": (["ui-2"], _r("U2", 4, 11, 12, 17, 18)),
 "L15": (["race-1"], _r("RC1", 14, 16, 17)),
 "L16": (["race-1", "modes-1"], _r("RC1", 7, 10) + ["M1-15"]),
 "L18": (["race-1"], ["RC1-02"]),
 "L19": (["race-1", "car-2"], ["RC1-20"] + _C2),
 "L20": (["race-1", "ui-2", "modes-1"], ["RC1-09"] + _r("U2", 1, 2, 6, 7) + _r("M1", 3, 7, 10, 13, 14, 20)),
 "L21": (["race-1"], ["RC1-08"]),
 "L25": (["car-2"], ["C2-21"]),
 "L28": (["modes-1"], ["M1-06"]),
}
for _L in LANES:
    if _L["id"] in _FOLD5:
        _b, _i = _FOLD5[_L["id"]]
        _L["batches"] = _L["batches"] + [b for b in _b if b not in _L["batches"]]
        _L["owned"] = _L["owned"] + [f for f in _files(_i) if f not in _L["owned"]]
        _L["ids"] = _L["ids"] + _i
_AI = _r("RC1", 1, 3, 4, 5, 6, 11, 19)
_MENU = _r("U2", 3, 8, 9, 10, 13, 15, 16, 19, 20, 21) + ["C2-05"]
_MODES = _r("M1", 1, 4, 8, 9, 11, 12)
LANES[-1:-1] = [
 dict(id="L32", name="AI race tests drive the real module", batches=["race-1"],
  goal="AI band, incident gate and incident rpm tests run ai-drive.js / ai-band.js in the game VM and assert car behaviour (brake point, lane, gap), not a copied formula",
  owned=_files(_AI), ids=_AI, verify="node --test on the owned files",
  effort="M", model=SON, deps="race-1 is partial 1/n: fold a continuation here before launch"),
 dict(id="L33", name="Title, menu, picker and photo-studio tests behave", batches=["ui-2", "car-2"],
  goal="menu, picker, title-rotation and photo-studio tests press keys or taps on the shipped DOM at phone landscape 844x390 with touch first, and assert focus, selection and what is visible",
  owned=_files(_MENU), ids=_MENU, verify="node --test on the owned units; each owned spec alone via test-bg.mjs",
  effort="M", model=SON, deps="ui-2 and car-2 are partial: fold continuations before launch; U2-02's async-predicate pattern also feeds L11's lint"),
 dict(id="L34", name="Replay, ghost, season and time-trial tests", batches=["modes-1"],
  goal="replay buffer, ghost, season calendar and time-trial tests run the shipped modules on recorded input and assert the replayed state, not source scans",
  owned=_files(_MODES), ids=_MODES, verify="node --test on the owned units; time-trial.spec.js alone via test-bg.mjs",
  effort="L (M1-04 converts the ghost/season-cal/replay-buf scans)", model=SON, deps="none (modes-1 final)"),
]

# ---- pass 7: platform (partial 1/n); race-1 2/2, tracks-2 2/2 (final); ui-2 2/n
_FOLD6 = {
 "L15": (["race-1"], ["RC1-22"]),
 "L20": (["ui-2"], ["U2-22"]),
 "L28": (["platform"], ["PL-14", "PL-15"]),
 "L30": (["platform"], ["PL-09", "PL-10", "PL-11", "PL-26"]),
}
for _L in LANES:
    if _L["id"] in _FOLD6:
        _b, _i = _FOLD6[_L["id"]]
        _L["batches"] = _L["batches"] + [b for b in _b if b not in _L["batches"]]
        _L["owned"] = _L["owned"] + [f for f in _files(_i) if f not in _L["owned"]]
        _L["ids"] = _L["ids"] + _i
_PLAT = "platform is partial 1/n (7 of 22 specs read but never run, no debugger pass): fold its continuation before launch"
_UIS = _r("PL", 4, 17, 18, 19, 20, 21)
_RUN = _r("PL", 1, 2, 3, 5, 6, 7, 8, 12, 13, 16, 22, 23, 24, 25)
LANES[-1:-1] = [
 dict(id="L35", name="UI specs on the shipped look and the phone profile", batches=["platform"],
  goal="ui-resize, ui-scale, ui-redesign, ui-audit and button-touch specs run with the shipped appearance defaults (large text, high contrast) and a phone profile (844x390 landscape, hasTouch + isMobile) instead of pinning desktop defaults",
  owned=_files(_UIS), ids=_UIS, verify="each owned spec alone via test-bg.mjs at 844x390 touch first (fleet-core); remote-group.mjs for a whole group",
  effort="M", model=SON, deps=_PLAT),
 dict(id="L36", name="Boot, smoke and runtime specs that can fail", batches=["platform"],
  goal="smoke, audit, boot-guard, wake-lock, soak, autopilot and dev-tools specs assert an outcome that a regression would change (the audit rival coast compares against a non-player speed, boot-guard covers the lazy-script exemption and offline), and the 120 s timeouts are triaged alone before any assert change",
  owned=_files(_RUN), ids=_RUN, verify="each owned spec alone via test-bg.mjs at loadavg < 3; smoke.spec.js first",
  effort="M", model=SON, deps=_PLAT + "; smoke, dev-tools-dom and ui-audit were red on 120 s timeouts: re-run each alone before classifying"),
]

# ---- late continuations: car-2 part 2/2 (final), physics-2 part 3b (partial)
_FOLD7 = {
 "L0": (["physics-2"], ["P2-27"]),
 "L10": (["physics-2"], ["P2-25"]),
 "L12": (["physics-2"], ["P2-26"]),
 "L13": (["physics-2"], ["P2-28"]),
 "L19": (["car-2"], ["C2-22", "C2-23", "C2-24"]),
}
for _L in LANES:
    if _L["id"] in _FOLD7:
        _b, _i = _FOLD7[_L["id"]]
        _L["batches"] = _L["batches"] + [b for b in _b if b not in _L["batches"]]
        _L["owned"] = _L["owned"] + [f for f in _files(_i) if f not in _L["owned"] and not f.startswith("js/")]
        _L["ids"] = _L["ids"] + _i

# ---- late continuations 2: race-2 part 3/3 (race-2b), physics-2 part 3c (physics-2c), both final
_FOLD8 = {
 "L10": (["physics-2"], ["P2-29", "P2-31"]),
 "L12": (["physics-2"], ["P2-30"]),
 "L14": (["physics-2"], ["P2-33"]),
 "L15": (["race-2"], ["RC2-22"]),
 "L17": (["race-2"], ["RC2-23", "RC2-24"]),
 "L19": (["physics-2"], ["P2-32"]),
}
for _L in LANES:
    if _L["id"] in _FOLD8:
        _b, _i = _FOLD8[_L["id"]]
        _L["batches"] = _L["batches"] + [b for b in _b if b not in _L["batches"]]
        _L["owned"] = _L["owned"] + [f for f in _files(_i) if f not in _L["owned"]]
        _L["ids"] = _L["ids"] + _i
