<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT car-2 (partial 1/n (46/46 run, 1 environment fail))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261047255
- Posted: 2026-10-19T06:22:29Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 1/n (46/46 run, 1 environment fail) (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT car-2 (partial)

Correction to the first version: `unit/parts-visual-distinctness` **passed, 76 s** (13 tests); the table row now says so. All 27 unit files exit 0; 18 of 19 specs pass; `parts-mesh-cache` fails (environment timeout).

Batch car-2: 46 files (27 unit, 19 spec). **Run: 45 pass, 1 fail (environment).** Every file was read with its module under test (two read-only subagent passes, spot-checked by me). **Debugger column is NOT done for any file** (context hit the 120k cap), see Not run.

## Per-file table
Debugger: `not-run` everywhere. Quality = S strong, M mixed, W weak, V partly vacuous. "scan" = regex over source text.

| file | purpose | run | dbg | quality | mock / wrong target | verdict |
|---|---|---|---|---|---|---|
| unit/helmets | helmet meshes/sheet build | pass 2.7s | not-run | S | spawns `helmet-sheet --help`, car3d.js text scans | keep; move scans to a wiring test |
| unit/hud-helmet-placement | HELMET-camera HUD placement | pass 0.4s | not-run | M | tests 2-3 are CSS regex; name suggests driver helmets | merge into CSS pin file, rename |
| unit/legend-parts-seed | legend parts seeding | pass 0.3s | not-run | S | "fits the garage budget" (L96) never checks budget | strengthen (add `getCost<=BUDGET`); split MY TEAM tests |
| unit/legends-team | legend teams/seats | pass 0.2s | not-run | M | `seatsFor` is a hand copy of game.js:1476-1481 (L75-100) | rewrite |
| unit/livery-contrast | atlas ink contrast | pass 94s | not-run | S | L163-170 source scan; 94 s in a unit group | keep, move to slow group |
| unit/livery-decal-surfaces | decal placement on meshes | pass 4.5s | not-run | S/V | L325-327 vacuous; L347-350 regex on `toString()` | keep; fix 2 spots |
| unit/livery-design | livery painter/editor | pass 31s | not-run | M | L469-473 halftone asserts nothing; L355-358 vacuous | strengthen, split by concern |
| unit/livery-draft-mesh-cache | draft mesh cache | pass 0.2s | not-run | M | L31-37 never proves custom entries dropped; L39-43 source slice | strengthen |
| unit/livery-finish-contract | finish field contract | pass 0.2s | not-run | S/M | L79-93 field-list scan | merge scan into team-livery |
| unit/livery-helmet-style | helmet livery style | pass 1.3s | not-run | S | L125 `Parts.defaults` does not exist; L188-196 scans | keep; fix stale API |
| unit/livery-tier | decal tiers/atlas memory | pass 0.3s (1 skip) | not-run | M | L62-102 `atlasBytes` fed literals, tautological; Chromium test L491 | rewrite memory tests, move browser test to a spec |
| unit/livery-wheels | wheel tint build | pass 1.0s | not-run | S | L96-108 scan tests | keep |
| unit/livery-zone-finish | zone finish | pass 1.3s | not-run | S | L119 same dead `Parts.defaults` | keep; merge with livery-helmet-style |
| unit/loading-card | loading card | pass 0.4s (52 tests) | not-run | S + scans | ~400 lines of regex pins on game.js/apex.js/CSS | rewrite scan half |
| unit/particles-dirty | particle dirty latch | pass 0.1s | not-run | S | real particles.js in vm | keep |
| unit/parts-distinct-mesh | parts meshes differ | pass 18s | not-run | S | `eligibleTeam` L148 copies audit-parts.mjs | merge into parts-visual-distinctness |
| unit/parts-ladder | parts cost ladder | pass 0.3s | not-run | M | L94-113 copies career budget constants | strengthen |
| unit/parts-locked-equivalent | locked parts equal | pass 0.2s | not-run | M | L238 compares a call to itself | keep; fix L238 |
| unit/parts-visual-distinctness | option census | pass 76s | not-run | M | L158 silent return; hard census (12/297/128) | keep |
| unit/share-card-data | share-card data | pass 0.2s | not-run | M | L35 tautology | keep |
| unit/share-card-layout | share-card layout | pass 0.1s | not-run | S | | keep |
| unit/share-card | share-card render | pass 0.1s | not-run | M | `render()`, `ensureFonts`, QR paint never called despite header | strengthen |
| unit/team-livery | team livery | pass 2.8s | not-run | S/M | duplicate-key scanner and field scans misfiled | split |
| unit/team-style-relief | team style relief | pass 0.2s | not-run | V | L87-88 `${S.Car3D}` is an object string, determinism guard can never fail | fix or delete |
| unit/title-home-scene-prepaint | title pre-paint | pass 0.2s | not-run | V | Chromium test returns early when `/usr/local/bin/google-chrome` is missing (it is here) | move to a spec |
| unit/ui-fit-garage-livery-r6 | garage CSS snapshots | pass 0.1s | not-run | M | exact CSS declaration pins | merge into pin file |
| unit/ui-journey-career | career UI journey | pass 0.1s | not-run | M | L129-161 real sliced functions; rest CSS regex | keep L129-161, move regex |
| spec/car-effects | exhaust/brake/ERS/grid lights | pass 389s | not-run | M | L77-80 asserts literal `boostFlame:false` | strengthen |
| spec/career-hub | career modes, settlement | pass 219s | not-run | M | daily-backup test misfiled (L28) | keep |
| spec/career-season | objectives, rollover, offers | pass 350s | not-run | M | dup "spread of briefs" L52 vs L480; literal 150 | keep, dedupe |
| spec/career | career flow/save/migration | pass 346s | not-run | S | orphan banner L774-780 | keep |
| spec/carview-parts | carview dev tool | pass 144s | not-run | W | visibility/option-count only | keep as smoke |
| spec/custom-team | decal texture free on recolour | pass 396s | not-run | M | spies on GLX/LiveryTex/Car3D never restored | keep |
| spec/garage-livery-churn | GPU churn on paint edits | pass 92s | not-run | M | edits `c2` though header says WING; `end.flaps` unguarded | keep |
| spec/garage-out-before-card | drive-out before card | pass 798s | not-run | M/V | OR-ed pass cond. L71-72, conditional expect L217, `park()` inside poll | strengthen |
| spec/garage-prebuild | garage prebuild | pass 42s | not-run | M | only live proof of prebuild | keep |
| spec/livery-wheels | rim/caliper rows | pass 80s | not-run | S | test 1 duplicates the unit test | delete test 1 |
| spec/parts-budget | budget/FREE BUILD | pass 761s | not-run | M | 3 divergent `openSetup` copies | keep |
| spec/parts-catalog | 12 categories, gating | pass 386s | not-run | M | hard-coded `/90/`, copy, `>=6`, 12-id list | de-brittle |
| spec/parts-liveries | livery catalog/finish remap | pass 480s | not-run | M/V | "in-race player car" L173-197 never races; leaks store keys | rewrite that test |
| spec/parts-livery-contrast | ink legibility | pass 8s | not-run | W | re-implements `lum/ratio/inkOn` locally (L34-129) | rewrite onto `LiveryTex.contrast`, move to unit |
| spec/parts-livery-crest | crest pills | pass 69s | not-run | S | fresh boot per test | merge with other livery-editor specs |
| spec/parts-livery-designs | motif pills | pass 71s | not-run | M | only `halftone` diffed; `ids>=6` floor | merge |
| spec/parts-livery-zones | zone finish pills | pass 73s | not-run | M | L67 `chrome` not differential vs baseline | fix, merge |
| spec/parts-mesh-cache | bounded mesh caches | **FAIL** 618s, re-run alone FAIL | not-run | M/V | L417-419 vacuous `if (passes>0)` | keep 3 eviction tests; fix warm-up test |
| spec/parts-setup-ids | `data-cs-*` ids, camera | pass 454s | not-run | S/M | zoom bounds `>4`/`<16` vs real 4.6/15 | pin constants |

## Failure classification
`parts-mesh-cache.spec.js › race warm-up builds the shadow casters, so lights-out builds none`: **environment** (SwiftShader, no /dev/dri). First error: `Test timeout of 120000ms exceeded.` Failed in the full-file run (200 s) and again when re-run alone (`-g "race warm-up"`, 06:18-06:21Z). It is deterministic here, not flaky. The other 5 tests in the file pass. I have not checked it on CI llvmpipe.

## Top findings (ranked)
1. `tests/unit/legends-team.test.mjs:75-100` | `seatsFor` is a hand copy of `game.js:1476-1481`; the real one returns `Career.gridDrivers(team)` for non-legends | "one car per legend" can stay green while game.js grids twelve | slice the real function into a vm | high
2. `tests/unit/team-style-relief.test.mjs:87-88` | `${S.Car3D}` stringifies an object, so `doesNotMatch(/Math\.random/)` can never fail (confirmed by reading the file) | dead determinism guard | read car3d.js text or make `Math.random` throw during build | high
3. `tests/specs/car-effects.spec.js:77-80` (+ carview-parts:94-99) | `carEffects()` hard-codes `boostFlame:false` (js/agent/apex.js:1974) | claim can never fail | report the real draw decision | high
4. `tests/specs/parts-livery-contrast.spec.js:34-129` | re-implements `lum/ratio/inkOn`; `LiveryTex` exports the real ones (liverytex.js:2592) | the gamma-lum regression it describes cannot be caught | call module functions, move to unit | high
5. `tests/unit/title-home-scene-prepaint.test.mjs:196-234` | launches Chromium from hard-coded `/usr/local/bin/google-chrome` (line 108; the file is missing here) and passes when it is missing | pre-paint regression unchecked | move to a spec with `chromium-path` discovery | high
6. `tests/specs/parts-mesh-cache.spec.js:417-419` | expect wrapped in `if (probe.passes>0)`; `frames===0` holds trivially when shadows are shed | "lights-out builds none" can pass vacuously, and the test times out here | force shadows on or fail when `passes===0`; raise timeout/`test.slow()` | med-high
7. `tests/specs/parts-liveries.spec.js:173-197` | "in-race player car" test never races; writes `team`/`livery.<id>` to the store without restoring | fitted-livery→player path untested, state leaks | check the player mesh or retitle and restore | high
8. `tests/unit/livery-tier.test.mjs:62-63,71-72,90-102` | `atlasBytes(n)` called with literal divisors, `atlasDiv` never feeds it | tier regression passes memory-budget tests | pass `atlasDiv(...)` results in | high
9. `tests/unit/livery-helmet-style.test.mjs:125`, `livery-zone-finish.test.mjs:119` | `Parts.defaults` does not exist (`parts.js:855-861` exports `DEFAULTS`) | stale API, ternary always takes `{}` | use `Parts.DEFAULTS` | high
10. `tests/specs/garage-out-before-card.spec.js:71-72,217,296-299` | OR-ed pass condition, conditional `after` expect, `park()` mutates inside a poll | a card that never appears can still pass | require the card per path | med
11. `tests/unit/loading-card.test.mjs:341-364,397-438,826-990,1056-1080` | verbatim regex pins on game.js/apex.js/CSS | reformat breaks them, behaviour regression passes | keep vm tests, slice functions into vm | high
12. `tests/unit/livery-decal-surfaces.test.mjs:325-327,347-350` | `ck = X ? null : null` vacuous; mirrored-number check is a regex over `Function.toString()` | backwards driver number undetected | drive the cockpit quad data via an exported path | high
13. `tests/unit/livery-design.test.mjs:469-473` | `rects` filtered by `id==="lineFade"`; `if (rects.length)` skips silently | halftone fade asserts nothing | assert monotone sizes for halftone | high
14. `tests/unit/legend-parts-seed.test.mjs:96-105` | "fits the garage budget" only deep-equals to `Legends.parts` | over-budget seeded sheet slips through | add `getCost<=BUDGET` | high
15. `tests/specs/parts-livery-zones.spec.js:67` and `parts-setup-ids.spec.js:384,386,211` | chrome count not differential; zoom bounds `>4`/`<16` vs real `SP_DIST_MIN` 4.6 / `SP_DIST_MAX` 15; `if (chips>1)` hides a missing chip | drift passes | differential count; export constants | med-high

Findings 1, 3-4, 6-15 come from the subagent reads and were not each re-verified by me; 2 and 5 I checked directly.

## Gaps
- `Legends.ratingsFor`, `statsFor`, `byCode` have no direct test.
- Nothing exercises the player-car mesh built from a fitted livery in a real race (parts-liveries only builds it directly).
- `share-card`: `render()`, `ensureFonts`, QR paint never called by any test in this batch.
- Spec cost: 4 livery-editor specs (crest/designs/zones/wheels) each pay a fresh boot for the same 9-step entry path; three divergent `openSetup` copies (parts-budget/catalog/setup-ids). 17 specs still carry the stale "UNVERIFIED IN A BROWSER at conversion time" banner.
- Tooling: the js-debugger MCP lists only Chrome page targets, so it cannot attach to `node --inspect` (`debugger_targets` returns `[]`, attach says "Unknown page targetId"). Pass-2 tooling fix. Also, most of these unit files evaluate code with `vm.runInContext` and no filename, so V8 coverage and URL breakpoints cannot see it. A preload that names vm scripts after the js/ file worked on particles-dirty (particles.js 23/38 functions ran) and could become a shared helper.

## Not run
- **Debugger check, all 46 files** (hit/not-hit). Only one trial was done: `particles-dirty` via coverage, hit (`js/fx/particles.js`, 23/38 fns). No MCP-debugger logpoints on the specs and no CDP breakpoints on the unit files. Reason: reviewer context reached the 120k cap. Handed off.
- `parts-mesh-cache` warm-up test: ran twice, timed out twice, never reached its assertion on this box.
- Per-spec logs were not read for retries beyond exit codes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NiovUpX7tCZBbXbm5GkAsi
