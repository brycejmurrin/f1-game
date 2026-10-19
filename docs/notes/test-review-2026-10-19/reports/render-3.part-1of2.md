<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT render-3 (partial 1/2)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260060035
- Posted: 2026-10-19T05:02:48Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 1/2 (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks
- Normalized (only change to the body): files that do not exist yet (reviewer proposals) are unquoted or written `dir/<new:name>.ext`, so docs-integrity does not read a proposal as a claim: wgx-source-pins.test.mjs

---

REPORT render-3 (partial 1/2) — batch render-3, 53 files (32 unit, 21 spec). Part 1: all 32 unit files run + debugger-checked; 6 of 21 specs run (rest in 2/2).

Method. Unit: `node --test <file>` (all 32 pass, ≤9 s each). Debugger: the js-debugger MCP only lists Chrome *page* targets, so it cannot attach to `node --inspect` (`debugger_targets` → `[]`, attach → "Unknown page targetId"; orchestrator told). Used the agreed fallback: own CDP client on `node --inspect-brk` with `Debugger.setInstrumentationBreakpoint beforeScriptExecution` + `setBreakpoint` matched by source-line text (works for vm scripts with a bare or no filename), counting `hitBreakpoints`. Reviewer reads (purpose/mocking/gaps) were done by two read-only Sonnet subagents; where a finding says "grep-confirmed" I re-checked it myself, the rest are reviewer reads, not independently re-verified. Specs: `npm test -- <spec>` one at a time, SwiftShader, no /dev/dri.

## Per-file table (unit)
file | purpose | run | debugger (cdp) | quality | mock / wrong-target | verdict
---|---|---|---|---|---|---
shadow-pass-depth | sun shadow depth span | pass 7s | hit shadow-pass.js:73 ×145 | strong; L101-105 SRC asserts redundant with L115 | real code in VM | keep
skill-render-ui-surface | pins SKILL.md prose/order | pass <1s | n.a. (text scan of a .md) | weak: protects docs wording not behaviour | wrong target | delete / fold into agent-config tests
stuck-census | tooling census | pass <1s | hit tools/lib/stuck-census.mjs:21 ×16 | strong | tooling test in render batch | keep, regroup to tooling
tex-census | GLX texture-memory census | pass <1s | hit glx.js:1325 ×9 | strong; `mipBytes` copies impl `_mipBytes` | TLX (default) `texCensus` undefined (tlx.js:4508) pinned by nothing | keep + add TLX case
tlx-anim-pump | vendored three Animation pump | pass 1s | hit tlx.js:11 ×4 | mixed | hand-written `fakeAnimation`, not vendor class | strengthen
tlx-car-shadow-cpu | car-shadow mirror sweep / shared inst cap | pass <1s | **not-hit** tlx.js:3725 (file only read as text) | **weak**: 5 string-presence asserts, one matches a comment | source scan stands in for behaviour | **rewrite** (lift `sweepCarShadowMirrors`)
tlx-chunked-lifecycle | chunked terrain upload/free | pass <1s | hit tlx-chunked.js:326 ×28 | strong (triangle-set equality, packed values) | real code | keep
tlx-cull-shadow-pack | instance cull + shadow pack, TLX/GLX/WGX | pass 1s | hit tlx.js:2094 ×82, :2266 ×4 | strong | `castInstanced` copied into test (L296) | keep
tlx-fail-scope | device-failure scoping | pass <1s | hit tlx-shadow.js:314 ×3 | mixed; M13 long-regex L66-83 | regex stands in | keep, lift bodies
tlx-hunt3 | 10 TLX topics, real three on fake GL | pass 7s | hit tlx.js:2655 ×142 | mostly strong, ~50 SRC regexes | fake GL | regroup/split by subsystem
tlx-hunt4 | instance upload | pass 2s | hit tlx-shadow.js:300 ×2 | strong; L338-360 brittle `setUsage(Dynamic)` count | – | keep
tlx-hunt4b | chunk attrs, cloud cache | pass 4s | hit tlx-chunked.js:165 ×40 | strong | – | keep, split cloud-cache
tlx-hunt4c | casters / mirror | pass 9s | hit tlx-shadow.js:400 ×4 | strong, has control test L156; L430 off-topic | – | keep
tlx-inst-cells | instance cell upload | pass <1s | hit tlx.js:2034 ×4 | strong | – | keep
tlx-mat-key-memo | material-key memo stays fresh | pass <1s | hit tlx.js:1837 ×90 | mixed: FIELDS hand-copied from `buildMatKey` | copied constant | strengthen (Proxy-record fields)
tlx-post-fixed-mats | fixed post-targets don't swap `.tex.value` | pass <1s | **not-hit** tlx-post.js:246 (tests 1-2 regex only) | **weak** tests 1-2; sharpen test ok | source scan | rewrite 1-2
tlx-round2 | TLX-01..03 hunt fixes | pass <1s | hit via tsl-lit lifts; **not-hit** tlx.js:1118 DPR_CAP (text) | strong except TLX-02/03 one-line regex tautologies | regex | keep, replace TLX-02/03
tlx-texture-release | texture source release | pass 1s | hit tlx.js:51 ×73 | strong | – | keep
tlx-viewport | fixed-target viewport mapper (flag default off) | pass <1s | hit tsl-viewport.js:55 ×2; **not-hit** tlx.js:1104 (canary text) | mixed | canary is text | keep
ui-fit-camtune-portrait-r7 | tuner.css r7 portrait rail-off | pass <1s | n.a. (CSS parse) | mixed: exact-string equality, no layout | change-detector | merge into one tuner-css test
ui-fit-camtune-tap-r5 | tap floors | pass <1s | n.a. (raw regex on CSS) | weak/mixed: `[^}]*` crosses rules | scan for computed style | rewrite onto cssRules + merge
ui-fit-flyby-tap-r6 | flyby tap floors | pass <1s | n.a. | weak/mixed; slice anchored on `/* GARAGE ANGLE` comment | same | rewrite + merge
ui-fit-lighting-flyby-stack | stacked dock | pass 1s | n.a. | mixed; L47-57 duplicates flyby-tap-r6 | formulas copied | merge, drop dup
ui-fit-lighttune-tap-r6 | lighting tap floors | pass <1s | n.a. | weak/mixed; slice ends on `/* #pc-toggle` | same | rewrite + merge
wall-clamp | wall contact, FX gating | pass <1s | hit wall-clamp.js:133 ×222, :146 ×171, :121 ×221 | strong FX/rate-limit; mixed physics (L86-96) | AiDrive/Debris/Audio stubs; L322-327 regex of game.js | strengthen (gaps below)
webgpu-lifecycle | WGX boot, device.lost ladder, lifetimes | pass 3s (129 tests) | hit wgx.js:342 ×101, :642 ×51, :1533 ×196 | strong in 67 VM tests; **47 tests (~306 asserts) are WGSL/JS text pins** | mock GPUDevice never compiles WGSL | regroup: source pins to own file, add real compile lane
xr-backend-pin | ENTER VR reload pin round-trip | pass <1s | hit xr-boot.js:71/78 ×7 | strong | – | keep
xr-cull-union | XR union frustum, 40k random pts | pass <1s | hit xr-rig.js:169 ×4 | strong (missed===0) | 2% tightness bound arbitrary | keep
xr-opts | VR keys, bootPick | pass <1s | hit apex-xr.js:118 ×2 | mixed: L317 disjunction near-vacuous; L320-325 vacuous | – | strengthen
xr-phase0 | whole XR lifecycle races | pass 1s (52) | hit xr-session.js:159 ×35, :371 ×18, tlx.js:5164/5167 ×4 | strong for races; vendor test weak | tlx.js sliced by text anchors (L690-720) | regroup (catch-all)
xr-plan | renderer path table | pass <1s | hit xr-plan.js:77 ×11 | strong table; L153-156 vacuous; L158-162 glx.js regex | – | keep, delete vacuous
xr-visibility-pause | headset menu pauses race | pass <1s | hit xr-boot.js:238 ×4 | strong | – | keep

## Per-file table (spec) — run so far
file | run | note
---|---|---
agent-determinism-frame | **FAIL 147 s**, `Test timeout of 120000ms exceeded` in page.evaluate (rAF loop); solo re-run pending → classification pending (likely environment: SwiftShader rAF) | reviewer: test cannot fail for its reason (see finding 1)
assets-api | pass 101 s | verdict strengthen
camera-hooks | pass 109 s | strengthen
camera-tuner | pass 132 s | strengthen
camera | pass 105 s | keep
garage-first-frame | pass 60 s | keep
Remaining 15 specs: results + MCP-debugger column in part 2/2. Reviewer verdicts for all 21 specs are in 2/2.

## Top findings (ranked)
1. tests/specs/agent-determinism-frame.spec.js:44-49 | second `run(42)` re-seeds via `simSeed`, erasing any stream advance during the 20 rAF frames | the test cannot fail for the reason it states | compare stream position before/after rendered frames, or reset without reseeding | high (reviewer read of game.js:589-595). Also timed out here (120 s).
2. tests/specs/assets-api.spec.js:153 | `window.__apexGlErrors` is defined nowhere (grep-confirmed: only this line) → always 0 | "still renders, no GL errors" check is vacuous | use `GLX.gpuErrors()` (glx.js:2921) + `frameContent` | high, grep-confirmed
3. tests/specs/perf-frametime.spec.js:149-218, tests/helpers/perf-frametime.mjs:34 | only hard asserts `snap` and `frames>4`; `APEX_PERF_FRAMETIME_STRICT` is set nowhere (grep of .github, tools, package.json, groups.json: only the helper/spec comments) | lane named "regression" can never fail | enable STRICT with same-run control or relabel telemetry and drop from gating groups | high, grep-confirmed
4. tests/unit/webgpu-lifecycle.test.mjs:937-1430 (~25 tests, ~306 asserts) | pins literal WGSL/JS text (`/0\.90, 0\.96, 1\.12/`, "full parity batch" L1329, "closes look gaps" L1346/1430) | passes while a shader miscompiles, fails on harmless renames; the file itself says (≈L2060) "a pin copied from the source proves only that nobody changed it" | move to wgx-source-pins.test.mjs; add real Tint compile (gpu-census) + harness lane asserts | high
5. tests/unit/tlx-car-shadow-cpu.test.mjs:12-23 | 5 string-presence asserts, one matches a comment; debugger confirms tlx.js is never executed (tlx.js:3725 not-hit) | passes with dead code | lift `sweepCarShadowMirrors`, drive aging; run `sharedInstCap` mobile true/false | high, debugger-confirmed
6. tests/unit/tlx-post-fixed-mats.test.mjs tests 1-2 | regex-only for "no `.tex.value` swap"; tlx-post.js:246 not-hit | doesn't prove the swap stopped | compile post chain on fake GL (hunt3 `postChain()` pattern), count writes | high, debugger-confirmed
7. tests/specs/vr-emulated.spec.js tests 4, 7, 8 | test 4 asserts only no-pageerror (visibility pause never asserted); test 7 has dead `XrBoot.diag && null` and is branch-conditional so the pin path isn't forced; test 8 `title: !!(getElementById("title")||document.body)` tautology, `data:image/png` passes for blank canvas | false confidence in pause/pin/capture | spy on `pause`; force `canAttach=false`; `frameContent` | high (reviewer read; spec not yet run)
8. tests/unit/wall-clamp.test.mjs:77-258 (gap) | no test of human nose-in heading align (wall-clamp.js:121-123), first-strike speed loss (:113), steer-into-wall scrub/`wallT` (:178-184), left wall (`into=-1`, every human test uses +x), `wallHits`, WallEndFace branch (:45), DebrisWorld.wallImpact/promoteBarrier/notifyWall (:50-65; stubs never asserted) | player wall feel unpinned | add both-wall cases asserting `c.head`, `c.speed`, `wallT`, stub call counts | high. Note L322-327 regexes game.js for `WallClamp.apply(c, _wallCtx)`: move to a lint.
9. tests/specs/image-grade-visual.spec.js:29-43, 429-439 | GRADE_MIN/MAX stale vs TUNE_DEFS (knobs.js:200-214); only assertion `new Set(image).size > 16` | the "extremes" test is neither extreme nor meaningful | derive extremes from TUNE_DEFS in page; assert frame differs from neutral | high (reviewer read)
10. tests/unit/xr-opts.test.mjs:317 | `r.includes("XRGPUBinding") || r.includes("xrgpu") || f.from === "webgpu"` | passes for any webgpu fallback | assert exact reason string (xr-plan.js:105); delete vacuous L320-325 (same for xr-plan.test.mjs:153-156) | high
11. tests/unit/ui-fit-camtune-tap-r5 / flyby-tap-r6 / lighttune-tap-r6 / camtune-portrait-r7 / lighting-flyby-stack | raw regex with `[^}]*`/`[\s\S]*?` across rules; slices anchored on comments (`/* GARAGE ANGLE`, `/* #pc-toggle`, `} /* @layer components */`); L47-57 of lighting-flyby-stack duplicates flyby-tap-r6 | brittle to comment edits, can match the wrong rule, no computed layout | port to helpers/css-rules.mjs, merge the 5 files into one | high
12. tests/specs/camera-tuner.spec.js:219 | title "the other twelve" but 20 modes exist and 4 checked | 15 modes unchecked for leaks | loop all modes except chase | high (reviewer read)
13. tests/specs/instanced-draw.spec.js:514-516 | `page.screenshot` byte length > 20000 stands in for "scene not black" | DOM/HUD bytes pass a black canvas | `frameContent` on presented canvas | med
14. tests/specs/xr-plan.spec.js:54,101 + presets.spec.js:78-82 | xr-plan.spec asserts `gfxBackend === "webgl2"` that the test seeded; presets uses `<=`/`>=` so STANDARD==RELAX passes, ROOKIE untested | redundant full-boot dup / collapsed ladder unnoticed | fold xr-plan.spec into vr-emulated; strict `<` + move ordering to steer-presets unit | med-high (reviewer read)
15. tests/unit/tlx-mat-key-memo.test.mjs:52-57 | hand-copied FIELDS list | a field added to `buildMatKey` leaves the stale-memo hazard undetected | record fields read via Proxy and mutate each | med

## Gaps
- Tooling: the js-debugger MCP has no Node-target support (page targets only) → pass-2 tooling fix. My CDP harness: artifacts/test-review/render-3/cdpbp2.mjs (instrumentation breakpoint + line-text match).
- TLX is the default backend but `__apex.texCensus()` on TLX (= `supported:false`, tlx.js:4508) is pinned by nothing; TLX WebGPU path and picker-driven backend switch uncovered.
- No test shows the lit/sky WGSL compiles (only wgsl-bindings.test.mjs); frame-submit/ring-flush order (webgpu-lifecycle L2437) and `setSpatialUpscale` (wgx.js:2097) are regex-only.
- XR: untested `XrRig.worldFromAnchorTo`, `XrUi.onClick`/`flashMessage`, `setFoveation`, `present()`; xr-boot storage-throws path (xr-boot.js:79-81); xr-rig infinite-far branch (:150); `ApexXR.detect`/`rendererMatchesPlan`/`initUI`/`requestReload`/`onCaps`; xr-session `_visible` vs xr-boot `!== "visible"` mismatch; `boot.strikeLatch`/`claimFail` documented in xr-plan header, not implemented or tested.
- xr-phase0 mixes waiter-helper, vendor-existence, IWER adapter, tlx attach and cockpit look-back tests; wall-clamp scrub magnitudes never tested against the real AiDrive.

## Not run (part 1)
- 15 specs pending (part 2/2): image-grade-visual, instanced-draw, lighting-ab, lighting-tuner-grade, material-shimmer (opt-in, skipped without `APEX_SHIMMER`), parts-factory-presets, perf-frametime, presets, projection, render-boot, tlx-probes, track-switch-memory, vr-emulated, webgl-probes, xr-plan.spec.
- MCP-debugger (browser) column for all specs: pending until the spec run ends (debug-chrome refuses beside a run).


---
_Generated by [Claude Code](https://claude.ai/code)_
