<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT tracks-2 (partial 1/n)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260849328
- Posted: 2026-10-19T06:08:20Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 1/n (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT tracks-2 (partial)

Batch: 35 files (9 unit, 26 specs). Statically reviewed: 35/35 (two read-only subagents, then spot-checked). Run: 9/9 unit pass; specs per table. Debugger: unit files done (9/9); spec files NOT done (debug-chrome pass not started; stopped at the 120k context cap). Specs were run by a sequential loop (`npm test -- <spec> --retries=0`, 1500 s cap each), not via test-bg, because test-bg takes groups, not single specs. Rows: artifacts/test-review/tracks-2/rows-A.md, rows-B.md (container-local).

**Debugger method.** The js-debugger MCP lists only Chrome targets, so it cannot attach to Node (Gaps). For units I drove the Node inspector over CDP in-process (`node:inspector`, `artifacts/test-review/tracks-2/dbg-node.mjs`): counting conditional breakpoints worked for real ESM (track-shot-survey) but did not register on vm-evaluated code (several tests run game/track code via `vm.runInContext`). For those I used V8 precise coverage call counts on the function (`cov-node.mjs`), reported as `hit (coverage)`.

## Per-file table
| file | purpose (failure means) | run | debugger | quality | mock / wrong target | verdict |
|---|---|---|---|---|---|---|
| unit/track-randomise | Randomised designer tracks build clockwise, grid straight not short | pass 8s | hit (coverage) randomise.js `mutate` x13, `longestStraight` x476, insight `score` x196 | strong | none (real editor engine in VM) | keep |
| unit/track-retained-state | Tracks.build does not retain/leak state after drop | pass 14s | hit (coverage) tracks.js `build` x6, `buildSteps` x1182 | mixed | `gfx.createMesh` faked; l.33 `verts === pos.length/3` is a tautology against the mock; l.22 getOwnPropertyDescriptor(...).get TypeError if prop absent | keep, strengthen |
| unit/track-shot-survey | Survey tooling plans/scores/digests shots | pass 1s | hit (cdp) `buildSurveyPlans` x8, `scoreShotFindings` x2 | mixed | 507 lines, 6 concerns; l.311 hard-coded `defs.length === 52`; l.325-328 cwd-relative paths; l.399 `fs.linkSync` into os.tmpdir() can EXDEV; l.412 unchecked manifest `replace` can make the "unrelated module leaves digest unchanged" half vacuous | keep, split |
| unit/track-themes-build | Every theme builds without surface folds | pass 294s | hit (coverage) `build` x230, `buildSteps` x41026 | strong | l.57 `/known/.test` excuses any fold text containing "known"; l.77 "deterministic" compares only vertex count though header says byte-identical | keep, strengthen |
| unit/track-validate-fleet | Editor validator verdicts across the fleet | pass 18s | hit (coverage) validate.js `check` x13, `build` x7 | strong oracle | `start`/`grade` reds only logged (l.34-35) so fleet can gain red starts silently; wall-clock `ms<50` (l.177), `ms<1000` (l.212) flake under load (track-randomise scales by loadavg) | keep, strengthen |
| unit/track-wetness-vm | frame.wetness follows trackWetness | pass 7s | hit (coverage) game.js `trackWetness` x142, `isWetRoad` x38 | strong | title claims an in-file alias check at l.33 that is never asserted; l.50 gripMult 0.72 duplicates wet-grip-ladder | keep |
| unit/trackside | Trackside camera picks/poses along the road | pass <1s | hit (coverage) `pick` x15, `pose` x11, `build` x12 (vm script has no URL, matched by name) | mixed | Tracks, FlybySeq, CamAvoid faked with a straight road; CAM_MODES test (l.109-121) is a source regex checking relative order, not "index 14" as it claims | keep, strengthen |
| unit/ui-fit-trackdesigner-toolbar-r6 | Designer toolbar chip not clipped | pass <1s | n.a. (CSS text scan, no code under test: checks source text, not behaviour) | weak | pins CSS declaration strings, not the clipping symptom; l.28 regex captures two rules so "no foreign selectors" misses later @media blocks; no layout assertion on `.sel-chip` anywhere (grep) | rewrite or merge into a layout spec |
| unit/wall-end-face-vm | Inward-stepping wall does not trap/teleport the car | pass 8s | hit (coverage) contact-geometry.js `wallLimits` x15859 | strong | anti-vacuity check present; asserts per-step dx and scrub, not total drift or s held | keep |
| specs/abudhabi-foundation | Abu Dhabi scenery/terrain/walls build | pass 55s | not done | mixed | ground probes at lat -6/0/6 likely inside carved road so null passes; `race()` not awaited, waits `track != null` (boot track is already non-null) | rewrite lightly |
| specs/albert-park-foundation | Albert Park build | pass 15s | not done | mixed | `spanClearances.every(...)` true on empty list; `lakeIds >= 8` arbitrary | keep, add length>0 |
| specs/cota-foundation | COTA elevation/models | pass 308s | not done | mixed | inline prop scan duplicates props-over-road (cota at 0.20) | keep elevation/models; merge scan |
| specs/elevation-tracks | Elevation profile per circuit | pass 329s | not done | mixed | TWINNED to unit/elevation-tracks-vm (same assertions, browser copy redundant); roster 40 of 52 though header says every circuit (l.18-31); loose thresholds (`maxV < flatMax*1.35`, `climbEnd > 5`); chase-camera test misplaced | keep as VM-only |
| specs/f1-track-accuracy | Track shape vs reference | pass 61s | not done | mixed | l.94 `LIST.length === 52` hard-coded; compares raw `def.path.pts` not built centreline; 12 OSM circuits compared against own source; MAX_SHAPE_ERROR 0.31 loose; browser only needed to hydrate | rewrite as node test |
| specs/hungaroring-foundation | Hungaroring build | pass 28s | not done | weak in places | l.21,64 probes lat -6..6 sit in carved road where terrainY is null, so `gap === null \|\| <= 0.18` passes with no terrain | strengthen |
| specs/imola-foundation | Imola build | pass 14s | not done | mixed | nulls dropped in-page then `[]` expected (l.21,104) passes on empty set; `dressingExclusions` assertion is a def echo | keep, assert length |
| specs/interlagos-foundation | Interlagos build | pass 83s | not done | mixed | 4 tests boot 4 times; `Math.max` over filtered nulls gives -Infinity which passes (l.98-104); `props < 620_000` one-sided ratchet | merge tests, assert gaps.length |
| specs/livery-sidewall | Sidewall ink recolours wheel lettering; creator row exists | FAIL (timeout) test 2 160s | not done | weak | test 1 duplicates unit/livery-sidewall.test.mjs, no renderer coverage; test 2 checks only that class `cs-liv-off` is removed; l.5-6 header "UNRUN at authoring" stale | merge/delete t1, strengthen t2 |
| specs/monaco-foundation | Monaco build | pass 59s | not done | mixed | test 2 stale 1.4 m prop cap (props-over-road holds Monaco to 0.20); l.5-17 reload-on-boot-timeout wrapper hides slow boots | strengthen, delete t2 |
| specs/montreal-foundation | Montreal piers etc | pass 33s | not done | mixed | l.107 `toHaveLength(3)` contradicts its own "not the count" comment; l.20 probes lat +-70 equal terrainOuter, may be null | keep, drop count |
| specs/monza-foundation | Monza build + FIA timing pins | pass 26s | not done | strong (best of family) | none | keep |
| specs/offtrack | Off-track penalties and rescue | pass 15s | not done | mixed | rescue predicate (l.123-125) can pass without a rescue; overlaps offtrack-vm / offtrack-edges-vm (not diffed) | merge/trim |
| specs/props-over-road | No prop geometry over the racing line, all circuits | PARTIAL: 46/52 pass, 0 failed, then hit my 1500 s cap (spa..end not run) | not done | strong method | `BASELINE.miami = 4.2` (l.82) looser than unit twin (BASELINE `{}`); l.70-75 comment says COTA/Indianapolis read over TOL but neither is in BASELINE; module-level `geometryArmed` (l.171) stale after page replacement | keep; merge into node twin |
| specs/qatar-foundation | Qatar build | pass 195s | not done | mixed | title says it keeps authored desert relief but only upper bounds (`range < 7.5`, grade < 0.035): a flat track passes | strengthen (add range>3) |
| specs/redbull-foundation | Red Bull Ring build | pass 112s | not done | strong | thresholds pinned to measured values; awaits `race()` | keep |
| specs/scenery-kits | Scenery kit contracts + theme resolution | pass 98s | not done | strong | each test boots a circuit 10-33 s; node twin unit/scenery-kits.test.mjs exists (overlap not diffed) | keep or move to VM |
| specs/spa-foundation | Spa build | pass 94s | not done | mixed | inline corridor scan in t3 duplicates shared scan; l.181 `escaped \|\| []` vacuous if field renamed | keep t1,2,4; merge t3 |
| specs/suzuka-foundation | Suzuka build + crossover | pass 91s | not done | mixed | `crossover > 2` vs bridge rise 9.3 cannot catch half-height bridge (l.40); lat -6/0/6 ground probes likely null | strengthen |
| specs/track-designer | Designer workspace/persistence/authoring | FAIL 2/19 (timeout 120s x2), 678s | not done | strong state assertions | the two failures are the multi-viewport test (14 viewport cells in one test, no explicit timeout) and "workspace organization preserves controls and scroll across modes and library"; pond count `desktop?1:2` depends on iteration order; 944 lines | keep, split + test.slow() |
| specs/track-switch-release | Switching track releases old geometry (GC) | pass 72s | not done | strong | exact WeakRef GC check with watched>0 anti-vacuity; uses three-internal `renderer._objects._renderObjects`; TLX only, monaco->monza | keep |
| specs/tracks-walls-a | Boundary sweep, first half of roster | pass 475s | not done | mixed | identical body to -b except `slice(0,HALF)` vs `slice(HALF)` (l.12); re-implements roster instead of helper; `inScope` accepts one TRACK only; loose bounds (`maxB<60`) | merge a+b |
| specs/tracks-walls-b | second half | pass 474s | not done | mixed | as -a | merge a+b |
| specs/tracks-walls | Boundary behaviour (stops bounded, street circuits walled tight) | RUNNING at time of writing (verdict not read) | not done | weak in one test | "stops bounded and recovers" (l.69) asserts only finite values and `\|x\|<60`, never recovery; `STREET_IDS` hard-coded to 5 (matches `street: true` today) | strengthen |
| specs/vegas-foundation | Vegas build | not run yet (queued after tracks-walls) | not done | mixed | def echoes (`terrainOuter`, `barrierGap`); one `edgeGaps` frac at lat +-8 probably null; `numLights > 0` weak | keep, trim |
| specs/zandvoort-foundation | Zandvoort landmarks/models/scan | not run yet (queued) | not done | mixed | ~190-line prop+terrain scan duplicates props-over-road and terrain-over-road; sampler self-checks are good | keep landmark/model; drop scan |

## Top findings (ranked)
| file:line | defect | why it matters | proposed fix | confidence |
|---|---|---|---|---|
| specs/hungaroring-foundation:21,64 (also abudhabi:49,122, suzuka ground probes) | Terrain probes at lat -6..6 sit inside the carved road where terrainY is null by construction; `gap === null \|\| <= bound` passes with no terrain | The terrain-over-road check cannot fail | Probe lat >= 10, require a number, assert probe count | high (hungaroring), medium (others) |
| specs/props-over-road.spec.js:82 | `BASELINE.miami = 4.2` browser baseline looser than node twin (`{}`) | A regression the VM test rejects passes in the browser | Share one baseline table; delete the browser duplicate | high |
| unit/track-shot-survey:412 | Unchecked manifest `replace` can make the digest-unchanged half vacuous | Test can pass without exercising the claim | Assert the replace changed the string | high |
| specs/tracks-walls.spec.js:69 | "stops bounded and recovers" never checks recovery | Title overpromises; walls regression not caught | Assert re-entry within N frames | high |
| specs/qatar-foundation:88-91 | Only upper bounds on relief | Dead-flat Qatar passes | add `range > 3` | high |
| specs/track-designer.spec.js (first test; "workspace organization…") | 14 viewport cells in one test, no explicit timeout; 2 of 19 tests timed out at 120 s in this container | Either flaky on slow runners or hides real regressions behind timeout | `test.slow()` / split per viewport cell; confirm with a solo re-run (pending) | high |
| specs/livery-sidewall.spec.js:5-6 + t1/t2 | Test 1 duplicates the unit twin; test 2 only checks a class removal; test 2 timed out here (Click steps 30-45 s under load) | Little renderer coverage, stale header | Delete t1; assert real ink on the wheel; re-run solo (pending) | medium |
| unit/trackside:109-121 | CAM_MODES regex checks relative order not "index 14"; Tracks/FlybySeq/CamAvoid faked | Source-text scan stands in for behaviour | Import the real mode table and assert the index | high |
| unit/track-retained-state:33 | Tautology against mocked createMesh | Asserts the mock, not retention | Assert real retained buffers are dropped | high |
| specs/f1-track-accuracy:94 | `LIST.length === 52` hard-coded; raw def points not built centreline | Breaks on any roster change; accuracy claim not about the built track | Derive from CIRCUIT_MAP; compare trackShape(); make it a node test | high / low |
| specs/tracks-walls-a/b | Same body, two files | 475 s each doing the same work shape | Merge into one parametrised file | high |
| specs/monaco-foundation (t2) / montreal:107 | Stale 1.4 m cap; `toHaveLength(3)` contradicts its comment | Brittle/stale | Delete / remove | high |
| unit/ui-fit-trackdesigner-toolbar-r6 | Source-text CSS scan only; no layout assertion on `.sel-chip` anywhere | The clipping symptom is untested | Add a measured-layout assertion in the designer spec | high |
| unit/track-validate-fleet:34-35,177,212 | red starts/grades logged only; wall-clock thresholds | Fleet silently gains red starts; flakes under load | Ratchet counts; loadavg-scale | medium |
| ~15 foundation specs | 1.4k lines of copied boilerplate (boot, geometry.every(ok), walls.anyNaN, minOverHw, clearance>=4.8), 10 on raw @playwright/test (no pageErrors/attachments) | One parametrised circuit-foundation spec fed by a per-circuit table would replace most of it | refactor in pass 2 | medium |

## Gaps
- js-debugger MCP cannot attach to Node (lists Chrome page targets only); unit debugging used in-process CDP and V8 coverage. Pass-2 tooling fix: Node target support.
- Counting logpoints (CDP condition breakpoints) do not register on vm-evaluated scripts compiled by the repo's script cache path; coverage worked. Worth a look in tools/lib/game-vm.cjs `runScriptCached` if debugger-on-vm is wanted.
- Nothing covers a measured layout of the designer `.sel-chip` toolbar (grep confirmed).
- Twin overlaps not diffed: track-designer vs track-designer-dom; scenery-kits vs unit twin; offtrack vs offtrack-vm / offtrack-edges-vm.
- 12 OSM circuits are checked against their own source in f1-track-accuracy (circular).

## Not run / not done
- Debugger on all 26 specs: not done (debug-chrome pass not started; context cap).
- tracks-walls, vegas-foundation, zandvoort-foundation: pending (verdicts not read at time of writing; update in a follow-up).
- props-over-road: spa, suzuka, ... tail of the roster (6 of 52 tests) not run (my 1500 s cap).
- livery-sidewall and track-designer failures: need one solo re-run to classify real vs environment. Provisional: environment/slow (SwiftShader, no /dev/dri; Click steps 30-45 s; unit coverage runs were competing for CPU at the time for livery-sidewall).
- Subagent line numbers for track-shot-survey (other than 311, 325-328, 399, 412) are approximate (+-2).


---
_Generated by [Claude Code](https://claude.ai/code)_
