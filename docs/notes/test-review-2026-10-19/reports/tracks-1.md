<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT tracks-1 (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260858521
- Posted: 2026-10-19T06:09:01Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT tracks-1

**Batch tracks-1: 58 unit files (0 specs), ~15.9k lines. Reviewed 58/58. Run: 58/58 pass (serial `node --test`, ≈35 min wall total, no flakes, no retries).** Debugger: the js-debugger MCP only lists Chrome pages and cannot attach to `node --inspect-brk` (`debugger_targets http://127.0.0.1:9229` → `[]`; orchestrator informed). I drove the Node inspector over CDP directly: `node --inspect-brk=PORT <file>`, `Debugger.setBreakpointByUrl` (urlRegex) on code-under-test lines, counted `Debugger.paused.hitBreakpoints`, resumed. Script/raw results are in `artifacts/test-review/tracks-1/` (cdp.mjs, dbg.txt, dbg2.txt). Debugger column: `hit(n)` = bp at that line hit n times in the file's own run; `not-hit` = bound, never reached; `unres` = code runs in a vm script with no filename, so CDP and V8 coverage cannot attribute it; `n.a.` = source-text scan, no code under test. Files were read in full with the module under test (two read-only subagents, halves of 29; their line numbers were spot-checked). Breakpoint lines are function-body entry lines, not every asserted branch: a hit proves the module runs, not that each asserted branch does.

## Per-file table
file | purpose | run | debugger | quality | mock / wrong target | verdict
---|---|---|---|---|---|---
albert-park-foundation | Albert Park def flat/terrain contract | pass 0.4s | hit(2) albert_park.js:31 | mixed (rise bounds .75/1.2 arbitrary) | :52-55 regex on `groundPlane` spelling (valid API, 6 other circuits use it) | strengthen: drop :55 scan
audit-circuit | audit-circuit CLI verdict on floating/ground | pass 28.3s | hit(9) audit-circuit.cjs:59 | mixed-strong | :73-81 source scan stands in for "absent baseline row = cap 0"; CHECKS.verify mocked | strengthen: call CHECKS.ground with stub baseline
circuit-axis | fit-tool aspect axis | pass 0.3s | hit(1) circuit-axis.mjs:23; not-hit track-maps.js:243/245 | mixed | asserts the tool's own copied aspects; never compared with TrackMaps.aspect() | strengthen
circuit-corner-anchors | corner numbers/bank zones (Imola, Hungaroring, Monaco, Bahrain) | pass 0.5s | hit(4) mesh.js:90, hit(4) tracks.js:25 | strong | Bahrain test slices scenery source + `new Function` | keep
circuit-count-shell | index.html/manifest copy matches circuit count | pass 1.7s | not-hit tracks.js:25/26 (createGame vm loads under another URL; unres) | strong for job; `>=52` floor | boots full createGame for 3 lengths | keep; use buildContext
circuit-def-fields | authored def field not dropped in Tracks.LIST copy; sector/bank/hairpin sanity | pass 4.2s | hit(99) tracks.js:25 | strong (drop detector :74) | 12 unrelated tests; hard-coded 52 (:203) | regroup: split :266-398
circuit-meta | generated meta stubs fresh | pass 0.3s | hit(1) gen-circuit-meta.mjs:5 | mixed | overlaps circuit-def-fields :160-190 | merge
circuit-scope | APEX_CIRCUITS scoping/shards | pass 1.5s | hit(12) circuit-scope.cjs:35 | mixed | :52-102 regex of ci.yml + 9 sibling tests = wrong target | regroup
circuit-vocab | circuit names a tree/stand word engine lacks | pass 0.4s | not-hit build-props.js:1566/1568, data.js:116/118 | mixed-strong; :104-109 vacuous (KNOWN_UNHANDLED empty) | valid sets text-parsed from source; engine dispatch never run | strengthen
collide-wall-limits | AI car past pit wall/gantry keeps illegal x | pass 7.3s | hit(4) contact-geometry.js:123, hit(2) collide.js:717 | strong (anti-vacuity :46/:61) | none | keep
custom-tracks | MY CIRCUITS registry/sanitizer | pass 2.6s | hit(2533) custom-tracks.js:53 | strong | fake GameStore; loop-size test duplicated :388/:488; `52` hard-coded; :237-247 scan | keep; trim
data-hub-offline | Data Hub offline error + RETRY | pass 0.3s | hit(1) hub.js:499 | strong | F1API fakes (the point) | keep
designer-canvas | designer map gestures/overlays | pass 4.0s | hit(2) canvas.js:396 | mixed-strong | :276 copies source buckets; :478-488 counts TrackShape calls; destroy test dup of designer-profile :282 | strengthen
designer-code-cli | designer-code CLI exit/issues | pass 1.8s | hit(5) designer-code.mjs:99 | strong | none | keep
designer-profile | elevation profile editor | pass 2.1s | hit(18) profile.js:240 | mixed-strong | :144-146 conditional fallback; :111-118 near-vacuous | strengthen
designer-props | placed props caps/dress/codec | pass 10.5s | hit(18) props.js:8 | strong | :44 Math.random(); :133 vacuous typeof; 3 near-identical flood tests | strengthen
elevation-smoothness | no knife-edge grades | pass 40.4s | hit(1) circuit-elevations.js:1, hit(18) tracks.js:25 | mixed | `if(id==="cota")`/nurburgring inside loop; no floor on ids.length | strengthen
elevation-tracks-vm | slope/banking across 40 circuits | pass 261.3s | not run under debugger (400 s timeout; VM worker pool not followed) | mixed (thresholds :243-250) | banking only zandvoort+madrid; hand-kept 40-id list | keep; add baseline
foundation-core-vm | foundation circuits build finite geometry | pass 37.0s | hit(1) apex.js:1 | mixed (`>=16` floor) | circuit set derived from spec filenames: no-spec circuits uncovered | strengthen
home-world | title-screen home world | pass 0.2s | unres (vm, no filename) home-world.js:86 | strong behavioural | :94 hard-coded pit camera numbers; :69 flyCalls===4 | keep
kerb-berm-surface | kerb/berm change mesh+terrain | pass 9.8s | hit(6) mesh.js:335, hit(8) surface.js:34 | mixed | :110-115 `pos.length>1000` near-vacuous | strengthen
kerb-stripes | kerb triangles blend stripes | pass 6.9s | hit(3) mesh.js:335, hit(3) mesh.js:675 | strong | only monza/silverstone | keep
lazy-track-build | track-build toolkit loads before scenery | pass 0.4s | unres lazy-bundles.js:185 | weak-mixed | copies 13-file list :16-40; regexes :42-57; fake appendChild sets the globals it asserts :91-114 | strengthen: delete copy+scans
livery-cover-graphics | livery painters/contour | pass 0.2s | hit(3) livery-graphics.js:4; unres surface-outline.js:11 | mixed | :93-96,:154-157,:175-201 scans (`73856093`, `Sf.h*0.045`); outline tests in wrong file | rewrite
livery-sidewall | sidewallInk recolours only lettering | pass 1.5s | hit(18) car-wheels.js:24 | strong | :122-129 call-site scan | keep; trim
menu-nav-spatial | menu D-pad/arrow nav | pass 0.3s | unres menu-nav.js:291 | mixed; 5 n.a. scans :138-190,:387-394 | scans duplicate behavioural tests | rewrite: delete scans
offline-precache-nav | sw.js navigation race | pass 0.4s | hit(10) sw.js:21 | mixed | shim hard-codes `ms===3000`=NAV_RACE_MS (:36); stall test can pass vacuously (:70); dup harness of service-worker.test | merge
offtrack-edges-vm | car overlapping gantry leg pushed to road face | pass 6.7s | hit(1) wall-clamp.js:13, hit(308) contact-geometry.js:123 | strong (literal monza numbers) | none | keep
offtrack-vm | progress/wrong-way/auto-rescue | pass 15.3s | hit(1) wall-clamp.js:13, hit(1) game.js:1 | mixed (thresholds -2/-9/5) | name mismatch; rescue logic line not proven hit | rewrite name
props-over-road | prop 0.2–5 m over road | pass 158.3s | hit(57) build-props.js:242 | strong (planted controls :340-428) | basin test :433-459 one-sided `gap<=0.18`; dead BASELINE/ALLOW :110-111 | keep; two-sided
props-tri-ratchet | prop triangle growth | pass 143.7s | unres (main run in subprocess props-tris.cjs) | strong | subprocess outside inspector | keep
radio-lines | radio fill/anti-repeat | pass 0.2s | hit(3636) radio-lines.js:136 | mixed (`assert.ok(msg)` :33 indirect; `>=5 variants`) | LONG slot list hand-copied | keep
scenery-api-contract | scenery(api) surface frozen | pass 4.7s | hit(3) build-props.js:71 | mixed | landmark test :111-142 regex; Silverstone :165-240 Proxy no-op mock, magic counts | regroup
scenery-ground-audit | buried/unsupported props | pass 383.8s | hit(1) ground-audit.cjs:265 | strong (anti-vacuity :99) | hand-built track.meshes :264-281 | keep (model ratchet)
scenery-grounding | floating scenery ratchet | pass 171.8s | hit(1) float-audit.cjs:1 | mixed | :153 stale check without advisory policy; Jerez test copies seat maths | strengthen
scenery-guards | suppression/coincident guards | pass 43.5s | hit(16) build-props.js:309, hit(16) :363 | mixed | ~10 tests regex exact expressions :146-244,:279-293; alreadyLaid/spotTaken never executed | rewrite scans
scenery-kits | ~38 tests, 10 modules | pass 1.0s | hit(27) models.js:3; not-hit data.js:116/118 | mixed-strong | disjunctions :955,:962,:1056,:1062; magic counts :106,:185; :1068 slices+evals build-props.js text | regroup by module
shared-track-foundation-characterization | lap transforms, ground anchor, finite buffers | pass 141.3s | hit(59) tracks.js:25 and :273 | mixed | BANK_BOUND=3 m vs 0.04 measured :245; pins LIST 52/SEASON 24 :409; continue-skips :170,:175; dup vm harness; stale header | merge/regroup
span-kinds | span kind accepted by agent-view spec | pass 0.3s | n.a. (build-props.js:364 not-hit) | mixed | regex of emitters vs regex of Playwright spec array | rewrite: shared constant
spline-fold-diagnostics | hairpin mesh folds | pass 1.6s | hit(1) spline.js:2 | strong | digest vs own run | keep
spline-project-height | Tracks.project on Suzuka | pass 8.8s | hit(1) spline.js:166 | strong | reference() copies pre-grid source | keep
suzuka-crossover-span | figure-8 bridge span | pass 8.3s | hit(3) mesh.js:675, hit(3) tracks.js:25 | mixed (fitted band) | :85-87 verifyTrack duplicates verify-track | strengthen
track-accuracy-validator | shape-error validator | pass 0.2s | hit(384) track-accuracy-validator.mjs:48 | mixed | one unit-square case | strengthen
track-build-vm-release | harness release/trim; strip counts | pass 29.1s | hit(140) track-build-vm.cjs:88, hit(1) hidden-faces.js:1 | mixed | STRIP exact counts :154-250 (~25 re-pins) dup props-tri-ratchet; :267 regex | regroup to tooling
track-build-wait | fixture stall wait | pass 1.5s | hit(1) await-track-build.js:1 | strong | tests infra; two scans of fixtures.js | regroup
track-centerline-seam | last node joins node 0 | pass 1.3s | hit(5) tracks.js:26 (not-hit :273) | strong | Catmull-Rom copy; 2nd test unrelated | strengthen: fleet sweep
track-codec | APXT1 share codes round-trip | pass 1.3s | hit(15) codec.js:15, hit(107) custom-tracks.js:53 | strong | real CompressionStream | keep
track-def-factory | circuits unchanged through TrackDef.fromRaw | pass 0.6s | hit(4) def.js:8 | mixed | golden hashes all non-function fields | strengthen: narrow hash
track-designer-dom | Designer screen end to end | pass 74.9s | hit(105) designer.js:1, hit(3030) custom-tracks.js:53 | mixed-strong | ~23 `assert.match(css…)` :1002-1082; regexes :562,:719; 650 ms real wait :478 | strengthen + split
track-editor-geometry | Dubins/stamps/randomiser/validator | pass 7.5s | hit(17) shape.js:1, hit(46) validate.js:108 | strong | :158 disjunction; `green>=28` of 30 :130; digest pin :338 | keep
track-fixes | designer FIX/FIX ALL | pass 2.4s | hit(2118) fixes.js:353 | strong | none | keep
track-foundation | TrackSpace/Surface/Models, envCull | pass 18.4s | hit(7) space.js:3, hit(13) models.js:3 | mixed | :398-510,:517 are n.a. scans of game.js/shadow-pass/tlx/tuner; wrong group | split/regroup
track-graph | scenery graph record/bake/instance | pass 0.3s | hit(47) graph.js:67 | strong | guarded emitter mimics protocol; :531-537 shader scan | keep
track-insight | designer insight layer | pass 2.9s | hit(1) insight.js:3 | strong | frozen estLapBefore copy | keep
track-line-circuits | racing line on real circuits | pass 133.0s | hit(10) line.js:371 | mixed | copies LAT/BRAKE/ACCEL from driving-line.js; 0.95 arbitrary | strengthen
track-line | AI racing-line bake | pass 2.4s | hit(1) line.js:67 | strong | :220 wall-clock timing can flake | keep
track-night-override | scenery reads build night, not def.night | pass 0.2s | n.a. scan; not-hit structures.js:1010, build-props.js:242 | wrong target | readdirSync(js/track) non-recursive | rewrite
track-preview-plan | picker preview layout maths | pass 0.2s | hit(47) track-maps.js:243 | strong arithmetic | not track engine | regroup to UI

## Top findings (ranked)
# | file:line | defect | why it matters | proposed fix | conf
---|---|---|---|---|---
1 | track-night-override.test.mjs:34 | `readdirSync(js/track)` not recursive; scenery/ and core/ never scanned (structures.js:1010 and build-props.js:242 not-hit). The one non-tracks.js `def.night` read (build-props.js:242) is unexamined | the forced-night regression class its header cites is unguarded | recurse and sanction build-props.js:242, or build a night def at day and assert dress | H
2 | menu-nav-spatial.test.mjs:138-190,387-394 | 5 tests regex step()/pickSideways()/onWheel() source | fail on harmless refactors, pass on dead code; behavioural tests :278-385 cover | delete the 5 scans | H
3 | livery-cover-graphics.test.mjs:93-96,154-157,175-201 | scans pin strings; surface-outline tests in wrong file | guards text, not paint | delete scans; split surface-outline test | H
4 | scenery-guards.test.mjs:146-244,279-293 | ~10 tests regex exact expressions; alreadyLaid/spotTaken (nature.js:167) never executed | coincident-geometry guards unproven | build two overlapping spans/trees, assert one primitive | H
5 | circuit-vocab.test.mjs:96,120 | build-props.js:1566/1568, data.js:116/118 never reached; sets text-parsed; :104-109 vacuous | an engine-dropped vocab word is not caught | import SPECIES / exercise dispatch | M-H
6 | circuit-axis.test.mjs:14-23 | asserts tool's own copied aspects; track-maps.js:243/245 not-hit | stale aspect passes | compare to TrackMaps.aspect(def) | M-H
7 | lazy-track-build.test.mjs:16-57,91-114 | copied file list, regexes, fake appendChild assigns the globals it asserts | cannot fail on real loader regression | keep only :59-117 with real files | H
8 | track-build-vm-release.test.mjs:154-250 | exact tri counts re-pinned ~25× and duplicated by props-tri-ratchet baseline | every scenery PR fights it | keep invariants :242-248, drop counts | H
9 | offline-precache-nav.test.mjs:36 vs sw.js:21 | shim hard-codes 3000 = NAV_RACE_MS; change → stall test passes vacuously | silent rot | export constant; merge into service-worker test | M
10 | scenery-grounding.test.mjs:145-156 vs scenery-ground-audit.test.mjs:81 | float ratchet fails on any stale cap off-diff; ground-audit has advisory policy | unrelated PRs go red | adopt staleStrictIds | M
11 | track-foundation.test.mjs:398-517 | scans of game.js/shadow-pass/tlx/tuner/apex inside a track test | wrong group, refactor-fragile | move out; execute governor | H
12 | span-kinds.test.mjs:34-62 | text scan vs text scan of a Playwright spec array | no behaviour | export SPAN_KINDS; delete test | M
13 | track-designer-dom.test.mjs:1002-1082,478 | 23 CSS regexes, 650 ms real wait; 93 tests/2943 lines in one file | layout covered by survey matrix; slow | remove/lint; split 4-5 files | M-H
14 | shared-track-foundation-characterization.test.cjs:245,409-410 | BANK_BOUND 3 m vs 0.04 measured; pins LIST.length 52 / SEASON 24 | 75× slack hides regressions | tighten ~0.1; move roster pins | M
15 | track-line.test.mjs:220; designer-props.test.mjs:44,133 | wall-clock assert; Math.random() input; vacuous typeof | flake / vacuity | counter; seed; delete | M

## Gaps
- Centerline seam checked on 4 circuits only; no all-circuit tangent-continuity sweep.
- `alreadyLaid`/`spotTaken`/seam-tag guards have no direct execution test.
- radio-lines `gapText`/`timeText`/`surname`, `WHY` mapping, `reset()` window covered only elsewhere (voice-pack/race-radio).
- `surface-outline.js` has no own test; `ensureTrackBuild` failure/retry untested; `CHECKS.ground` missing-baseline path never run.
- Circuits without a `*-foundation.spec.js` are never covered by foundation-core-vm.
- Banking twin covers only zandvoort+madrid.
- **Tooling gap (pass-2):** js-debugger MCP cannot attach to Node (`debugger_targets :9229` → `[]`). Code run via `vm.runInContext` without a filename (home-world, menu-nav, lazy-track-build, surface-outline) cannot be attributed by CDP or V8 coverage: give those vm scripts filenames. Tests that fan out to subprocess/worker pools (props-tri-ratchet, elevation-tracks-vm) cannot be followed from the parent inspector.

## Not run
- All 58 files ran and passed; no specs in this batch.
- Debugger incomplete: elevation-tracks-vm (400 s timeout, worker pool), props-tri-ratchet (subprocess), home-world / menu-nav-spatial / lazy-track-build / livery-cover-graphics surface-outline (unres), circuit-count-shell (other URL). span-kinds and track-night-override are pure scans (n.a.).
- Harness note: first version logged via `console.log` in a conditional breakpoint, which fails silently inside vm contexts (no `console`); the final script counts `Debugger.paused.hitBreakpoints`. Positive control: track-centerline-seam hit tracks.js:26 five times.

---
_Generated by [Claude Code](https://claude.ai/code)_
