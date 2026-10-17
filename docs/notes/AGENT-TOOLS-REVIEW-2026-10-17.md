# Agent tools review — 2026-10-17

Reviewer session: orchestrator-launched, Sonnet. Every tool below was run live on this box (SwiftShader, no `/dev/dri`, one browser at a time,
loadavg held under 3 for browser runs) against `npx serve -l 3456 .` on the deploy tip `a5549a09`. Wall times are the tool's own `durationMs` or the
job's `elapsedMs`. Verdicts: WORKS / BUG / DOC-GAP / SLOW.

Fix PRs (draft, base the deploy branch): [profile-wait-ms](#fixes) · [debug-chrome-help](#fixes) · [ui-inspector T11](#fixes).
Issues: #2672 (reply size), #2673 (timing claims), #2674 (A/B comparability, inspector text, docs).

## 1. apex-tools MCP

| tool | what I ran | result | evidence | fix |
|---|---|---|---|---|
| apex_status | no args | WORKS | `{"ok":true,"lock":{"held":false},…,"next":{"action":"ready"…}}`; the `knownGap` block lists the browsers outside the lock | — |
| apex_doctor | no args | DOC-GAP | `ok:true` but the reply is 54.5 KB, every row `pass` | #2672 |
| apex_catalog | no args | WORKS | 52 tracks, 5 cams, 16 HUD devices, 12 UI viewports; the `hint` explains the two viewport families | — |
| apex_pick_tests | `files:["tools/ui/explorer.mjs"]` | WORKS | `groups:["tooling-fast"]`, 1.4 s | — |
| apex_select_specs | `since:HEAD~3` | DOC-GAP | correct (`test:tiny`, `test:ui`) but 5 KB: every spec appears in `selected` and again in `shards[].specs` | #2672 |
| apex_session_status | no args | WORKS | on a detached HEAD it reports `branch:"HEAD"`, `sessions:[]`, empty `commits`; accurate, nothing misleading | — |
| apex_who_is_on_it | `noFetch:true` | WORKS | lists the live deploy-branch push and no claims, 1.4 s | — |
| apex_ci_status | HEAD | WORKS | `exit:124`, `verdict:"running"`, `(0 jobs …)` for a push whose only run is Pages: 124 is the documented "still running" code but reads as a failure to a new agent | — |
| apex_bump_cache_check | no args | WORKS | `consistent:true, tagCount:362, shellBuild:1695 == versionJson` | — |
| apex_rotate_markings_check | no args | WORKS | `wouldChange:17`, 5.6 s; the reply never says that 17 is the normal answer (a new reader may take it for a red) | — |
| apex_unit_test | `docs-integrity.test.mjs` | DOC-GAP | pass, 4 s, but `stdout` is the full TAP (37 tests, 9 KB) and `out` is null | #2672 |
| apex_track_audit | monza | WORKS | `OK monza: props 330452 verts…`, `floating:[]`, 4 s | — |
| apex_frame_report | monza, 3 frames | WORKS | boot 5.4 s, analysis 2.4 s, ASCII thumbs render; 8.3 s | — |
| apex_graph_parity | `id:monza, base:HEAD` | WORKS | `parity exact (max |Δpos| 0.0e+0 m)`, 17 s | — |
| apex_car_audit | `check:ladder` | WORKS | 0.3 s; the two `dead` tyres are the wet compounds (cost 0), a reader needs the skill to know that is expected | — |
| apex_eval | `a.info()` on monza, VM and browser | WORKS / SLOW | VM route 5.2 s; browser route 54.7 s (boot dominates). Note `state` differs between routes (`race` in the VM, `count` in the browser) | — |
| apex_shot | monza, orbit, frac 0.3 | WORKS | png written, `classification:"scene-content"`, `renderer.actual:"three"`, 43.8 s | — |
| apex_ui_shot | title @ ios-iphone-landscape-844 | WORKS | thumbnail + DOM JSON, 9.4 s | — |
| apex_ui_fit | customize @ ios-iphone-landscape-844 | WORKS | all counters 0, `clean:true`, 8.4 s | — |
| apex_track | open / shot / eval / close (monza) | WORKS | open 17 s boot + 11 s build, shot 19 s, eval and close instant; the lock frees on close (`lockFree:true`) | — |
| apex_shot_survey | monza quick, sync; then `reports[]` | WORKS | 4 shots, panel + index.html + findings.json; `reports[]` builds a gallery with no browser (`browser:false`) | — |
| apex_agent | `help`; `world` brief on monza | SLOW | `help` 3.8 s; `world` 103.7 s (cold boot every call). The `world` reply shows `ego.onTrack:false`, lateral 8.2 m, P22 at 1.5 s: it is the pre-race state, not a bug, but the brief says "OFF TRACK" | #2673 |
| apex_garage | open ferrari / shot rearWing / close | WORKS | open 6.4 s, shot 40.8 s (settle 11 s, capture 29 s) | — |
| apex_profile | monza spans, repeat 3, 30 frames | WORKS / SLOW | 272 s; `raf` p50 1327 ms: SwiftShader. The job's `.log` is empty and progress is in `.err`; `apex_job_status` merges both so it reads fine | — |
| apex_profile_query | the spans JSON; same file as base and head | WORKS | table and A/B delta; every row `noise`, `raf` `info` | — |
| apex_job_start | `shot_survey` while `hud_mock` ran | WORKS | refused: `lock_held … live pid 162 (apex_job:hud_mock)`, with a fix line | — |
| apex_job_status | list; `wait:100`; `wait:240` | DOC-GAP | the schema says wait ≤ 300 s but the host backgrounded the `wait:240` call at 120 s. A finished job's reply carries the result twice (`tail` and `out`) | #2672, #2673 |
| apex_job_cancel | `hud_shot` 2 s in | WORKS | `state:cancelled, exit:SIGTERM, survivors:0` | — |
| apex_hud_mock | 1 device, chase, shipped | WORKS | 39 s, 0 overlaps, sheet.jpg; `estimateMs` said 600 000 | #2673 |
| apex_hud_shot | phone-landscape-844x390 | WORKS | 57 s, 0 findings; `estimateMs` 420 000 | #2673 |
| apex_hud_survey | quick, `only:["phone-landscape-844x390"]`, then `only:["phoneL-chase"]` | WORKS / DOC-GAP | first call fails with "no cells match --only … (ids: chase-default, … phoneL-chase …)": clear message, but the natural input (a device) is the wrong key. Second call 47 s; `estimateMs` 1 080 000 | #2673 |
| apex_verify_change_fast | `since` the deploy tip | WORKS / DOC-GAP | job done in 140 s (tooling-fast 139 s), `verdict:"partial"`, exit 2 because the browser `audit` batch is `notRun`: correct, but the description says ~10 min | #2673 |

Missing from `docs/AGENT-SURFACE.md`: none of the 31 tool names (`grep apex_<tool>` hits for all). The three.js Inspector and `?inspector=1` are absent; profile.mjs's hitch/trace modes are not described (#2674).

## 2. The apex profiler

| tool | what I ran | result | evidence | fix |
|---|---|---|---|---|
| profile.mjs spans, `--repeat 3` | monza, 30 frames | WORKS | 272 s; `physics` p50 7.2 ± 1.2, `ai` 1.0 ± 0.1; `render` p95 1349 ms is the SwiftShader raster wait, as the header warns | — |
| query.mjs, same file twice | `apex_profile_query file+compare` | WORKS | all `noise` (delta 0 inside spread), `raf` `info` | — |
| `--base HEAD~20` A/B | repeat 3, 10 frames | DOC-GAP | `frame p50 1308.3 → 54.2 (-95.86 %)` verdict `noise`; the base ref predates the `apex26.wgxCapture` key, so its arm paid a per-frame readback the head skipped | #2674 |
| `APEX_PROFILE_WAIT_MS` (#2636) | read the code, unit test | BUG | only `profile-gameloop.mjs` (cpu mode) honours it; `profile.mjs` (spans, hitch, trace) has four literal 30 s waits and ignored it | draft PR `cursor/profile-wait-ms-spans-7c1d` (b640b274) |

## 3. js-debugger MCP

| tool | what I ran | result | evidence | fix |
|---|---|---|---|---|
| `js-debugger-smoke.mjs` | whole suite | WORKS | `passed: 40`, exit 0 | — |
| debugger_targets / attach / state / detach | live against `debug-chrome start` on :9222 | WORKS | `connected:true`, `detached:true, cleanupErrors:[]`; `targets` and `attach` each reject a missing argument with a message naming it | — |
| debugger_run, logpoint, logpoint_read | `__apex.inspector()` expression; a logpoint on title-fx.js:100 | WORKS | run returns `status:"pending"`, `debugger_state` carries the late result; logpoint placed (`lp1`), 0 hits (that line is not hot) | — |
| debugger_evaluate unpaused | no pause | DOC-GAP | `Missing argument: pauseToken` — it is a paused-frame tool; `debugger_run` is the unpaused one, the error does not say so | — |
| debugger_scripts, no filter | no args | DOC-GAP | 200 of 334 rows, 15 KB | #2672 |
| `debug-chrome.mjs start --help` | CLI | BUG | `--help` after `start` was ignored and a browser launched | draft PR `cursor/debug-chrome-help-flag-4a9e` (c8c14094) |

## 4. three.js Inspector (#2576)

| check | result | evidence |
|---|---|---|
| off by default under the harness | WORKS | `inspector()` → `{on:false, supported:false, reason:"off"}`; 1 inspector-named request (the 3 KB `perf/three-inspector.js` shell script), none under `addons/inspector/`; `localStorage` key unset; no page errors |
| `?inspector=1` | WORKS | with `apex26.gfxBackend=three` pinned: `{on:true, supported:true}`, `apex26.inspector=1`, panel element in the DOM, 19 inspector requests, no page errors |
| `?inspector=1`, backend not pinned | DOC-GAP | `reason:"TLX only (this backend has no three.js renderer)"` (#2674) |
| per-pass draw/program stats | not read | the panel draws them in its own DOM; no `__apex` hook returns them, so I could not read them as numbers. #2631 reads them with a probe script |
| docs | DOC-GAP | docs/DEBUG-HOOKS.md says default ON on localhost unless `navigator.webdriver` (the harness); the task brief says off by default — both hold, depending on the browser. The docs/AGENT-SURFACE.md row is missing (#2674) |

## 5. UI inspector (`tools/ui/explorer.mjs inspect`)

| check | result | evidence |
|---|---|---|
| exit 75 on a busy box | WORKS | at loadavg 3.35: `Browser deferred: load average is >=3…`, exit 75 |
| exit 2 on a bad flag | WORKS | `unknown flag --bogus — did you mean --boot?`, exit 2 |
| `--touch --boot --safe --summary`, 4 viewports | WORKS | `customize<TAB>clean`, exit 0 |
| T11, a control partly under a sibling overlay at a scroller edge | BUG, reproduced and fixed | `inspect --screen customize --viewports 600x300 --summary` → `blocked #cz-driver NAME is intercepted by #customize > div:nth-of-type(1) > div:nth-of-type(3)` and the same for CODE. NAME/CODE sit at y 240.2–280.2; `#cz-body` ends at 241.3, so 1 px of the 40 px control is visible and its centre hit-tests to the footer past the edge. Scrolling reveals them: they are not blocked. With the fix the same command prints `clean` | draft PR `cursor/ui-inspector-partly-covered-2f8b` (1e25b04f) |

## 6. HTML tools

| tool | what I ran | result | evidence |
|---|---|---|---|
| gallery build | `apex_shot_survey reports:["…/monza-survey/findings.json"]` | WORKS | `browser:false`; `artifacts/review/gallery-monza/index.html` plus `assets/*.png` |
| gallery in Chromium | chrome-devtools MCP, `file://` | WORKS | 0 console messages; 5 requests, all `file://` 200; 4 of 4 images loaded (`naturalWidth>0`); 0 `http(s)` URLs; 0 `<script>` elements; 2.1 KB of HTML: works offline |
| report server | `report-server.mjs --port 3466 --host 127.0.0.1` | WORKS | `/` without the token → 403; tokenised URL → 200 and sets the cookie; `apex-report.js` via cookie → 200; POST a JSON body → `{"ok":true,"saved":"artifacts/reports/apex-report-….json"}`; the POST accepts any JSON, it does not check that the body is a bundle |
| #2612 (unmerged) | not reviewed | — |

## Fixes

1. `cursor/profile-wait-ms-spans-7c1d` — `profile.mjs` shares one `WAIT_MS` (floor 30 s, env `APEX_PROFILE_WAIT_MS`); test fails before (0 pass / 1 fail), passes after.
2. `cursor/debug-chrome-help-flag-4a9e` — `start --help` prints usage; test fails before, passes after (the before-run launched Chromium, which I stopped).
3. `cursor/ui-inspector-partly-covered-2f8b` — a control mostly outside its scroller's visible rect reads `needs-scroll`, not `blocked`; test fails before, passes after; live repro clears.

## Top 10, ranked by agent time wasted or wrong answers

1. Replies that burn context: `apex_doctor` 54 KB, `apex_unit_test` full TAP, `apex_job_status` result twice, `debugger_scripts` 200 rows (#2672).
2. `apex_agent world` costs 104 s per call because it boots a browser each time (#2673).
3. `estimateMs` is 7–25x the real time, so an agent picks async for a 40 s job (#2673).
4. `profile.mjs --base` across refs with different capture defaults prints `noise` for a -96 % delta (#2674).
5. `APEX_PROFILE_WAIT_MS` was ignored by the default profiler mode (fix PR).
6. UI inspector `blocked` false positive at a scroller edge (fix PR).
7. `debug-chrome.mjs start --help` launched a browser (fix PR).
8. `apex_job_status wait` documented to 300 s, host cuts at ~120 s (#2673).
9. The three.js Inspector has no AGENT-SURFACE row, and its "TLX only" reason is wrong when the backend is simply not yet pinned (#2674).
10. `debugger_evaluate` without a pause says "Missing argument: pauseToken" and does not point at `debugger_run`.
