<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT physics-1 (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260119034
- Posted: 2026-10-19T05:07:49Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT physics-1

**Batch:** 68 unit files (0 specs), 15,665 lines, reviewed on `claude/f1-game-project-26h3ng` at the session SHA. Pass 1 is findings only: no repo edits.
**Run:** every file run. The batch run was `node --test` over all 68 files: 743 tests, **742 pass, 0 fail, 1 skip**, 247 s. Each file was then run alone with 2 jobs in parallel; all exited 0, for a 604 s sum. The skip is `physics-baseline-provenance` ancestry ("shallow clone: ancestry cannot be checked"). No file needed a retry, so there are no flakes.
**Debugger:** the js-debugger MCP lists Chrome *page* targets only. `debugger_targets` on a node `--inspect-brk` endpoint returns `[]`, and attach answers "Unknown page targetId". So I drove V8's inspector directly over CDP with a 60-line client (`artifacts/test-review/physics-1/cdp-bp.mjs`: setBreakpointByUrl with conditions, evaluateOnCallFrame, hit counts, and the bp dropped after 50 hits). 22 files got a breakpoint in the code under test, and all 22 reached it. One extra conditional breakpoint (steer-lock-taper, `15<vs<30`) never fired, which is finding 2 below. game-vm loads source under absolute filenames, so URL breakpoints work. For tests that load anonymous `vm` scripts I matched `evalmachine.<anonymous>` and confirmed the function name in the stack. Raw results are in `dbg-*.json`.

**Mis-batched (not physics, ~37 of 68):** aero-defaults-2026, aero-flap-travel (car mesh); boot-input-shape; browser-workers, change-driver-tools, desktop-version, geometry-paths-baseline, physics-oracle, twin-drift (tooling/CI); centreline-kinks, track-maps-corners (track); css-layers, css-prefers-cascade, driving-line-opts, editor-workspace, hud-inputs, hud-tyres, layers-nav-memo, player-tools-backup, player-tools-ui (UI); digital-steer, input-bindings, steer-presets, steer-tuning-lock (input); driving-coach, driving-cues, quali-persist (race UX/audio); driver-ratings-personality (data); flyby-pose-inverse (camera); fuzz-untrusted-inputs, persistence-vm (net/save); garage-personality; image-grade-shaders, driving-line (render); input-ghost; log-namespaces; player-collision-side, skidmarks-cadence (audio/fx); thermal-drift (perf). The batcher keyed on name words ("drive", "steer", "physics", "aero"); regroup in pass 2.

## Per-file table

Legend: VM = real source run in `node:vm`; game-vm = full `tools/lib/game-vm.cjs` boot of js/game.js. "hit N" = breakpoint hits; "≥50" = the cap was reached.

| file | purpose | run (s) | debugger | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| active-aero-vm | X/Z wing arms in zones; flap travel; trade | pass 13.8 | hit 2 (aero-zones.js:149 zonesFor) | strong (L170-173 monotone travel) | — | keep |
| aero-defaults-2026 | 2026 visual aero flags per part/team | pass 1.8 | n.a. | mixed; L54 message says ">=1" but asserts ==1 | car visuals; T4 repeats T3 | keep, regroup car |
| aero-flap-travel | garage flap travel is visible | pass 4.6 | n.a. | mixed; L199-205 `toString()` regex | car mesh | keep, regroup car |
| aero-zone-tables | authored turn tables are actually read | pass 49.7 | **hit 2 of 21 tables** (aero-zones.js:174) | weak core: L46 resamples at 25 m but module uses 8 m; L109 can't fail | test-local `runsOf` stands in for the module | **rewrite** (F1) |
| aero-zones-turns | turn table == length-only pick | pass 8.9 | n.a. | mixed; L181-182 copied X_ZONE_K/STEP | equality by design hides the fallback | strengthen |
| aero-zones-vm | zone counts, Monaco 0, OT vs aero gates | pass 50.1 | hit 19 (zonesFor) | strong (L138-179); L31 copied X_ZONE_MIN (it is exported) | L237 stale comment ("extreme") | keep |
| ai-drive | AiDrive pure decisions | pass 0.7 | n.a. | strong mostly; source scans L806-830, 1062, 1558, 1681; L1567 re-implements an oracle | 1,688 lines | keep, split file |
| boot-input-shape | bad stored index/team/steerMode can't brick boot | pass 1.8 | n.a. | strong (extracts and executes source) | reset() closure vars hand-declared L146-152 | keep, regroup |
| brake-cue | brake-pulse urgency maths | pass 0.2 | hit ≥50 (urgencyOf, brake-cue.js:30) | mixed; L46-49 range-only checks | `tick()` ON path never runs | strengthen |
| browser-workers | worker count / GL args for capture | pass 1.7 | n.a. | strong; L115/118 `\|\| ""` fallback weakens it | tooling | keep, regroup |
| centreline-kinks | lone sharp vertex detector | pass 8.1 | n.a. | strong | track tooling | keep, regroup |
| change-driver-tools | verify-change / bump-cache / test-honesty contracts | pass 20.9 | n.a. | mixed; **L122 vacuous regex**; L130/140 magic 9/632 | CI | strengthen, regroup |
| collision-ai-fixes-vm | wrong-way, wall scrub, rescue, AI banking | pass 25.1 | hit ≥50 (collide.js:535) | mixed; L110 never checks wrongWay; L218 average includes unjammed cars | **L223-241 measures the grid launch, not banking**; L243 "assist" never set | rewrite T11/T12 |
| collision-contact-vm | contact cost: rub, bump, finisher, yaw extents | pass 21.4 | hit ≥50 (pairContact, collide.js:470) | strong behaviour (L60-170); vacuous mirrors L172-200, L238-297, L344-370 | **mirror formula ≠ collide.js:60-69** | strengthen |
| collisions-deep-vm | pushes stick, walls, kerbs, pile-ups | pass 24.9 | hit ≥50 (collide.js:535) | mixed; "loses speed" test has no speed assert; "desync" checks finiteness only | names over-claim | strengthen |
| collisions-vm | pair separation, jam dig-out | pass 14.1 | hit ≥50 (collide.js:535) | mixed; liveness/NaN bounds (L79, L101 abs 18 m) | — | merge into collisions-deep-vm |
| css-layers | every rule in its @layer | pass 1.7 | n.a. | strong for its class | CSS | keep, regroup ui |
| css-prefers-cascade | prefers-* remedies not overridden | pass 0.6 | n.a. | strong (self-tested parser) | CSS | keep, regroup ui |
| desktop-version | Electron version from version.json | pass 6.8 | n.a. | strong | desktop | keep, regroup |
| digital-steer | key ramp, pad shaping, last-key-wins | pass 0.5 | n.a. | strong; L134 copied EXPO | input | keep, regroup input |
| drift-vm | bicycle model: stable, slide, self-align | pass 11.5 | hit ≥50 (player-forces.js:61) | mixed; L100 no check that a slide existed before release | — | strengthen |
| driver-ratings-personality | ratings decorrelated; skill is pace-only | pass 0.2 | n.a. | mixed; data snapshots; jitter only at roll 0.5 (where it is 0) | data | keep, regroup |
| driving-coach | coach tips, lap report | pass 0.5 | n.a. | mixed; text regex on outputs | G/RaceInsights stubbed | keep, regroup race |
| driving-cues | audio corner calls; OFF reads nothing | pass 0.3 | n.a. | strong; L90-95 source scan | synthetic curvature | keep, regroup |
| driving-line-opts | DRIVING LINE prefs wiring | pass 0.3 | n.a. | strong | UI | keep, regroup ui |
| driving-line-pace | line API carries aTop() | pass 6.3 | n.a. | strong (L39-42) | draw spy | keep |
| driving-line | ribbon builder | pass 0.3 | n.a. | strong | render | keep, regroup render |
| editor-workspace | editor toolbar/preview/restore | pass 0.2 | n.a. | strong-ish | UI | keep, regroup ui |
| flyby-pose-inverse | camera pose round-trip | pass 7.3 | n.a. | strong; L74 landmark block conditional | camera | keep, regroup |
| fuzz-untrusted-inputs | decoders never throw or leak NaN | pass 31.2 | n.a. | mixed; **L54-56 "null-or-value" asserts nothing**; L596 title vs body | net/save | strengthen, regroup |
| garage-personality | arrival lights/engine/radio | pass 0.2 | n.a. | mixed; L102-107 regex | garage | keep, regroup |
| geometry-paths-baseline | baseline file routes its sweep | pass 0.2 | n.a. | strong (small) | CI | keep, regroup |
| grip-steer | assist steering cap at peak slip | pass 0.2 | hit ≥50 (apply, grip-steer.js:71) | mixed; L127 literal 4; **L131-141 never compares with apply()** | — | strengthen |
| hud-inputs | INPUTS trace ring/canvas | pass 0.2 | n.a. | mixed; L109-148 CSS/HTML regex | HUD | keep, regroup ui |
| hud-tyres | tyre temp band, aria label | pass 0.2 | n.a. | strong; L108-112 curvature grep beside the point | HUD | keep, regroup |
| image-grade-shaders | HDR grade maths agrees across backends | pass 0.6 | n.a. (no executable shader) | mixed: L115-165 test a JS copy; shaders regex-only | copied formula; TLX grade (tsl-post.js:877-892) unpinned | strengthen |
| input-bindings | rebind conflicts, persistence | pass 0.2 | n.a. | strong | input | keep, regroup |
| input-ghost-replay-vm | input tape replays deterministically | pass 10.3 | n.a. | strong; seed anti-vacuity only checks s>10 | Input.* stubbed (intended) | keep |
| input-ghost | ghost record/persist/version gate | pass 2.3 | n.a. | mostly strong; regex wiring pin | — | keep, regroup |
| layers-nav-memo | navOpen memo (perf) | pass 0.2 | n.a. | strong | UI | keep, regroup |
| log-namespaces | every Log ns is declared | pass 0.4 | n.a. | strong (has anti-vacuity) | lint | keep, regroup tooling |
| longitudinal-vm | throttle, brake, grass, slope, lap wrap | pass 23.4 | hit ≥50 (player-forces.js:61) | mixed; loose bands (20<peak<150, ×1.35, >5) | — | keep |
| pace-arming-vm | OT/X arm thresholds on the vStd scale | pass 7.2 | hit ≥50 (game.js:4691 updateCar) | strong (±1.5 at PACE 0.5/1.3 tells vStd from raw m/s) | assumes vTop=VMAX·pace | keep |
| pace-math | vTop/vStd/aStd/X/ERS golden | pass 0.2 | n.a. | strong (exact equality) | golden JSON has no writer (hand-edit only) | keep |
| persistence-vm | quota failure surfaces; session survives | pass 6.5 | **hit: warned=0, earlier=1** (test L82) | **vacuous "fires once"** | — | strengthen |
| physics-baseline-provenance | baseline carries blessed stamp/hash/sha | pass 0.2 (1 skip) | n.a. | mixed; unkeyed hash; ancestry skips on shallow clones | — | strengthen |
| physics-characterization-vm | VM == browser baseline, number for number | pass 9.3 | **hit 390 = exactly 4 scenarios × scripted steps** (player-forces.js:61; +5 dt=0 warm-ups) | strong (exact 1e-4; recipe AST-equal to spec) | none: runs real game.js | keep, widen scenarios |
| physics-feel-vm | BOOST×PACE, BOOST under brake, 8th-gear top speed | pass 23.6 | hit ≥50 | strong, with controls | writes legacy `P.xOn` (L61, L64) | keep |
| physics-oracle | port-oracle CLIs are deterministic | pass 17.8 | n.a. | strong for determinism | proves no physics correctness | keep, regroup tooling |
| physics-rows-vm | 2026-09 bug-hunt physics rows | pass 24.1 | hit ≥50; Spa search **dn=-0.098 @0.467, vmax=73.9** | mixed: strong L43-300; **source-only + copied grip() L474-484** | `vmaxNow \|\| 72` fallback | strengthen |
| player-collision-side | collision sfx stereo pan | pass 0.5 | n.a. | strong | WebAudio stub | keep, regroup audio |
| player-dynamics-shipped-vm | shipped-seat handling bands | pass 8.9 | hit ≥50 | mixed; ±8-15 % bands | — | keep |
| player-dynamics-vm | shape of the driving model | pass 37.6 | hit ≥50 | strong: relative + anti-vacuity | Input stubbed | keep |
| player-forces | PlayerForces surface, sign, NaN guard | pass 0.3 | n.a. | mixed; **L165 near-vacuous**, L120 weak | stubs SetupTune/DebrisWorld | strengthen |
| player-tools-backup | settings/garage export round-trip | pass 0.3 | n.a. | strong | UI | keep, regroup |
| player-tools-ui | settings search, presets | pass 0.6 | n.a. | strong; ~25-test grab-bag | UI | regroup by module |
| quali-pace-parity-vm | quali model follows driven pace at every PACE | pass 65.8 | hit ≥50 (updateCar) | mixed: ±3 % only *relative to PACE 1* | — | keep (slowest file) |
| quali-persist | driven grid survives reopening quali | pass 0.6 | n.a. | strong model; ~32 regexes over game.js from L162 | regex instead of behaviour | strengthen |
| retired-car-obstacle-vm | a parked car is solid | pass 12.8 | n.a. | strong (ghost control) | — | keep |
| skidmarks-cadence | marks per second, AI cap | pass 0.3 | n.a. | strong | rain test belongs to particles | regroup the rain test |
| steer-feel-lift-off | lift-off rotates without snapping | pass 7.1 | n.a. | strong (1.05-1.25 band) | — | merge into player-dynamics-vm |
| steer-lock-taper | low-speed lock plateau | pass 7.7 | **live 15<vs<30: 0 hits; vs seen = 12, 69-71** (game.js:5930) | **vacuous L40-67, L108-110 (test the copy at L26)** | copied formula | **rewrite** (F2) |
| steer-presets | presets land on FEEL levels | pass 0.3 | n.a. | strong | input | keep, regroup |
| steer-tuning-lock | slider→lock/touch range | pass 0.2 | n.a. | mixed: tests a copy, regex-pinned | copied formula | strengthen |
| thermal-drift | drift detector, governor | pass 0.5 | hit: on=2, off=0 (test L184) | strong L41-146; weak L184 | — | strengthen |
| track-maps-corners | corner classes, map fit | pass 2.0 | n.a. | strong | UI/track | keep, regroup |
| trail-brake-turnin | brake-ellipse capacity fix | pass 15.9 | hit ≥50 | mixed: duplicates shipped-vm; L107-108 tight anchors | doc L3 still says the shipped seat is Mercedes (now Red Bull) | merge into player-dynamics-shipped-vm |
| twin-drift | VM twin and spec use the same thresholds | pass 0.3 | n.a. | mixed: catches only drift on both sides | tooling | keep, regroup |

## Top findings (ranked)

Every row was re-read on the current tree. ★ = confirmed with the debugger.

| # | file:line | defect | why it matters | proposed fix | conf |
|---|---|---|---|---|---|
| 1 | tests/unit/aero-zone-tables.test.mjs:45-50, :66-86, :101-111 ★ | The headline test ("every authored table resolves") asks `runForTurnPair` about runs the test builds itself at 25 m spacing. `zonesFor` uses `X_ZONE_STEP=8` (aero-zones.js:24). The debugger shows the module's real table-or-fallback branch (aero-zones.js:174) runs for **2 of 21 tables** (imola, monza). The L109 check passes on the fallback too (monza 2 == ZONE_COUNT 2). aero-zones-turns L226 asserts table == fallback by design. | No test can see the silent all-or-nothing discard that this file exists to catch. A table that resolves at 25 m but not at 8 m passes. | Capture `Log.warn` in the ctx and assert that `zonesFor()` never warns "turn table unusable" for any of the 21 circuits; delete `runsOf`. | high |
| 2 | tests/unit/steer-lock-taper.test.mjs:26, :40-67, :108-110 ★ | 3 of 5 tests check a `lockTaper` copy defined in the test file. The live VM test drives only vs≈12 and ≈70; a conditional bp `15<vs<30` on game.js:5930 got 0 hits. | The 15-30 blend (the part that changed) never runs in shipped code. A game.js edit keeps L31's regex happy only if the text matches, and the copy tests can't fail. | Delete the copy tests. Sweep the applied `driverDelta/STEER_MAX_SLIP` in the VM at vs 5/15/20/25/30/45 against the expected curve. | high |
| 3 | tests/unit/collision-ai-fixes-vm.test.mjs:223-241 | `A.reset(frac)` moves only the player and calls `gridUp()` first (js/agent/apex.js:2041-2068), so the AI average comes from the grid launch in both the "flat" and "banked" runs. | AI banking grip (elevation audit bug #1) is untested; the test passes whatever banking does. | Place the AI cars at 0.65 and at 0.0 (aiPlace/jump per car) and compare their speeds at matched entry. | high |
| 4 | tests/unit/collision-contact-vm.test.mjs:225-235, :269 | The "mirror" `eLongT/eLatT` blends the extents linearly. collide.js:60-69 blends the *angle* (`psi*k`). These are different functions between 20° and 60°. | The "shipped extents" table and the `LCAR_MAX` broadphase bound (L311-324) describe a formula that does not ship. | Export `extLong/extLat` (or `yawMix`) from Collide and assert on the real ones. | high |
| 5 | tests/unit/physics-rows-vm.test.mjs:474-484 | "Load sensitivity" is a `src.includes(...)` over player-forces.js plus a `grip()` formula computed in the test. PlayerForces is never executed. | A reformat breaks it; a wrong formula in a different place passes. The 1.3 % braking-grip claim is not measured. | Call `PlayerForces.step` with loadF ±0.18 and assert the front/rear grip ratios. | high |
| 6 | tests/unit/collision-contact-vm.test.mjs:172-200, :344-370 | These assert on test-local `scaled/rawSide`, `walk` and `rest`, not on `pairContact`, `_colForBucketPairs` or `AiDrive.bumpRestitution`; only regex pins link them to source. | Tautologies: a formula change passes them. | Call the real functions; `AiDrive.bumpRestitution` is already loaded at L616. | high |
| 7 | tests/unit/persistence-vm.test.mjs:77-84 ★ | "The loud warning fires once" asserts `warned.length <= 1`. The debugger shows `warned=0` here; the one warning fired in an earlier test on the shared boot. | Vacuous: it can't tell "fires once" from "never fires". The player-visible "your save failed" toast could regress silently. | Fresh `createGame`, break storage, 6 writes, `assert.equal(warned.length, 1)`. | high |
| 8 | tests/unit/grip-steer.test.mjs:131-141 | Titled "pools without changing the apply result", but it never compares `forPlayer` with `apply()`, and `a` is never compared with `b`. L127 compares VX_FLOOR with the literal 4, while player-forces.js hard-codes its own `Math.max(vAbs, 4)`. | The pooling path and the shared floor can drift with the test still green. | `assert.equal(forPlayer(...), apply(...).delta)`; have player-forces read `GripSteer.VX_FLOOR`. | high |
| 9 | tests/unit/change-driver-tools.test.mjs:122 | `/sequential\|maxConcurrent\|…/` matches the `@doc` comment on tools/ci/test-bg.mjs:2 ("sequential by default"). | Vacuous: the default of one concurrent group (AGENTS.md rule 5) could change unnoticed. | Assert on `test-bg.mjs --plan/--json` output, or match the `PARALLEL_MAX` use site with comments stripped. | high |
| 10 | tests/unit/collisions-deep-vm.test.mjs:92-111, :310-326 | "Loses speed" asserts no speed; "desyncs prog/s" checks only finiteness. | The names over-claim: a wall that scrubs no speed passes. | Add `vEnd < 60 - k` and `\|wrapS(prog) - s\| < eps`. | high |
| 11 | tests/unit/player-forces.test.mjs:165 | `Math.sign(sFull - s0) !== 0 \|\| …` is true for any non-zero difference. L120 `forceFront !== 0 \|\| forceRear !== 0` is equally weak. L167 carries the real check. | Near-vacuous "reverse flips the steer term". | Assert `sign(slipAt(-2) - slipAt(2)) === -sign(delta)`. | high |
| 12 | tests/unit/fuzz-untrusted-inputs.test.mjs:54-56, :596 | The `"null-or-value"` shape branch returns without asserting (Snapshot/Sdp/Qr). The "under 10 s" test times CPU for 200 decodes, and `BUDGET_MS` is a dead `void`. | Three untrusted surfaces have no shape check, and the budget test name is false. | Assert `r == null \|\| typeof r === "object"` plus `assertCleanLive`; rename or enforce the budget. | med |
| 13 | tests/unit/physics-baseline-provenance.test.mjs:46, :59 + tests/helpers/baseline-blessing.mjs:17 | The hash is an unkeyed sha256 of the data, and the ancestry half skips on a shallow clone (as here). | It catches a naive hand edit only: a VM-twin or scripted regeneration with any 8-char reason passes. The backstop is spec/twin equality, which goes stale the same way. | When `tests/data/physics-baseline.json` changes in a PR, CI requires the browser characterization spec on that head (select-specs rule), and the provenance test asserts the stamp's sha == that run's head. | med |
| 14 | tests/unit/collision-ai-fixes-vm.test.mjs:98-111, :243 | Wrong-way: `obs.done` is asserted without `obs.wrongWay`. The "with racing-line assist" test never enables an assist. | It passes on any `done` cause, and the named mode is never run. | Assert `wrongWay === true` first; enable the assist or rename. | med |
| 15 | tests/unit/trail-brake-turnin.test.mjs:3, :101-108 | It duplicates player-dynamics-shipped-vm (same bench, two more boots). The doc names the shipped seat as Mercedes, but it is now Red Bull (shipped-vm header). The skidpad anchor 5.35±0.08 conflicts with shipped-vm's 4.8-5.9 band. | Two places to retune with contradictory bands; a 16 s duplicate. | Fold its turn-in and mid-corner rows into player-dynamics-shipped-vm; keep one band. | med |

Also verified, lower rank:
- physics-rows-vm:379-401 Spa descent has no anti-vacuity check (`dn=0, dnAt=0` fallback; `vmaxNow || 72`). Latent only: the debugger shows it finds a real descent today (dn −0.098 at 0.467, vmax 73.9). Add `assert(dn < -0.03 && vmaxNow > 0)`.
- thermal-drift:184 `on >= off`, though the title says off does not step. Today off=0, so it is latent; use `assert.equal(off.moves.length, 0)`.
- image-grade-shaders: numeric tests check a JS copy; the TLX grade (default backend) is unpinned.
- quali-persist: about 32 regexes over game.js wiring from L162.
- physics-feel-vm L61/64 write legacy `xOn`.
- aero-zones.js:177's comment credits aero-zones-vm with a check that aero-zone-tables does.

## The master gate (physics-characterization-vm)

Sound as far as it goes. It runs the real js/game.js in the VM and asserts exact equality at 1e-4 with the browser-written baseline. Its scenario recipe is AST-compared with the spec's (L49-89), so the two cannot silently diverge. The debugger shows PlayerForces.step at exactly 390 = 120+90+90+90 scripted steps. Coverage is the weakness:
- 4 scenarios, all on one circuit (frac 0.05-0.5);
- default PACE only;
- no assists-on, wet, kerb, banked, reverse or low-speed hairpin row;
- 6 fields sampled every 15 steps.

That is the cheapest place to widen. Every new scenario has to be written by the browser spec (APEX_UPDATE_BASELINE), not here.

## Gaps (untested behaviour in this subsystem)

- **"The arc must not reach the driver" (AGENTS.md physics rule): no behavioural test in this batch.** hud-tyres L108 only greps, and physics-rows covers the AI bank only. Proposed test: a game-vm run with assists off, perturb `Tracks.curvature` and the racing line, and assert the player's physState rows are bit-identical.
- The characterization never runs at PACE≠1 or with assists on (see above).
- The lockTaper 15-30 vs blend has no live coverage (finding 2).
- AI banking grip has no valid test (finding 3).
- AiDrive exports with zero references in tests/: `paceEdgeN`, `pairEdgeN`, `passSideBonus`, `queueFloor`, `unstuckLatFloor` (js/physics/ai-drive.js:1749-1765).
- The `BrakeCue.create().tick()` ON path is unreached: pace-scaled look-ahead (brake-cue.js:89-92), sample density, pulse period, haptics. `BrakeCue.urgencyOf` and `DrivingCues.urgencyOf` are acknowledged duplicates with no parity test.
- The PlayerForces low-speed yaw sub-step is only source-pinned; drift-vm has no check that a slide existed before release.
- quali-pace-parity checks only *relative* to PACE 1, so an absolute calibration shift that moves every PACE equally passes.
- `DriverRatings.skill` consistency jitter is only exercised at roll 0.5, where it is zero.

## Not run

- None. All 68 files ran (743 tests). 1 test skipped by design: the physics-baseline-provenance ancestry check needs a full-depth clone (`git fetch --unshallow`), which this cloud checkout lacks.
- Debugger: 46 files are marked n.a. (not sampled). That covers UI/tooling files, plus the remaining physics files I didn't break in: ai-drive, aero-zones-turns, player-forces, retired-car-obstacle-vm, input-ghost-replay-vm, steer-feel-lift-off, driving-line-pace. The js-debugger MCP cannot attach to node targets (it lists page targets only), so all evidence came from the CDP client above. No browser, no screenshots.

SWEEP-N/A (no merge desk).

---
_Generated by [Claude Code](https://claude.ai/code)_
