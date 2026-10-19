<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT modes-1 (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261061793
- Posted: 2026-10-19T06:23:32Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT modes-1

Batch modes-1: 46 files = 39 `tests/unit` + 7 `tests/specs`. **Run: 46/46 pass**, 0 fail, 0 skipped, 0 retries/flakes (single run each, SwiftShader, no /dev/dri, loadavg < 2 at starts). Slowest: real-replay-vm 201 s (57 tests), time-trial spec 564 s (23), season-format 202 s, season 172 s, engine-revs-replay-vm 19 s, baked-model-instancing 13 s, determinism-replay-vm 12 s, baked-model-road-guard 12 s; all other units < 6 s.

**Method.** Source read for all 46 by two read-only Sonnet subagents (23 files each, test + module under test); I ran everything myself and checked the debugger rows. Claims marked (R) are reviewer reads I did not independently re-verify; claims marked (D) are backed by a debugger result.
**Debugger (said once).** The js-debugger MCP lists Chrome page targets only, so for the 39 unit files I drove the Node inspector over CDP myself (`node --inspect-brk --experimental-test-isolation=none --test`, `Debugger.setBreakpointByUrl`, plus a `beforeScriptExecution` instrumentation breakpoint that places breakpoints by source-line text in vm-evaluated scripts). A breakpoint is removed after 3 hits, so `hit` means ≥3 unless a count is shown. Breakpoint lines were chosen by the reviewers from the code under test. Specs: the real MCP debugger via `debug-chrome` after the spec chain finished, but I only got **time-trial** driven (logpoints hit). The other 6 specs were **not** debugger-checked (see Not run). Logpoint lines snap forward (ghost.js 318→319, season-cal.js 463→467), so some reviewer line numbers are a few lines off.

## Per-file table
| file | purpose (failure = ) | run | debugger | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| baked-model-instancing | baked props become one instanced batch; failure = missing/misplaced props or triangle bloat | pass 3, 13 s | hit build-props.js:1845,:1848, tracks.js:400 | strong (exact tri accounting, per-corner compare vs `TrackGeom.addMesh`) | `GLX.createInstancedBatch` stub; `Assets` = node mirror, not assets.js; 1024 threshold copied; Monza only | keep; import threshold, assert tint path |
| baked-model-road-guard | no baked model on Monza racing line | pass 3, 12 s | hit build-props.js:1810 | mixed-strong (anti-vacuity :103-112) | **stale header** :14-22 (`Assets` now supplied by track-build-vm.cjs:80-83); no negative control; decoder mirror compared by counts only (:88-101); TOL/CEIL copied | strengthen: fix header, add control with `rejBox` off |
| ci-watch | CI verdict tool; failure = red read as green | pass 38, 1 s | hit ci-watch.mjs:161,:385,:445 | strong (curl argv/token off argv :224-229, scenarios :278-352) | injected request/clock/curl; hard-coded repo strings | keep; split PR-lookup out |
| data-api-status | Data Hub transport/cancel/pacing/quota | pass 46, 2 s | hit api-transport.js:256,:338,:395,:88 | mixed (strong 64-231, 450-545, 580-649) | regex pins :396-398,:548-556,:651-660; **duplicates data-export ZIP tests** :854-939; copied consts 28/15000/49250/90000 | split into transport/cancel/quota; delete ZIP copy |
| data-export | export ZIP + startline JSON valid | pass 9, 0.4 s | hit export.js:141,:146; **not-hit :100** (90 s wait) | strong (CRC in both headers, central dir, partial-trace defects) | canvas is a noop Proxy (PNG content never checked); hand-written `unzip` | keep; absorb export tests from data-api-status |
| data-hub-layout | hub CSS layout/contrast pins | pass 10, 0.3 s | **n.a.** (CSS regex scan, no code under test) → finding | weak (:22-24,:46-48 regex) | `ruleFor` reads first rule only; "WCAG AA" never computed | strengthen: compute contrast from tokens |
| data-hub-picker | stale picker answers can't clobber tab (stuck LOADING) | pass 47, 1.4 s | hit hub.js:547,:604,:283 | strong (exact interleavings 209-245, 482-594) | hand-rolled `El`; F1API deferred-promise FIFO; telemetry/export stubbed; `transport.forget` (697-715) is in the wrong file | keep; move forget test |
| data-lazy-loader | hub scripts retry without mixing builds | pass 5, 0.3 s | hit script-loader.js:58,:76, lazy-bundles.js:283 | strong (edge order 19-68) | file bodies replaced by stubs, so real eval-time deps untested | keep |
| data-replay-improvements | DSQ not a fake OUT; approx gaps marked; failed refresh keeps cache | pass 3, 0.2 s | hit real-replay.js:168, real-race-tab.js:202,:347; :719 hit ×2 | mixed | :25 `.every()` on possibly empty board (no length assert); dense one-liners | strengthen: add length asserts |
| data-results | RESULTS table per session type | pass 21, 0.3 s | hit results.js:46,:73,:329 | strong 173-407 | **wrong target** :25-66 tests real-race-tab.js (one source line `.find()`ed and eval'd, :1010) | keep; move 25-66 to real-race-script test |
| data-schedule-tz | schedule date/time from one instant (LA) | pass 12, 0.3 s | hit schedule.js:10,:24,:83 | strong (DST, nextFlipAt, observer disposal) | only America/Los_Angeles pinned | keep |
| data-standings | standings order/gaps/H2H bar | pass 6, 0.2 s | hit standings.js:8,:124 | strong | `TEAMS`/`findTeam` :29-47 is a copy of hub.js's resolver | keep |
| determinism-replay-vm | one seed replays byte-identical | pass 4, 12 s | hit apex.js:2041,:2084 | strong (seed control :109-112) | :81-93 mutate the JSON digest string, not the sim; 4 s fixed steer, no overtakes/weather | keep; add incident/longer run |
| engine-revs-replay-vm | WATCH replay cars rev with speed | pass 2, 19 s | hit game.js:4723, real-replay.js:495 | mixed (:57-58 `notEqual(rpm, IDLE)`; :96-101 good) | synthetic linear traces; overlaps real-replay-vm 1436-1463 | strengthen assert vs `rpmFor(naturalGear(v),v)`; merge dupes |
| ghost-share | APXG1 links/files/guests/hash | pass 34, 1.3 s | hit ghost-share.js:30,:209,:368, title-flow.js:77 | strong except :668-694 | regex pins on game.js/hud.js/manifest; `fnSource` slices title-flow; heavy stubs in `resultsHarness` | keep; replace regex test |
| ghost | PB recording/persistence under quota+tabs | pass 24, 5 s | hit ghost.js:318(→319),:239 | strong (LRU, byte budget, foreign-tab merge) | :472-494 regex over game.js; copied 512*1024/150 | keep |
| import-models-workflow | CI import workflow injection-safe, no force-push | pass 6, 0.9 s | **n.a.** (code under test is a .yml; regex over YAML) → finding. Force-push guard test (84-128) runs real bash against temp git repos: strong | mixed | YAML regex brittle to reformat | keep; parse YAML |
| import-models | importer writes AX26 with palette baked | pass 3, 0.8 s | **not-hit** import-models.mjs:186,:73 (code runs in a spawned child, inspector never sees it) | strong (height, colour sampling, mat ids) | fixture duplicated (36-71,150-179) | keep; dedupe; add `--max-verts`, untextured-material, multi-node cases |
| model-pack-format | AX26 v2 layout and quantisation bounds | pass 7, 0.5 s | hit assets.mjs:572, assets.js:609 | strong 111-176 | 91-109 "bit-exactly" only checks counts/ranges against itself; skips when no pack installed | keep; rename or tighten |
| photomode-hold | fly-cam hold buttons / key leak | pass 9, 0.4 s | hit photo-cam.js:222, game.js:4197,:8339; hold-buttons.js:58 ×2 | strong 126-229; mixed 29-95 | tests 1-3 eval game.js text between markers with ~35 hand stubs (:68-95); **misfiled** (3 of 9 about holds) | split/rename |
| platform-session-install | INSTALL APP reachable after toast | pass 2, 0.2 s | hit platform-session.js:127; :136 ×2 | strong | slices `installChip` IIFE by `indexOf`; native branch, overlay click untested | keep |
| real-replay-captions | caption cards don't leak across seek/stop/finish | pass 3, 0.2 s | hit real-replay.js:531,:401 | strong | :31 `drain` copies game.js card queue; flat-track `Tracks.sample` fake | keep; add game-level queue test |
| real-replay-vm | WATCH replay: fit, puppets, director, transport UI, audio focus | pass 57, 201 s | hit real-replay.js:27,:479,:653, real-race.js:451 | strong (oracle test 1689-1724 vs exhaustive search) | ~half uses hand-built fake `G`; 1724 lines in one file | keep; split into 4 files |
| replay-buf | instant-replay ring/scrub | pass 42, ~1 s | hit replay-buf.js:144,:283,:261 | strong ring/restore (:52-162,:268-298,:375-460) | source pins :300-304,:326-336,:482-486; CSS regex :657-667; `indexOf("\n}")` slice :277-285 | keep; convert pins |
| save-durability | no career/garage data loss on quota/foreign-tab/restore | pass 18 | hit store.js:264, restore-points.js:62,:131 | strong (abort rollback, tokens, races :188-205) | hand-written transactional IDB; ordering assumed | keep; real-browser IDB test missing |
| save-migrate | old saves migrate once, idempotent | pass 26 | hit save-migrate.js:275,:286,:176 | strong (hostile input, `__proto__`, future ver) | rung count via regex :48-55, career.js consts via regex :274-280 (drift guard, OK) | keep |
| save-schema-registry | every `apex26.*` write has a schema | pass 5 | hit save-schema-registry.js (module top) | strong (espree AST scan) | 16 files exempt (:33-50) so writes there unchecked; dynamic keys by regex hints :22-30 | keep; scan reads/removes too |
| season-cal | season points, two-gate rule, tab races | pass 68 | hit season-cal.js:463,:263,:538,:612 | strong (~68 behavioural) | regex pins :987-996,:1044-1049,:1078-1081; `REAL_ORDER` copied spec | keep; convert pins |
| session-contracts | dev-tooling session analysis | pass 13 | hit session-contracts.mjs:17,:56,:106 | strong | envelope shapes assumed; dev-only | keep |
| session-entry-vm | quit mid-scenery-load can't start stale race | pass 16 | hit session-entry.js:13,:17,:25 | strong | game.js function slices (:261-290) depend on text boundaries; custom-track script-load path covered only by slice | keep |
| session-status | PR handoff generator | pass 14 | hit session-status.mjs:45,:120,:93 | strong parseVerdict/ciSummary; mixed markdown regexes | `collect()` ~:92 only checks types; fake `git` on PATH | keep |
| session-stub-surface | stubs have every member always-loaded code calls | pass 15 | hit session-stub.js:62 (×1) | strong (derives surface from call sites; `n>=50` sanity :178) | regex scan misses computed/destructured access | keep |
| session-transcript | transcript digest tool | pass 11 | hit session-transcript.mjs:79,:166,:226 | strong | header says "measured 2026-10-16" but fixture is synthetic; `main/parseArgs` untested | keep |
| setup-trial-session | A/B drill armed only on valid runs | pass 10 | hit setup-trial-session.js:50,:87,:14 | strong (refusal matrix, every PHYS guard :162-173) | hand-built `G`; a renamed G member in game.js won't break it | keep |
| share-code | share links round-trip, quota, undo | pass 20 | hit share-code.js:130,:175,:216 | strong 372-513 | **vacuous** `zeroRefModules` :339-343; regex on title-flow :163-168 | keep; delete :339 |
| shared-math | clamp/lerp/wrap/matrix + no private copies | pass 15 | hit mat4.js:5,:7 | strong (wrap vs old ladder, dense sweep :100-110) | regex ratchet exempts js/render/three/ | keep |
| telemetry-view-resize | zoom/DPR change resizes popup map | pass 1 | hit telemetry-view.js:345,:348,:306 (×1 each) | strong but single-path | mini-dom rects hand-set; `currentCSSZoom` faked; no unchanged-ratio case | keep; add cases |
| ui-journey-session | sheets shrink at large UI scale | pass 5 | **not-hit** sheet-shape.js:155 (`classifyFit` never runs); CSS text scan | weak | source-string scan stands in for layout | merge into CSS-contract file or replace with one measured fit |
| watch-transport-scrub | timeline drag coalesces; chapter jumps | pass 8 | hit watch-transport.js:82,:98; **not-hit real-replay.js:426** (real `seekEvent`) | mixed (strong coalescing :57-85) | **mock owns the lead-in formula** (:30 `Math.max(startT||0, e.t-8)`; real = `seekTo(h.t - LEAD_S, h)`) | strengthen: drop lead-in numbers |
| spec/data-lifecycle | stale hub responses, leaked timers/observers, modal focus | pass 11, 17 s | not checked (MCP pass skipped) | mixed-strong; focus containment :467,:508 weak | F1API replaced by deferred promises; minimal `<dialog>` shell, not index.html | keep |
| spec/season-format | custom calendar, classic points, sprint weekends | pass 10, 202 s | not checked | strong on points/stage :155-215 | finish forced via `park(0.9)`+`finishRace()`; `waitForTimeout(300)` ~:195 | keep; poll instead of sleep |
| spec/season | season flags, race length, standings, legacy-code migration | pass 8, 172 s | not checked | mixed | "does not end a N-lap race at 360 s" asserts only `state==="race"` after `step(1,361)`; `waitForTimeout(100/300/500)` ~:110-125; `park(0)` isn't a finish | strengthen |
| spec/telemetry-compare | multi-lane / cross-session telemetry | pass 3, 12 s | not checked | mixed-strong (canvas alpha check is a real paint check) | F1API fully stubbed, synthetic circular GPS; shell not real app | keep |
| spec/telemetry-fit | popup fits notch phone, labels don't overlap | pass 2, 33 s | not checked | strong geometry; **vacuous risk** if `.dh-glabel` matches nothing | safe-area insets simulated | strengthen: assert `labels.length>0` |
| spec/time-trial | TT flags, ghost recording, sectors, practice/pause drills | pass 23, 564 s | **hit** ghost.js:318(→319) ×1, game.js:6183 ×3 (MCP logpoints) | mixed: `/REC/` :105 also matches "REC 1:15.00"; `toBeGreaterThanOrEqual(1)` :210,:230 loose | ghost laps fabricated by direct `Ghost.record` :309-312; 585 lines of mixed concerns | strengthen; split practice-controls block |
| spec/watch-transport-layout | WATCH chapter drawer ≤62% height on phone | pass 2, 24 s | not checked | strong geometry | fake replay (layout only); one data shape | keep |

## Top findings (ranked)
| # | file:line | defect | why it matters | proposed fix | conf |
|---|---|---|---|---|---|
| 1 | watch-transport-scrub.test.mjs:30 (asserts ~:118, :154) | mock `seekEvent` embeds the lead-in formula; chapter seek targets 0/82/91/-5 assert the mock. (D) `real-replay.js:426` never reached | the real lead-in (`seekTo(h.t - LEAD_S)`) is untested here; a wrong LEAD_S passes | drop numeric chapter targets, assert dispatch only; real lead-in covered in real-replay-vm | high |
| 2 | ui-journey-session.test.mjs (whole) | regex over CSS text; (D) `sheet-shape.js:155 classifyFit` not-hit | sheets can overflow at large UI scale and stay green | replace with one measured fit in the UI matrix, or fold into a CSS-contract file | high |
| 3 | data-api-status.test.mjs:854-939 vs data-export.test.mjs:226-272 | ZIP/CRC/central-dir verified twice; export-gather 90 s test (:792-832) sits in the transport file; (D) export.js:100 not-hit in data-export | duplicate maintenance; the weaker copy can mask drift | delete the copy; move the 90 s test to data-export | high |
| 4 | replay-buf.test.mjs:326-336, :300-304, :482-486; season-cal.test.mjs:987-996,:1044-1049,:1078-1081; ghost.test.mjs:472-494; ghost-share.test.mjs:668-694; data-api-status:396-398,:548-556,:651-660; share-code.test.mjs:163-168 | regex/index-order scans of game.js and other sources stand in for behaviour | fail on refactor, pass on behavioural regression (e.g. `Career.scoreRound` ordering vs `isScrubbing`) | convert to game-vm behavioural checks or move to a lint | high |
| 5 | share-code.test.mjs:339-343 | `zeroRefModules` asserts only `encode` is a function and a file exists | cannot fail meaningfully | delete | high |
| 6 | baked-model-road-guard.test.mjs:14-22, :88-101 | stale header (Assets now supplied by default, track-build-vm.cjs:80-83); no negative control; decoder mirror compared by counts | guard could pass with the rejection disabled | add run with `rejBox` off that must fail; fix header | high |
| 7 | data-results.test.mjs:25-66 | tests `real-race-tab.js`, not `results.js`; test 1 `.find()`s one source line (real-race-tab.js:1010) | reformatting a line breaks it with no behaviour change | move to real-race-script test, import instead of slicing | med-high |
| 8 | tests/specs/season.spec.js (360 s tests; ~:110-125) | `state==="race"` after `step(1,361)` passes if `step` no-ops; `waitForTimeout(100/300/500)`; `park(0)` as "finish" | vacuous-risk plus flake source (wait-polling lint bait) | assert `raceT`/timing advanced; use `waitForFunction` | med-high |
| 9 | tests/specs/time-trial.spec.js:105 | `/REC/` regex also matches "REC 1:15.00" | stale record leaking into a first-run HUD would pass | assert exact hidden/absent state | high |
| 10 | tests/specs/telemetry-fit.spec.js (label overlap/clip checks) | passes when `labels.length===0` | gauge-label clipping regressions invisible if selector drifts | `expect(labels.length).toBeGreaterThan(0)` | high (R) |
| 11 | photomode-hold.test.mjs:29-95 | game.js text sliced between markers, `tickBody` run with ~35 hand stubs; only 3/9 tests about holds | new dependency in `tickBody` makes false reds; file name misleads | move tests 1-3 beside pause-silence or through real-replay-vm; rename | med (R) |
| 12 | engine-revs-replay-vm.test.mjs:57-58 | `notEqual(rpm, IDLE_RPM)` passes for any non-idle value | wrong gear/rpm mapping passes | assert equals `rpmFor(naturalGear(v), v)` | med |
| 13 | data-replay-improvements.test.mjs:25 | `.every(...)` without length check | passes on an empty lap board | add `assert.ok(board.length>0)` | low-med |
| 14 | data-hub-layout.test.mjs (whole) / import-models-workflow.test.mjs (regex tests) | pure text scans, no code under test (debugger n.a.) | brittle to formatting; "WCAG AA" never computed | compute contrast from tokens; parse YAML | med |
| 15 | real-replay-vm.test.mjs (1724 lines, 57 tests) and data-api-status.test.mjs (1024 lines, ~46) | single files mixing 4+ concerns; the first spends 201 s | slow feedback, hard to select | split by concern (frame-fit, broadcast, transport UI, audio-focus; transport/cancel/quota) | med |

## Gaps
- No real-browser IndexedDB test for save-durability (the transactional fake's ordering is assumed).
- ci-watch: `main()`/arg parsing, `annotations()` (ci-watch.mjs:347) and the `--pages` watch loop are untested (only pure `pagesVerdictRun`). session-transcript `main/parseArgs` also untested (R).
- import-models: `--max-verts`, untextured-material 0.75 grey fallback, multi-node glTF (R). data-schedule-tz: only one time zone.
- watch-transport: `eventStep` prev/next disabled state (watch-transport.js:155-156) has no test here (R). platform-session-install: `Native.isNative()` branch and overlay click (R).
- baked props: tint branch (`r.tint`) and `instTop` (tracks.js:399) unverified; only Monza built, the other 14 over-tolerance circuits are out of scope (R).
- determinism: no overtakes, weather or incident coverage in the replay-determinism digest.
- Spec failure/empty-data paths: data-lifecycle (retry/failure), telemetry-compare (empty lanes), watch-transport-layout (long event text, portrait).

## Not run / not debugger-checked
- All 46 files were run. None skipped.
- **Debugger not done:** specs data-lifecycle, season, season-format, telemetry-compare, telemetry-fit, watch-transport-layout. MCP debug-chrome was started and attached (time-trial logpoints hit), but my scripted attempt to drive the season UI path produced no `season-cal.js:467` hit and I stopped there (cause unknown, not diagnosed), so I did not report a hit for those. Reviewer breakpoint candidates are `season-cal.js:463`, `hub.js:87/257`, `telemetry.js:296/380`, `watch-transport.js:108`.
- Unit files where the CDP breakpoint could not see the code: import-models (spawned child process), data-hub-layout / ui-journey-session / import-models-workflow (no JS under test). Hit counts are capped (`≥3`) by design; "hit" proves the line ran, not that the specific assertion branch did.
- Artifacts (scratch): `artifacts/test-review/modes-1/` (cdp.mjs harness, bps.txt, cdp-out.txt, logs/).

---
_Generated by [Claude Code](https://claude.ai/code)_
