<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT render-3 (partial 2/2 (specs))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260904751
- Posted: 2026-10-19T06:12:19Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 2/2 (specs) (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT render-3 (partial 2/2) — specs. Part 1 (all 32 unit rows, debugger column, top findings, gaps): https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260060035. Stopped here on the 120k context limit; the Not-run list below is what a continuation must do.

Runs: `npm test -- <spec>` one at a time, SwiftShader, no /dev/dri, 1500 s per-spec cap of my own driver (a container resume at 05:42 also killed one driver mid tlx-probes; relaunched). Reviewer verdicts are reads by a read-only subagent, not re-verified unless marked grep-confirmed.

## Per-file table (spec)
file | run | classification | debugger (MCP, browser) | quality | mock / wrong-target | verdict
---|---|---|---|---|---|---
agent-determinism-frame | FAIL 147 s, 120 s test timeout in `page.evaluate` (rAF loop) | not yet re-run alone → unclassified (suspect environment: rAF under SwiftShader) | not run | weak: 2nd `run(42)` re-seeds via simSeed (game.js:589-595) so stream advance is erased | cannot fail for stated reason | rewrite
assets-api | pass 101 s | – | not run | mixed; `__apexGlErrors` defined nowhere (grep-confirmed) → GL-error check vacuous; header's failure-mode coverage mostly absent | vacuous check | strengthen
camera-hooks | pass 109 s | – | not run | mixed: mostly shape checks; L189-197 compares eye to centre-line roadY at lateral 0 though orbit puts the eye ~30 m sideways | – | strengthen
camera-tuner | pass 132 s | – | not run | mixed; L219 "other twelve" but 20 modes, 4 checked; clamp bounds hard-coded | stale title | strengthen
camera | pass 105 s | – | not run | strong-ish; `frameDelta > 1` arbitrary | – | keep
garage-first-frame | pass 60 s | – | not run | good e2e pixel check, loose nonblank oracle | – | keep
image-grade-visual | **TIMEOUT at my 1500 s cap** (sat in `waitForFunction` at "blacks visibly change…", 0/10 done at 29 s) | environment-suspect (SwiftShader); not re-run alone | not run | weak: GRADE_MIN/MAX stale vs TUNE_DEFS (knobs.js:200-214); only assertion `new Set(image).size > 16` | arbitrary thresholds | strengthen
instanced-draw | pass 323 s | – | not run | mixed: L514-516 png byte length > 20000 stands in for "not black" | weak oracle | strengthen
lighting-ab | pass 602 s | – | not run | keep; PCSS test checks only the `GLX.pcss()` flag (glx.js:2979); catalog scan is node-only → move to unit | – | keep
lighting-tuner-grade | pass 72 s | – | not run | strong | – | keep
material-shimmer | SKIPPED (opt-in `APEX_SHIMMER`; the runner reports an all-skipped run as red) | n.a. | not run | mixed: `ratio < 2.0` from 6 frames, one SwiftShader run; not a default gate (`test:shimmer` only) | – | keep as opt-in; strengthen
parts-factory-presets | pass 114 s | – | not run | strong behavioural; expected key computed with `factoryKey` (the function under test) | self-comparison | keep + VM unit twin
perf-frametime | FAIL 148 s: `PerfGov frame history`, expected > 4, received 4 (SwiftShader <1 fps) | environment | not run | weak: only hard asserts `snap`, `frames > 4`; `APEX_PERF_FRAMETIME_STRICT` set nowhere (grep-confirmed: only the helper and spec comments) so regressions are annotations | lane named regression can't fail; the one hard assert is fragile on slow boxes | relabel telemetry / enable STRICT with same-run control
presets | pass 28 s | – | not run | mixed: L78-82 `<=`/`>=` lets STANDARD==RELAX pass; ROOKIE untested; duplicates unit steer-presets | – | merge ordering into unit with strict `<`
projection | pass 21 s | – | not run | mixed: 2 m budget vs 4 m node spacing; `__apex.projTest` passes the TRUE `s` as hint (apex-track.js:41) so wrong-lap/seam recovery never exercised; one circuit | – | rewrite as VM unit over several circuits with perturbed hints
render-boot | pass 50 s | – | not run | strong liveness (positive webgl2 ctx, clip, no errors); test 3 branches on `hasAdapter` | – | keep, split test 3
tlx-probes | **TIMEOUT at my 1500 s cap**; 13/18 passed by 06:07; **1 FAIL: M6 "skid batch records after a hard driven stint" (192.9 s)** — `no skid mark reached the TLX batch in 60 s` with state `{"state":"race","frozen":true,"cam":"helmet","speed":30.26,"offroad":true,"skidIntensity":0.5,…}`; slow steps 80.9 s Close context, 65.8 s Wait for function | not re-run alone → real vs environment unclassified (frozen sim under SwiftShader is plausible) | not run | mostly strong state hooks; weak: png `bytes > 5000` non-blank oracle (~L120, ~L230), env-adaptive `if (st.software)` branches (~L172), hard `waitForTimeout(400)`, near-vacuous last "menu reachable" test | – | keep; swap byte-count for `frameContent`
track-switch-memory | NOT RUN (started, stopped on limit) | – | not run | reviewer: strong (exact `aliveTracks==[id]`, orphans==0, floor 40, GROWTH_MB=10 vs measured 0.4-1.0); only 2 circuits; reads r186 private `renderer._nodes.nodeBuilderCache` | – | keep
vr-emulated | NOT RUN | – | not run | see part 1 finding 7 (tests 4, 7, 8) | – | strengthen
webgl-probes | NOT RUN | – | not run | reviewer: car-shadow test strong; L210-222 duplicates L137-175, title claims shader gets ≤ 48 but reads `lightState().numLights` (a game-side counter); stale "sized for 32" comment (MAX_LIGHTS is 48); `.catch(()=>{})` swallows day-wait timeout | – | strengthen/merge
xr-plan (spec) | NOT RUN | – | not run | reviewer: weak; asserts `gfxBackend === "webgl2"` it seeded (L54, L101); `hasXr` tautology (IWER installs navigator.xr); duplicates unit xr-plan.test.mjs | – | merge into vr-emulated, delete

## Top findings added in this part (rank continues after part 1)
- tests/specs/tlx-probes.spec.js M6 skid batch | fails here after 192.9 s with the sim `frozen:true` and no skid mark in 60 s | either a real regression in the TLX skid batch or a SwiftShader stall; the same spec has hard sleeps and env-adaptive branches so a pass elsewhere is not strong evidence | re-run solo; assert on the batch hook only after confirming `frozen:false` | unknown
- tests/specs/perf-frametime.spec.js:149-150 | hard assert `frames > 4` fails with exactly 4 frames on this box | the lane's only real assertion is a slow-box tripwire, not a regression detector | see part 1 finding 3 | high
- tests/specs/image-grade-visual.spec.js | did not complete a single test in 1500 s here | lane may be unrunnable on SwiftShader boxes; CI result needed | check CI timings for this spec | med

## Not run
- Specs never run: track-switch-memory (started, stopped), vr-emulated, webgl-probes, xr-plan.spec.
- Solo re-runs not done (rubric asks for one): agent-determinism-frame, image-grade-visual, tlx-probes (M6), perf-frametime.
- Browser MCP-debugger check (debug-chrome → js-debugger MCP) for ALL 21 specs: not started; `debug-chrome` refuses beside a run. Suggested breakpoints are in artifacts/test-review/render-3/agentA.md and agentB.md (the "BP:" lines).
- Unit files: all 32 run and debugger-checked (part 1); nothing outstanding.
- Reviewer-read rows (not independently re-verified): everything not marked grep-confirmed/debugger-confirmed.

Artifacts (container-local, may be lost on reclaim): artifacts/test-review/render-3/{agentA.md,agentB.md,report1.md,cdpbp2.mjs,spec-*.log,spec-summary*.txt,bp-summary.txt}.


---
_Generated by [Claude Code](https://claude.ai/code)_
