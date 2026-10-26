<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT race-1 (partial 1/n (49/49 files read and run))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260865509
- Posted: 2026-10-19T06:09:32Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 1/n (49/49 files read and run) (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT race-1 (partial)

Batch race-1: 49 unit files (0 specs), about 15.3k lines. Reviewer: Sonnet session `session_01H7Z1fNKMhtNR57ZZH5cYzy`, with 2 read-only subagents reading half the files each. Nothing in the repo was edited. Scratch is in `artifacts/test-review/race-1/` of that session's container.

**Run:** all 49 files were run with `node --test` one at a time. Result: 49/49 pass, 0 fail, 0 skipped, no retries. Slowest: race-flow-fixes-vm 208 s, pit-complex 90 s, pit-signs 84 s, ai-racecraft-vm 63 s, cockpit-pale-surfaces 44 s, grid-boxes 32 s, pit-lane-vm 27 s. Everything else is under 25 s.

**Debugger method** (the js-debugger MCP's `debugger_targets` returns `[]` for a Node inspector, see Gaps). Instead I drove the Node inspector over CDP with a small script (`cdp-hit.mjs`): `node --inspect-brk`, a `beforeScriptExecution` instrumentation pause that finds the line in each parsed script (so vm-evaluated sources with no URL are covered), `Debugger.setBreakpoint` on the key line, and a hit count. A breakpoint is removed after 3 hits, so `x3+` means at least 3. `NODE_V8_COVERAGE` per-function counts back it up. Legend: **cdp-hit** = breakpoint on the key line hit; **NOT-HIT** = breakpoint placed, never hit; **n.a.** = no code under test is executed (source-text scan); **unverified** = breakpoint could not be placed.

## Per-file table

| file | purpose | run | debugger | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| ai-band | AI rubber-band: factor, applyVmax | pass 10, 0.4 s | applyVmax cap line `ai-band.js:66` cdp-hit; `setMode`/`mode` **NOT-HIT** | factor() strong; applyVmax cap test **vacuous** (L74-79) | last test greps index.html/race-settings.js for ids (source scan) | strengthen |
| ai-corridor | pass-lane planner picks safe side | pass 13, 0.3 s | `choose` and `crosses` cdp-hit (vm, no URL) | strong (order-independence sweep) | fixtures only | keep |
| ai-pack-stuck-vm | Monaco dig-out escalates, pack does not freeze | pass 2, 20 s | `unstuckActive` line in game.js cdp-hit; `incident-sim.js rescueAI` **NOT-HIT** | mixed: anti-vacuity is `a \|\| b` (L96), minDelta>80 over 30 s is lax | full game VM, real | strengthen |
| ai-pass-complete | pass-completion maths (passHunger, towGain, sbs…) | pass 11, 0.1 s | `passHunger`, `towGain` cdp-hit | mixed-strong, many pinned magic numbers | pure fns, hand ctx | keep |
| ai-pass-defend-vm | latched pass must not also cover | pass 2, 4 s | `followR` line and `coverConcede` cdp-hit | strong with control case | latch forced externally each frame | keep |
| ai-queue-reach-vm | AI brakes from true stopping distance | pass 4, 6 s | `queueReach` and game.js `qWin` cdp-hit | unit part strong; VM bound `v²/44` is far looser than real reach | copied `BRAKE=22` (matches consts.js) | strengthen |
| ai-racecraft-vm | AI passes, start, racing line, no pass under SC | pass 9, 63 s | `otWant`, `qWin` cdp-hit | strong behavioural, measured thresholds | shared boot, order matters; monkey-patches `AD.otWant` | keep |
| ai-ratings-math | personality-dial maths + tool CLIs | pass 8, 0.5 s | `pearson` cdp-hit | unit strong; CLI part pins data snapshots | tests tooling/roster data, not the game; stale header | regroup |
| ai-strategy | AI stint plans, pit rules | pass 36, 0.3 s | `stintPlan`, `pitNow`, `degCost` cdp-hit | strong, but **L268 conditional assert** | `degCost` expectation re-states 0.05/0.5/20 | keep (fix L268) |
| ai-stuck-vm | AI must not weld behind a stopped car | pass 4, 9 s | `collide.js corr > CORR_EPS` cdp-hit; game.js `unstuckActive` cdp-hit | 3 behavioural strong; 4th is an exact-string scan | 4th test is a source-text scan standing in for behaviour | strengthen |
| all-lights-fill | frame-lights lamp buffer fill | pass 8, 0.2 s | `_fillAllLights`, `tierShed` cdp-hit (vm, patched export) | strong (reference impl, flicker sequence) | export list text-patched; Tracks/LightKnobs stubbed in 2 tests | keep |
| bahrain-grandstand-rake | no hollow/backwards stands | pass 2, 2 s | `bahrain.js grandstandEx` cdp-hit | mixed: `prims===0` stands skipped | thresholds loose | strengthen |
| career-ai-dev | AI parts development across winters | pass 13, 0.7 s | `pickStep`, `developWinter` cdp-hit | mixed: **L68 `if(!fitted) return`, L82 `if(step) assert`** | makeCars is sliced from game.js with ~25 stubs; rollover test is a source slice | strengthen |
| cockpit-crest-stripe | crest stripe must not cover the wheel | pass 2, 12 s | `car-body-geom.js stripe` cdp-hit | strong (differential build) | no liveries-count floor | keep |
| cockpit-pale-surfaces | no pale slab in driver view | pass 9, 44 s | `car3d.js buildComplete` cdp-hit | strong (raycast, detector check) | hard-coded car3d coordinates | keep |
| cockpit-preview | cockpit preview open/close lifecycle | pass 4, 0.1 s | `open`, `close` cdp-hit (vm) | mixed-strong | iframe/MutationObserver faked | keep |
| cockpit-wheels | cockpit options, meshes, sightlines, draws | pass 31, 21 s | opts/vantage/car-mesh cdp-hit (vm) | mostly strong; draw-rig regex pins weak | car-draw.js/mode-switch.js source regexes stand in for draw behaviour | regroup |
| debris-hazard-hint | hint-window projection equals full scan | pass 3, 11 s | `projectHazard` cdp-hit (extracted fn) | strong, explicit anti-vacuity | `verdict()` mirrors `consider()` instead of calling it | keep |
| debris-opts | DEBRIS setting wiring | pass 9, 0.2 s | `set`, `on` cdp-hit | mixed | **stub returns "0" for unset keys, so the real default is never read (L59)**; forbidden-identifier regex scan | strengthen |
| debris-step-skip | DebrisWorld idle skip, lazy Rapier | pass 10, 0.6 s | `step` cdp-hit (tests 5-9); first `_needSolve` line **NOT-HIT** | tests 1-4 weak source regexes | tests 1-4 are source-text scans | strengthen |
| dev-flags | DevFlags precedence | pass 8, 0.2 s | `resolveBool`/`resolveString` cdp-hit | strong | fake location/localStorage | keep |
| engine-note-quality | engine audio voice | pass 5, 0.6 s | engine.js limiter and param lines cdp-hit | mixed: **pitch-monotonic test allows a constant rate** | fake AudioContext | strengthen |
| factory-ai-setup | factory aero/ERS spread, makeCars | pass 2, 0.2 s | `parts.js` factory cdp-hit; test 2 = **n.a.** (regex of game.js) | test 1 mixed, test 2 weak | test 2 duplicates a behavioural test in career-ai-dev | merge into career-ai-dev |
| flags | every country has a flag | pass 4, 0.2 s | `svg()` cdp-hit | strong; circuit scan silently skips unmatched files | `new Function` over real source | keep |
| fleet-flags | orchestrator flag tool | pass 5, 0.2 s | `format` cdp-hit; `assess` line **NOT-HIT** (inconclusive: one line sampled) | strong | tooling, not game | keep (regroup to tooling) |
| flying-start | flying start hand-over | pass 8, 0.2 s | `place`, `release`, `tick` cdp-hit | strong; last test is a source regex | `dropSpeed` constant 60 and straight `Tracks.sample` stubs | keep |
| frame-lights-rank-cache | lamp rank cache cadence, GC | pass 5, 0.3 s | rebuild and reuse counters cdp-hit | mixed: `<=150` loose; stale header | clock faked | keep (tighten) |
| frame-lights-shed | tier shed without popping | pass 6, 0.2 s | `_shedTick`, `tierShed` cdp-hit | strong; last test is 3 source regexes | LightBudget stubbed | keep |
| grid-boxes | grid boxes match slots | pass 14, 32 s | `mesh.js`, `startline-probe.cjs` cdp-hit | strong; some 1.0 m tolerances | CLI cases mock the track provider | keep |
| hud-minimap-pitmark | minimap P marker is cached | pass 3, 0.2 s | `mmPitMark` cdp-hit | mixed: **dropping `_mmRatio` from the key would not fail** | source slice evaluated; Proxy canvas swallows args | strengthen |
| incident-gate | incident takeover gates, handback | pass 52, 0.5 s | `preStep`, `postStep` cdp-hit | strong overall; **L219-262 test the test's own algebra** | local `fwd`/`inv` copies; L264 regex | strengthen |
| incident-rpm | engine pitch for incident-owned car | pass 2, 2 s | game.js `incidentSim.owns` rpm line cdp-hit (test 2) | test 2 strong; test 1 is a regex | test 1 duplicates test 2 | merge (drop test 1) |
| js-debugger-trace | debugger MCP trace tooling | pass 4, 0.2 s | tool code cdp-hit | strong | FakeCdp | keep |
| jump-start-vm | jump-start fine | pass 3, 9 s | `tickAtGreen` cdp-hit | strong; test 1 uses `>=5` | real game | keep |
| light-grid | slider grids + backend parity | pass 20, 0.3 s | only `presets.js` (executed data) cdp-hit; shaders/knobs are **n.a.** (regex of source) | mixed: shader checks are substring scans | most of the file is source-text matching; passes if a literal appears anywhere in a 2200-char window | regroup |
| lighting-tuner-reset-weather | tuner reset, weather, flood emit | pass 19, 0.4 s | `profiles.js`, `weather-arc.js` cdp-hit | strong; **M37 re-implements the formula** | formula copy plus game.js regex | keep (fix M37) |
| mirror-lights | rear-view lamp light must not flash | pass 6, 0.6 s | `tierShed` cdp-hit; `appendCarTailLights` **NOT-HIT** | strong, quantified | last test = regexes on mirror-pass.js | keep |
| overtake-mode | 2026 OVERTAKE rules | pass 14, 0.2 s | `lines`, `spend` cdp-hit | strong | **`TyreModel.treadFor` stub embeds its own wet thresholds** | keep |
| perf-race-entry | perf report tooling | pass 3, 0.1 s | helper cdp-hit | weak, regex of formatted strings | tests a test helper | merge into race-entry-profile |
| pit-canopy-cull | pit canopy lamps kept at night | pass 1, 1.5 s | `appendCarTailLights`, `capRadius2` cdp-hit | mixed-strong; tlx-lite accepts 5 of 6 | one circuit | keep |
| pit-complex | pit complex geometry on the fleet | pass 26, 90 s | `pit.js`, `scenery/pits.js` cdp-hit | strong | one negative source scan; dead code L408-409 | keep (split roof tests) |
| pit-lane-vm | pit commit/abort/limiter on real Bahrain | pass 19, 27 s | `commitNow`, `planInfo` cdp-hit | strong | single circuit | keep |
| pit-lane | pit-lane pure logic + built tracks | pass 96, 15 s | **unverified**: breakpoints not placed twice | mixed-strong; golden pins L1589-1654 | golden hash pins (characterization); 3 source-text tests | regroup |
| pit-signs | pit sign geometry, atlas, leaks | pass 10, 84 s | `paintAtlas`, `upload` cdp-hit | strong | canvas and LiveryTex stubbed; conditional asserts L266-269 | keep |
| quali-handoff-vm | "TO THE GRID" runs lobby callback | pass 4, 4 s | `q-go` onclick and `openQualiBody` cdp-hit | strong | lobby callback is a counter | keep |
| race-control | caution/flag machine, finish policy | pass 53, 0.3 s | `race-control.js create` cdp-hit | strong | 2 source-text tests (redFlagRestart, comparator alloc) | keep |
| race-entry-profile | race-entry stopwatch and session-entry | pass 26, 0.7 s | `session-entry.js begin` cdp-hit; `race-entry-profile.js` **unverified** | strong | two game.js/platform-session.js source slices; manifest scan | keep |
| race-flow-fixes-vm | catalogue of race-flow defects | pass 43, 208 s | **pending**: CDP run on game.js was in flight at the context stop; only V8 coverage seen (ai-drive.js 110/122 fns, game.js 447/748 fns) | strong | 2 source-level tests | keep |
| race-insights | journal, forecast, drills, mastery | pass 64, <1 s | `finishDrill`, `coolingSample` cdp-hit (vm) | strong | dense style | keep |

## Top findings

| # | file:line | defect | why it matters | proposed fix | confidence |
|---|---|---|---|---|---|
| 1 | ai-band.test.mjs:74-79 | applyVmax cap test is vacuous: with paceScale 0.8255 the cap is 1.211 and f=0.18 gives 1.18, so `Math.min(1+f, bandCap)` never binds (arithmetic, not a logged value). Breakpoint at `ai-band.js:66` is hit. | Deleting the cap lets banded easy cars beat the top DIFF rung and nothing fails. | Choose f=0.3 (or paceScale 0.7) so `1+f > ceil/scale`; assert `vmax == vmax0*ceil/scale`. | high |
| 2 | career-ai-dev.test.mjs:68, :82 | `if (!fitted) return;` and `if (step) assert…` turn the era-ban and cap tests into unconditional passes. | AI development could stop entirely and both stay green. | Assert a fitted bag / a step exists on inputs that guarantee one. | high |
| 3 | ai-strategy.test.mjs:268 | `if (r1.seq.join() === r5.seq.join()) assert…` asserts nothing when plans differ. | "Late stagger untouched" is unverified. | Pick lives where the sequences match; assert unconditionally. | high |
| 4 | ai-stuck-vm.test.mjs:117-124 | The CORR_EPS guard is tested by an exact-string scan of collide.js. The debugger shows `collide.js corr > CORR_EPS` is reached by the scenario, but the dust-penetration branch the test names is only checked textually. | A reformat breaks it; a real regression to `corr > 0` passes if the text still matches. | Drive `_colResolvePair` with a dust penetration and assert `contactT` stays 0. Share the 3× `stalemate` runs. | high |
| 5 | ai-pack-stuck-vm.test.mjs:96 | Anti-vacuity is `digOutStarveS > 0.5 \|\| sawRescue`. The debugger shows `incident-sim.js rescueAI` is **never hit** in this test, so the "escalates to rescue" claim is unexercised. | The test promises rescue escalation; only the OR's left side ever fires. | Make it an AND or assert a rescue happened; raise `minDelta>80` to a measured floor. | high |
| 6 | incident-gate.test.mjs:219-262 | Local `fwd`/`inv` helpers define the transform; the tests assert they round-trip, and `Math.hypot` returns a positive number. None calls `incident-sim.js`. | These cannot fail when the module changes. | Delete or turn into calls on the module; keep the behavioural tests at L336-390. | high |
| 7 | debris-step-skip.test.mjs:41-77 | Tests 1-4 are regex scans of step/create/prime/status. The debugger shows the first `_needSolve` line is never hit in the executed tests (one line sampled). | A refactor flips them; a behaviour bug that keeps the strings passes. | Replace with the behavioural `stepped` counter check already used by the incident test, or delete. | high |
| 8 | engine-note-quality.test.mjs (pitch monotonic test) | `r >= prev - 1e-9` is satisfied by a constant playback rate. | A dead RPM-to-pitch mapping goes unnoticed. | Assert `rate(1) > rate(0)` and strict rise between steps. | high |
| 9 | hud-minimap-pitmark.test.mjs:57-68 | Dropping `_mmRatio` from the glyph cache key does not fail (one ratio per boot, `drawImage` args never checked). | DPR changes would reuse a wrong-resolution glyph on phones. | Change `_mmRatio` between calls; assert a new canvas and the drawImage args. | high |
| 10 | debris-opts.test.mjs:59-62 | "Unset key reads OFF from the shipped SettingsDefaults" is satisfied by the stub's `"0"` fallback; the real default is never loaded. | The default-OFF contract is unpinned. | Load the real defaults module. | med |
| 11 | ai-queue-reach-vm.test.mjs:50-72 | The VM bound `gap >= v²/(2·22)` is much looser than the real reach `v²/(2·0.6·22)+6`; `contactV == null` passes if there is never contact. | Changing `+6` or `0.6` in `queueReach` is not caught (the unit part reaches `queueReach`, per the debugger, but pins only floors). | Pin an exact `queueReach` value, e.g. 42 m/s. | med |
| 12 | light-grid.test.mjs:265-end, :296-304 | Backend parity checks `includes()` an identifier or literal anywhere in concatenated shader source or a 2200-char window. Only `presets.js` is executed code; the rest is source text. | A constant changed identically on all backends, or a knob only named in a comment, passes. | Tighten to declaration patterns; split into data lint / shader lint / markup. | med-high |
| 13 | lighting-tuner-reset-weather.test.mjs:320-333; overtake-mode.test.mjs (`rcWith`) | M37 re-implements the production formula at 1e-12; overtake-mode's `TyreModel.treadFor` stub hard-codes wet thresholds 0.72/0.25. | Both guard coupling to a copy, not correctness; real tyre thresholds can change with the test green. | Relational assertions for M37; load the real `tyre-model.js`. | med |
| 14 | pit-lane.test.mjs:1589-1654 | Golden vertex hash and `pitLaneAt` numbers pinned to "base 0f8c88843"; also 3 source-text tests. 96 tests could not be tied to a breakpoint. | Any legitimate geometry change fails; any base bug is baked in. | Relational checks (some already at L1564-1587) or an explicit regen command. | med |
| 15 | frame-lights-shed.test.mjs:127-134, mirror-lights.test.mjs:120-125 | Behavioural properties ("track not strongly pinned", "restored in finally") asserted by regexes on source text. The mirror run never hit `appendCarTailLights`. | Spelling-sensitive. | Use the GC pattern from frame-lights-rank-cache.test.mjs:121-139. | med-high |

## Gaps

- `AiBand.mode()/setMode()` are never called by any test in this batch (debugger: NOT-HIT).
- No test drives `ai-corridor` `crosses` second clause (end-point re-check) directly, or `paceEdgeN`/`pairEdgeN` by name.
- `incident-sim.js rescueAI` and `forceLaunch` have no coverage in this batch (V8 coverage).
- `flying-start`: `GO_HOLD_S`, off-axis head (`atan2`), the `goRolling()===false` path are untested.
- `frame-lights`: `_RANK_FWD_EPS2` (yaw rebuild) and `_RANK_MAX_MS` alone are never driven; tier-1/tier-3 slot values unchecked.
- `hud-minimap` glyph `size > 8` clear is untested.
- **Tooling gap (pass-2 fix, known as #2957):** the js-debugger MCP `debugger_targets` lists only Chrome page targets, so `debugger_attach` cannot take a `node --inspect` target. A CDP workaround script (`cdp-hit.mjs`) works and can be committed as a tool.

## Not run

- Specs: none in this batch.
- Debugger: **race-flow-fixes-vm** CDP run on `game.js` was in flight when the 120k context stop hit. **pit-lane**: breakpoints could not be placed (twice). **race-entry-profile**: the `race-entry-profile.js` breakpoint was not placed (its `session-entry.js` one is hit). **fleet-flags** `assess` and **mirror-lights** `appendCarTailLights` were placed but not hit; that may be a real gap or a wrong-line choice, not confirmed with a second line.
- The key line was one or two lines per file, not every assertion. Mutation claims come from reading plus breakpoint hits; I did not run mutations.
- Timings are single runs, not a flakiness study. No retries were needed.

Files reviewed 49/49 (read + run).

---
_Generated by [Claude Code](https://claude.ai/code)_
