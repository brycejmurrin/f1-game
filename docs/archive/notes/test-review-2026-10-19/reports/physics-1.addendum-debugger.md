<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT physics-1 (final (debugger addendum))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260210052
- Posted: 2026-10-19T05:15:28Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final (debugger addendum)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT physics-1 (debugger addendum: every file)

This follows the orchestrator's scope update ("use the js debugger to validate all tests"). It replaces the debugger column of [REPORT physics-1](https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260119034), which sampled 22 files. **64 of 68 files: hit (cdp). 4 files are n.a. because they contain no executable code under test.** That n.a. is itself a finding: those tests check source text, not behaviour.

**Method (cdp):** each test file runs directly under `node --inspect-brk=<port>`, so there is no `--test` child process. A CDP client (`artifacts/test-review/physics-1/cdp-bp.mjs`) sets the breakpoint and records the hit count, the top stack frame and one local per hit. It then drops the breakpoint after 50 hits so hot loops run at full speed. Each hit was checked against the expected function name in the paused stack. Three loading styles needed special handling:
- **game-vm** loads source under absolute file names, so URL breakpoints work as-is.
- **Anonymous `vm` scripts** were matched as `evalmachine.<anonymous>`, with a closure condition where several anonymous scripts share line numbers (pace-math).
- **URL-less `eval` / `new Function` code** (steer-tuning-lock, thermal-drift) pauses on `Debugger.setInstrumentationBreakpoint("beforeScriptExecution")`. The client finds the function in the script source and sets a scriptId breakpoint before the code runs.

| file | breakpoint (code under test) | hits | result |
|---|---|---|---|
| active-aero-vm | js/physics/aero-zones.js:149 | 2 | hit (cdp) |
| aero-defaults-2026 | js/car/car-body-geom.js:994 | 44 | hit (cdp) |
| aero-flap-travel | js/car/car-body-geom.js:317 | 13 | hit (cdp) |
| aero-zone-tables | js/physics/aero-zones.js:174 (table branch: imola, monza only, of 21) | 2 | hit (cdp), 19 tables never reach it |
| aero-zones-turns | js/physics/aero-zones.js:168 | 45 | hit (cdp) |
| aero-zones-vm | js/physics/aero-zones.js:149 | 19 | hit (cdp) |
| ai-drive | js/physics/ai-drive.js:515 | ≥50 | hit (cdp) |
| boot-input-shape | js/game.js:182 | 8 | hit (cdp) |
| brake-cue | js/physics/brake-cue.js:30 | ≥50 | hit (cdp) |
| browser-workers | tools/lib/browser-workers.mjs:31 | 7 | hit (cdp) |
| centreline-kinks | tools/lib/centreline-kinks.cjs:8 | 6 | hit (cdp) |
| change-driver-tools | tools/ci/pick-tests.mjs:434 | 6 | hit (cdp) |
| collision-ai-fixes-vm | js/physics/collide.js:535 | ≥50 | hit (cdp) |
| collision-contact-vm | js/physics/collide.js:470 | ≥50 | hit (cdp) |
| collisions-deep-vm | js/physics/collide.js:535 | ≥50 | hit (cdp) |
| collisions-vm | js/physics/collide.js:535 | ≥50 | hit (cdp) |
| css-layers | — | — | **n.a.** (no JS under test: parses css/*.css + index.html text) |
| css-prefers-cascade | — | — | **n.a.** (no JS under test: own CSS parser over css/ text) |
| desktop-version | desktop/lib/version.cjs:9 | 8 | hit (cdp) |
| digital-steer | js/input/input.js:503 | ≥50 | hit (cdp) |
| drift-vm | js/physics/player-forces.js:61 | ≥50 | hit (cdp) |
| driver-ratings-personality | js/data/driver-ratings.js:134 | 8 | hit (cdp) |
| driving-coach | js/race/driving-coach.js:260 | 25 | hit (cdp) |
| driving-cues | js/audio/driving-cues.js:155 | ≥50 | hit (cdp) |
| driving-line-opts | js/ui/driving-line-opts.js:50 | 10 | hit (cdp) |
| driving-line-pace | js/game.js:4061 | 1 | hit (cdp) |
| driving-line | js/render/shared/driving-line.js:143 | 12 | hit (cdp) |
| editor-workspace | js/ui/editor-workspace.js:6 | 13 | hit (cdp) |
| flyby-pose-inverse | js/camera/flyby-seq.js:813 | 47 | hit (cdp) |
| fuzz-untrusted-inputs | js/car/ghost-share.js:210 | ≥50 | hit (cdp) |
| garage-personality | js/garage/scene.js:562 | 5 | hit (cdp) |
| geometry-paths-baseline | tools/ci/geometry-paths.mjs:175 | 3 | hit (cdp) |
| grip-steer | js/physics/grip-steer.js:71 | ≥50 | hit (cdp) |
| hud-inputs | js/ui/hud-inputs.js:37 | 11 | hit (cdp) |
| hud-tyres | js/ui/hud-tyres.js:18 | 12 | hit (cdp) |
| image-grade-shaders | — | — | **n.a.** (shaders are regex-scanned; numeric tests run a JS copy inside the test) |
| input-bindings | js/input/bindings.js:135 | 8 | hit (cdp) |
| input-ghost-replay-vm | js/car/input-ghost.js:451 | ≥50 | hit (cdp) |
| input-ghost | js/car/input-ghost.js:395 | 26 | hit (cdp) |
| layers-nav-memo | js/ui/layers.js:229 | 29 | hit (cdp) |
| log-namespaces | js/core/log.js:14 (top level) | 2 | hit (cdp) |
| longitudinal-vm | js/physics/player-forces.js:61 | ≥50 | hit (cdp) |
| pace-arming-vm | js/game.js:4691 | ≥50 | hit (cdp) |
| pace-math | js/race/pace-math.js:42 (vTop, conditional on its closure) | ≥50 | hit (cdp) |
| persistence-vm | js/core/store.js:667 (noteBroken); test L82 reads warned=0 | 9 | hit (cdp) |
| physics-baseline-provenance | tests/helpers/baseline-blessing.mjs:18 | 4 | hit (cdp) |
| physics-characterization-vm | js/physics/player-forces.js:61 | 390 | hit (cdp) |
| physics-feel-vm | js/physics/player-forces.js:61 | ≥50 | hit (cdp) |
| physics-oracle | tools/check/physics-oracle.mjs:98 | 1 | hit (cdp) |
| physics-rows-vm | js/physics/player-forces.js:61 | ≥50 | hit (cdp) |
| player-collision-side | js/audio/engine.js:2669 (collision; concatenated L4256) | 8 | hit (cdp) |
| player-dynamics-shipped-vm | js/physics/player-forces.js:61 | ≥50 | hit (cdp) |
| player-dynamics-vm | js/physics/player-forces.js:61 | ≥50 | hit (cdp) |
| player-forces | js/physics/player-forces.js:22 | ≥50 | hit (cdp) |
| player-tools-backup | js/ui/settings-export.js:514 | 19 | hit (cdp) |
| player-tools-ui | js/ui/settings-search.js:96 | ≥50 | hit (cdp) |
| quali-pace-parity-vm | js/game.js:4691 | ≥50 | hit (cdp) |
| quali-persist | js/race/quali-model.js:437 | 7 | hit (cdp) |
| retired-car-obstacle-vm | js/game.js:6459 | 4 | hit (cdp) |
| skidmarks-cadence | js/fx/skidmarks.js:85 | ≥50 | hit (cdp) |
| steer-feel-lift-off | js/physics/player-forces.js:316 | ≥50 | hit (cdp) |
| steer-lock-taper | js/game.js:5929 lockTaper (vs 12, 69-71); conditional 15<vs<30 on :5930 | ≥50 / **0** | hit (cdp); blend **not-hit** |
| steer-presets | js/input/steer-tuning.js:342 | 49 | hit (cdp) |
| steer-tuning-lock | js/input/steer-tuning.js:182 (touchRangeFromSlider via new Function; instrumentation bp) | 42 | hit (cdp) |
| thermal-drift | js/perf/thermal-drift.js:49 (feed, eval'd; instrumentation bp); test L184 on=2 off=0 | ≥50 | hit (cdp) |
| track-maps-corners | js/ui/track-maps.js:50 | ≥50 | hit (cdp) |
| trail-brake-turnin | js/physics/player-forces.js:61 | ≥50 | hit (cdp) |
| twin-drift | — | — | **n.a.** (regex over test sources; no module under test) |

**What a "hit" does and does not prove:** the breakpoint shows the test executes the module function its key assertion depends on. It does not make the assertion strong. Findings 1-15 in the main report stand. In several of them the code runs but the assertion checks a copy, a regex or nothing: collision-contact mirrors, steer-lock-taper copy tests, grip-steer pooling, persistence "fires once".

**Added to Gaps (pass-2 tooling):** the js-debugger MCP cannot attach to Node targets. `debugger_targets` on a `--inspect` endpoint returns `[]`, and `debugger_attach` answers "Unknown page targetId". Every unit-test reviewer has to hand-roll CDP. Proposed fix: accept `type: "node"` targets from `/json/list` in the MCP. Also support scriptId breakpoints with a `beforeScriptExecution` instrumentation pause, so `eval` / `new Function` code (tests that extract a function from source) can be broken in.

**Not run:** none. The debugger column now covers every file with executable code under test.

---
_Generated by [Claude Code](https://claude.ai/code)_
