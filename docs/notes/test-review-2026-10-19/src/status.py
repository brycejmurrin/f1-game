UPDATED = "2026-10-19 ~05:50Z (22:50 Pacific, 10-18)"
FINAL = {"render-1", "render-2", "physics-1", "physics-2", "car-1", "ui-1"}
PARTIAL = {"render-3": "1/2", "race-2": "1/n"}
ALL = ["audio-1","physics-1","physics-2","race-1","race-2","render-1","render-2","render-3","tracks-1","tracks-2","car-1","car-2","modes-1","ui-1","ui-2","tooling-1","tooling-2","tooling-3","tooling-4","tooling-5","net","platform"]
k_final = len(FINAL); k_partial = len(PARTIAL); k_in = k_final + k_partial
PENDING = [b for b in ALL if b not in FINAL and b not in PARTIAL]
REP = {"render-1": "[render-1](reports/render-1.md)", "render-2": "[render-2](reports/render-2.md)", "render-3": "[part 1/2](reports/render-3.part-1of2.md)",
       "physics-1": "[physics-1](reports/physics-1.md) + [debugger addendum](reports/physics-1.addendum-debugger.md)",
       "physics-2": "[part 1/2](reports/physics-2.part-1of2.md) + [part 2/2](reports/physics-2.part-2of2.md) (stopped at the context cap; counted final)",
       "race-2": "[part 1/n](reports/race-2.part-1ofn.md)", "car-1": "[car-1](reports/car-1.md)", "ui-1": "[ui-1](reports/ui-1.md)"}
TABLE = [(b, "final" if b in FINAL else (f"partial {PARTIAL[b]}" if b in PARTIAL else "pending"), REP.get(b, "—")) for b in ALL]
NOT_RUN = [
 "- **render-3:** 15 of 21 specs pending part 2/2; no browser debugger column yet.",
 "- **physics-2** (capped at 300k context): browser chain C never read (understeer-cue, parts-ers, sliders, steer-migration, tilt-pipeline, touch-steer, gamepad, agent-drive-bench, parts-persistence, persistence-dom, camera-driving-hooks, css-player-smoke, garage-aero, menu-traversal, menu-baseline, parts-physics); drift, active-aero, aero-zones, world-physics, collisions ran only as VM twins; collisions-deep, collision-ai-fixes and persistence ran in neither; no spec debugger pass.",
 "- **race-2** (part 1/n): terrain-over-road still running, perf-race-entry not run, jump-start/pit-lane/race-control only as VM twins, debris failed 1/5 (Singapore wall-hit wait, 60 s), no spec debugger column.",
 "- **physics-1, car-1, ui-1:** every file ran and passed (physics-1: 742/743 with 1 skip by design, the provenance ancestry check needs a full clone). Files with no executable code under test had no debugger target (physics-1: 4, ui-1: 11).",
]
PATTERNS = [
 ("source-scan", "Source-text scans standing in for behaviour", "regex / indexOf / slice over js, css or md source; nothing under test executes (debugger n.a. or not-hit)"),
 ("condition-wrapped", "Condition-wrapped or early-return asserts", "`if (x) assert…`, `if (!gc) return`; the guard turns the test off in the very case it should catch"),
 ("tautology", "Tautologies", "asserts a stub's own return, a constant against its copy, `>= 0`, or a disjunction any outcome satisfies"),
 ("stub-copy", "Stub copies of real modules", "a hand copy of the code or data under test (resolver, damper, shader maths, field list, track stub) that cannot drift with it"),
 ("vm-no-filename", "vm code without a filename", "vm.runInContext / eval with no filename: no breakpoint by URL, coverage without lines"),
 ("slow-in-fast", "Slow files in fast groups", "a file over ~20 s in toolingFast, the pre-push floor"),
]
PATTERN_NOTES = [
 "- **Source-text scans** dominate the three render reports: gfx-backend-canary alone has ~160 (884 `assert.match`), webgpu-lifecycle ~306 asserts. The cheapest structural fix is a lint over `tests/` for fixed-width `slice(x, x+N)` windows and asserts after `//` on one line (R2-01, R2-02), then one lane per subsystem converting the highest-risk scans to behaviour.",
 "- **vm code without a filename** is counted once (DBG-02) but touches every vm-loaded module in these batches: governor.js, lamp-bake, chunked.js, lighting/*, spans.js, renderer-boot.js, and every `evalmachine.<anonymous>` render-1 met.",
 "- **Slow in fast** (toolingFast members over ~20 s, from each batch's run): `flyby-shots` 138 s, `aero-zone-tables` 49.7 s, `crest-marks` 47.7 s, `car-wing-foil` 34.3 s, `fuzz-untrusted-inputs` 31.2 s, `car-mesh-anchors` 30.0 s, `race-step-snap` 25.3 s, `perf-try` 25 s, `change-driver-tools` 20.9 s. Already in slow groups: `lamp-fixture-anchor` 109 s (sweeps), `car-fields-vm` 243 s and `quali-pace-parity-vm` 65.8 s (game-vm), `flyby-fleet` 53 s (node-slow), `build-worker` 44 s (sweeps). Slowest specs: `longitudinal` 556 s, `physics-fixes` 378 s, `quali` 737 s in a local browser.",
 "- **Source-text scans** recur in every batch: car-1 counts ~370 source assertions in the car canaries, DEBUGGER-B counts ~206 unit files that read source and assert on text.",
]
GAP_NOTES = [
 "Reviewer gap lists not carried as rows (low impact or unverified): render-1 lamp caps `MAST_LAMP_CAP`/`PIT_LAMP_CAP`/`CUSTOM_LAMP_MAX` and `selectCustomLamps` ties, `frame-math.mjs` `cullBoxes`/`marchGround`/flag thresholds, `elev-presets.js` loop closure; render-2 GLX partial-failure paths (`createTextureArray`/`createMesh`/`createChunkedMesh`), occlusion with mixed chunks, multi-draw UNSIGNED_INT, governor `cleanRace`, `PerfSpans.loaf()`, `renderer-picker.js` with no test file of its own; render-3 TLX WebGPU path and picker-driven backend switch, lit/sky WGSL compile.",
]
DEBUGGER = [
 "- **#2957 → PR #2967 (DEBUGGER-A, draft, head 2fd22f22, `Closes #2957`):** `type: \"node\"` targets in `debugger_targets` and attach, `Runtime.runIfWaitingForDebugger` on attach, and new batched tools `debugger_node_test` (per-file `--inspect-brk=127.0.0.1:0`, up to 8 in parallel, probes with locals, `runner:\"test\"` with a `NODE_OPTIONS --require` bootloader that attaches every `--test` child), `debugger_break` and `debugger_collect`. 85/85 js-debugger unit tests pass there. Its note `JS-DEBUGGER-IMPROVEMENTS-2026-10-19.md` (docs/notes, on that PR) lists bugs B1–B11 with repros. Row DBG-01.",
 "- **B2 matters for this review:** before #2967, a logpoint whose expression named `G`, `R`, `L`, `v`, `s` or `e` read a shadowing `var` from the logpoint wrapper (`G.state` logged `\"undefined\"`). Any reviewer evidence taken with js-debugger logpoints on page code that names `G` is suspect until re-taken on #2967's build (row DBG-04). The render and physics reviewers used their own CDP clients or coverage, so their columns are not affected.",
 "- **B7:** an exact-URL breakpoint on `js/<module>.js?v=dev` missed the deferred `?v=<hash>` script; #2967 matches query-less URLs (row DBG-05).",
 "- **DEBUGGER-B, PR #2959 (draft, head 8b095856):** note `NODE-DEBUGGING-2026-10-19.md` (docs/notes, on that PR). Measured: V8 names a vm script exactly by its `filename`; only an ABSOLUTE filename gives a `file://` URL that a file-path breakpoint and `--experimental-test-coverage` match. Relative `js/…` and bare names match only `urlRegex`; no filename is `evalmachine.<anonymous>`, shared by every unnamed script. ~480 files call vm. An opt-in preload (`NODE_OPTIONS=--require`, ~60 lines) rewrites relative and unnamed filenames to absolute; a 71-file sweep gave identical pass/fail with and without it. This refines DBG-02.",
 "- **Sub-issues of #2952 filed by DEBUGGER-B:** #2960 ship the preload + `npm run debug:unit`; #2961 migrate helpers to absolute filenames + a `vm-filename-lint`; #2962 a \"Debug a Node test\" section in the skill and TESTING.md; #2963 determinism bisect (per-step state hash); #2964 GPU capture hooks (WGX labels, Spector/webgl-lint loader); #2965 `performance.measure` timeline tracks; #2966 `OfflineAudioContext` engine-pitch test. Plus #2957 (closed by #2967 on merge).",
 "- **Gap map (DEBUGGER-B Q2):** a breakpoint is useless for ~206 source-text-scan unit files (nothing executes; the fix is behaviour tests or a failure message printing the matched span), inside GLSL/WGSL and Rapier wasm, and in the live rAF loop (use `freeze()`/`headless()`/`step()`); partial for WebAudio, WebRTC timing, determinism (diff two runs, #2963) and WebXR.",
 "- **Reviewer workarounds** before the MCP fix: render-1 `NODE_V8_COVERAGE` only; render-2 a CDP client with `setBreakpointByUrl` + logging condition; render-3 and physics-1 `setInstrumentationBreakpoint beforeScriptExecution` + scriptId breakpoints by source match (reproduced by DEBUGGER-B: brake-cue 64 hits, cam-avoid 7). Later batches should use `debugger_node_test` from #2967 once it merges.",
 "- **Node 22 flag (DBG-03):** `--experimental-test-isolation=none`, not `--test-isolation=none`.",
]
VERIFY = [
 "Synthesis spot checks (`git show origin/claude/f1-game-project-26h3ng:<file>`, tip cd907d4c unless noted):",
 "- Confirmed: R1-03 `insides >= 0`; R1-04 no `--expose-gc` in package.json or groups.json; R2-01 assert after `//` on perf-try:337 (e90ae858); R2-05 render-rate test asserts only `drawn === ticks`; R2-07 the `>= 52` wrapper and `return 0`; R3-01 `run(seed)` calls `A.reset(…, seed)`; R3-02 `__apexGlErrors` only on assets-api.spec:153; R3-03 `APEX_PERF_FRAMETIME_STRICT` set nowhere; R3-12 four modes in the loop; R1-10 flyby-shots in toolingFast.",
 "- Partly: R1-09 the `MAT_LAYERS = 17` / `[17]` literal is in 2 test files, not 5. R1-11 both limits exist (45 deg/s in `tests/helpers/flyby-audit-rules.mjs:19`, PAN_MAX 25 deg), but whether they measure the same thing is unproven, so it is ranked low.",
 "- Line drift: reported lines for render-rate (252 → 99) and lamp-fixture-anchor (302 → 330) differ on the tip; rows carry both. Reviewers worked on the 2026-10-19 tip; a pass-2 lane re-locates by the quoted code, not the line.",
 "- Batches folded on 2026-10-19 ~05:50Z (physics-1, physics-2, race-2 part 1, car-1, ui-1) were normalized by two read-only subagents, which re-read their batch's highest-severity cites on cd907d4c; their `synth_check` says what they found.",
 "- Not checked by the synthesis: rows marked `subagent-unverified` without a `synth_check` (R1-12…R1-15, R1-17, R3-07, R3-09, R3-14). They rank one point lower until a lane re-reads them.",
]
HIDDEN_BUG = {"R1-01": "tuner-panel.js scope buttons never set aria-pressed (shipped a11y bug)"}
