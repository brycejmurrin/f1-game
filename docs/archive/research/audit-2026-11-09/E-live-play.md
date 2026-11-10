# Live play in a browser (sibling E)

Verbatim report as received on 2026-11-10 UTC (audit of commit e8082307). Rows that describe unpatched security or gate-bypass detail are withheld from this public repo at the owner's request.

# AUDIT live-play — the running game, commit e80823076a2413edfe4edfd68ce58b5d793b6904

Method: tree served locally, driven in headless Chromium (Playwright; SwiftShader, no GPU) at 844x390 with touch
events, then 1366x768 with keyboard. Evidence is console, exceptions, network, DOM geometry and `__apex` state, never
pixels. Probe scripts and raw outputs are in `scratch/audit/` (`p01`..`p27` `.mjs`, `*.out`, `v-*.png`). Nothing in
the repo was changed; two server logs were written to `artifacts/logs/` (gitignored) and moved to `scratch/audit/`.
Subagents did source reading only (never a browser); after the coordinator's relay they ran on Opus.

## 1. Summary

- The game as it runs is a large, mostly sturdy single-page app: title → 17 doors → picker → settings → race →
  ceremony → results all work by touch at 844x390; about 600 menu controls were tapped with zero uncaught exceptions
  and zero console errors; all 52 circuits load and drive with no NaN / Infinity in state.
- The one serious defect is on the DEFAULT renderer: three.js on WebGPU throws inside `present` a few seconds
  after every race finish (once mid-lap) and the tab reloads to the title, losing the results screen. It was found and
  fixed on Nov 4 (#4900 / #4904), then silently erased by the Nov 6 whole-tree rollback; the notes still say fixed.
- No automated browser test can see it: the shared fixture pins every spec to the hand-written WebGL2 renderer, the
  few three.js specs pin three's WebGL2 leg, and nothing races to the flag on the path players actually get.
- Persistence is well defended (bad JSON, wrong types, future versions, quota, two tabs all degrade cleanly with a
  message); two narrow holes remain (a stored `null` parts entry, an unvalidated language tag).
- Service worker: offline boot and offline race start work fully from cache; music, the engine sample, the announcer
  and some 3D kit models are not available offline until fetched once online. Update and downgrade both converge.
- Lifecycle is solid: rotate, hidden tab, context loss, resize sweep, CPU throttle, keyboard focus trap, Esc stack.
- Design-level gaps found by playing: CAUTIONS: ON does nothing unless DEBRIS is also on; a retired player gets no
  on-screen way to the results; the PRACTICE picker does not fit a phone.
- Tooling: the documented `npx serve` leaks a file descriptor per 304 and died three times during this audit.

## 2. Findings (most severe first)

ID | P | kind | file:line | claim | evidence | suggested fix | status | NEW/KNOWN

LP-01 | P0 | bug | js/render/three/tlx.js:4474-4488 (sweepCarShadowMirrors), :4396 (`a.array = null`), :6611-6617
(paint ladder), :4935-4941 (refuseTab) | On the default backend (TLX, three r187 WebGPU) the 2 s car-shadow mirror
sweep nulls uploaded vertex arrays; the next render-state change on such a geometry makes three's
`getVertexBufferLayout` read `attribute.array.BYTES_PER_ELEMENT` (no null guard); the first paint throws, both
fallback rungs (`dropTo(1, unlitMat)`, `dropTo(2, rawUnlitMat)`) throw the same way, `refuseTab()` calls
`location.reload()`. Player sees the results screen (or the race) replaced by the title with "Graphics reset —
retrying with lighter settings"; the next boot is on three WebGL2. | Repro: fresh profile, 844x390, default backend →
RACE → RED BULL RING → START RACE → finish (drive 3 laps, or `__apex.finishRace()`) → wait 20 s. Console:
`THREE.AttributeNode: Vertex attribute "color" not found on geometry.` then `[gfx] TLX: present failed — Cannot read
properties of null (reading 'BYTES_PER_ELEMENT') at getVertexBufferLayout … getRenderCacheKey … _renderObjectDirect`,
unload stack `refuseTab (tlx.js:4941) ← present (tlx.js:6617) ← render (game.js:8477)`. Reloaded in 9 of 9 unpatched
runs that watched ≥20 s after the flag (p06 at lap 1 frac ~0.7; p07, p08 ×2, p09 ×3, p11 ×2 after results). A/B with
a route-served copy of tlx.js whose only change is an early `return` in `sweepCarShadowMirrors`: 0 of 2 reloaded,
identical-body control 1 of 1 and no-route control 1 of 1 reloaded. GLX, WGX and three-WebGL2: results reached, no
reload. Career/season points are written before the reload (game.js:2991 / :3003, read by verifier), so the loss is
the results sheet, share card and podium, not progress. Limits: software WebGPU only; my phone-UA run never reached a
race (see LP-14), so exposure on a real phone is by code reading (the sweep has no mobile gate) — UNVERIFIED there. |
Re-land a700399 (`a.array = new a.array.constructor(0)`) with its unit test; add a browser spec that races to results
on the WebGPU leg; consider a null guard in the paint ladder so one bad geometry cannot reload the tab. | VERIFIED
(repro ×9, A/B, independent source check) | KNOWN-BUT-NOT-FIXED: docs/notes/PERF-CENSUS-WEBGPU-2026-11-04.md (run 11)
says "filed as #4900 and fixed by #4904 (f6aebe48)"; `git log -S"a.array = null" -- js/render/three/tlx.js` shows the
fix a700399 undone by f740619 "rollback: restore the whole tree to e2d1574b" and never re-landed.

LP-02 | P1 | drift | commits f740619, d4f869c, 88c25da (2026-11-06) | The three whole-tree rollbacks erased ~140
merges (`git log --merges e2d1574b..f740619 | wc -l` = 140). Later commits re-land some by name (c41c04e, 34f571f,
0023e71, 63475a7); #4904 was not, and its note still reads "fixed". Any doc, ledger row or changelog entry dated
Nov 2-6 that says FIXED may describe code that no longer exists. | LP-01 is the proof case. | Diff the PR list in
that window against HEAD and re-land or re-open each; mark the notes. | VERIFIED for #4904; the rest UNVERIFIED |
NEW

LP-03 | P1 | test-gap | tests/helpers/fixtures.js:132 (`localStorage.setItem("apex26.gfxBackend","webgl2")`) | Every
shared-fixture spec runs on the fallback renderer; 16 specs mention `tlxForceGL` and pin "1" (three WebGL2); the only
`"0"` is tests/specs/vr-emulated.spec.js:425, which never reaches results; no spec pins WGX. The only driven race
to the flag (tests/specs/results-flow.spec.js) is GLX and mostly `headless(true)`. So the default path has no
race-finish coverage and LP-01 passes CI. | fixture line read by me; spec map by subagent. | One always-run spec:
default backend, race to results, assert no navigation and no `apex26.gfxTlxFail`. | VERIFIED | NEW

LP-04 | P1 | design / contradiction | js/race/race-control.js:439-458, js/data/settings-defaults.js:71 (`"debris":
"0"`), js/physics/debris-world.js:246,356,1073 | RACE SETTINGS → CAUTIONS: ON cannot raise a yellow, VSC or safety
car in a dry solo race with default settings: the only hazard source is `DebrisWorld.hazards()`, which returns
nothing unless the separate DEBRIS setting is on (default off); retired or crashed cars are never hazards. | Two
races with CAUTIONS ON (one with RELIABILITY REAL): 4 AI retirements incl. 2 "accident", player damage maxed (54
hits), `__apex.caution()` stayed `{level:0,label:"GREEN",enabled:true}` for 150+ sim seconds each;
`__apex.debris()` = `{enabled:false,ready:false,loadState:0}`. Tests stub `hazards()` (race-control.test.mjs), so
nothing asserts a default-settings flag. | Make a stopped/retired car on the road a hazard, or grey the row out with
"needs DEBRIS". | VERIFIED (live ×2 + source) | NEW (the precondition is written in a skill review note, not as a
defect)

LP-05 | P2 | bug / design | js/game.js:9307 (`pm-skip-results` only inside the pause menu), js/race/race-control.js:20,51
(POST_FINISH_CAP 75 s) | After the player retires, the race keeps running for up to 75 s with the full touch driving
HUD (steer, gas, brake, boost) still on screen and no banner or button; the only exit is to open pause and find
SKIP TO RESULTS (Enter on a keyboard). | `__apex.retire()` in a 5-lap race: 30 s later state "race", controls
visible, DOM text has no RETIRED/SKIP prompt; pause → `pm-skip-results` → results "YOUR RACE · DNF". | Show a
RETIRED card with SKIP TO RESULTS while `postFinishWait()`; hide driving controls. | VERIFIED | NEW

LP-06 | P2 | bug (layout) | css/select.css:483, :514-518 (`#sel-track-section` overflow hidden), index.html:2462
(`#practice-brief`) | PRACTICE circuit picker at 844x390: the practice brief pushes the circuit map out of view
(`#sel-map-btn` rect [24,330,819,405] vs viewport 390; after picking a circuit [24,414,819,418]); nothing in
`#select` scrolls; the GOAL row is drawn over the TURNS / LENGTH stats and cut by the footer. RACE mode fits
([24,128,819,301]). | `scratch/audit/v-practice.png`; rects measured in two runs. Existing spec only checks
`toBeVisible()`. | Shorten or collapse the brief on compact height, or let the hero section scroll. | VERIFIED |
NEW

LP-07 | P2 | bug | js/garage/setup-sheet.js:599 (via :586, :1662), js/core/store.js:71,84, js/game.js:1180 | A
stored JSON `null` for `apex26.parts.<teamId>` is returned as `null` (only `undefined` falls back to the default)
and `buildSetup` throws `TypeError: Cannot read properties of null (reading 'engine')` when GARAGE opens. | Set
every `apex26.*` key to `null`, boot, tap GARAGE: uncaught pageerror with that stack; all other screens fine. |
`const p = store.get(...); return p && typeof p === "object" ? p : {}` — or make `store.get` treat `null` as
missing when the default is an object. | VERIFIED (live + source) | NEW

LP-08 | P2 | tool-gap | AGENTS.md "The loop" (`npx serve -l 3456 .`) | `serve` leaks one open file per 304 response
and exits with `EMFILE: too many open files` after ~20,000 conditional requests (ulimit 20000). | Server log: 19,972
"Returned 304" lines then EMFILE on js/circuits/vegas.js; controlled check: 50 conditional GETs of js/game.js took
the process from 32 to 82 fds, 59 of them game.js. It died three times in this session, each time surfacing in the
game as ERR_CONNECTION_REFUSED / "Module failed to load". Any agent's long local session hits this and can misread it
as a game bug. | Pin a static server without the leak, or restart-wrap it. | VERIFIED | NEW

LP-09 | P2 | bug | js/core/i18n.js:40-43, :101, :206; js/perf/loop-health.js:18,22 | The stored language is used
unvalidated: `apex26.lang` = "x" (or any malformed tag) throws `RangeError: Invalid language tag` from
`new Intl.PluralRules` inside the frame loop ("frame fault 1/8 (total 1/240)") and requests
`locales/<value>.json` (404; a 5000-char value gave a 500). One fault per boot observed, game continued. | corruption
matrix runs "str" and "longstr". | Fall back to "en" unless the tag is in the shipped locale list. | VERIFIED |
NEW

LP-10 | P2 | bug | sw.js precache pools (:857-864), range bypass :1087 | Offline after install (no race yet
played online): boot and race start work, but `assets/sfx/f1_engine.mp3` (falls back to the synth voice), all six
`assets/music/*.mp3`, `assets/voice/fable.json` and several `assets/pack/models/k_*.bin?h=` fail with ERR_FAILED, so
the first offline race has a different engine sound, no music, no announcer and missing trackside models. |
p21 on `http://apex.localhost` (secure, not a dev host): install 632 entries; second load 792/792 from the worker;
offline boot OK; offline races at Monaco, Suzuka, Mosport start; failures as listed. | Precache the engine sample
and kit models; say "music needs one online play" in the UI. | VERIFIED (behaviour); intent UNVERIFIED | partly
KNOWN (music range bypass is documented)

LP-11 | P2 | bug | js/editor/designer.js:804 and title doors generally | A double tap 120 ms apart on a title door
also hits whatever the new screen puts under the finger: SETTINGS and RACE A FRIEND open and immediately close
(the tap lands on BACK / CLOSE), SEASON opens CIRCUIT DETAIL, TRACK DESIGNER ends on the RACE picker. | p22 T. |
Ghost-click shield (ignore pointer-up for ~300 ms after a screen opens). | VERIFIED | KNOWN, still open
(docs/notes/UI-HUNT-FLOWS-2026-10-29.md row 3)

LP-12 | P2 | bug | no pushState/popstate in js/ | Browser / Android Back leaves the app from any depth:
`history.length` is unchanged after opening two screens. | p22 T. | Push a history entry per screen. | VERIFIED |
KNOWN, still open (UI-HUNT-FLOWS row 2)

LP-13 | P3 | bug (debug surface) | js/agent/apex.js:109, :2250; js/audio/stub.js | `__apex.audio()` throws
`TypeError: GameAudio.profiles is not a function` at the title (the eager audio stub has no `profiles`); the hook
reference says hooks return false/null on failure. | fresh load ×2. | `noAudio()` should also catch the stub. |
VERIFIED | NEW

LP-14 | P3 | perf / UNVERIFIED on hardware | js/game.js:3686 | On three-WebGL2 and on a phone-UA default boot in
this GPU-less box, START RACE fails with "Shader preparation timed out" and returns to RACE SETTINGS with "RADIO:
PREPARATION FAILED — please retry". Recovery UI is correct; whether a slow real phone can hit the 30 s limit is
unknown. | p09 ios, p10 first run. | — | UNVERIFIED | KNOWN (tests/data/flaky-quarantine.json hud-mirror row)

LP-15 | P3 | perf | boot | ~20 core scripts (js/core/log.js, mat4.js, tracks.js …) are each requested 4 times at
boot (page + workers), 100+ duplicate requests per load on a dev host. | p01 request counts. Cause not traced. | —
| UNVERIFIED | NEW

LP-16 | P3 | drift | docs/DEBUG-HOOKS.md vs js/agent/apex.js `carState()` | `carState()[i].best` is `Infinity`
until a lap is set (serialises to null), the only non-finite number found in any hook on any of 52 circuits. | every
scan. | Return null. | VERIFIED | NEW

LP-17 | P3 | bug (layout) | controller.html | Phone controller page at 844x390 scrolls vertically (document height
417). | p27. | — | VERIFIED once | NEW

Dropped after verification (do not re-report): pause-menu REWIND button off-screen, Settings > Advanced sliders
unreachable, "dead" steppers and livery buttons — all were controls inside closed `<details>` that my first
visibility check misread. The first A/B for LP-01 (patching `sweepGeoMirrors`) was invalid: that sweep is opt-in
and the run closed the browser before the crash window; it was redone against the right function.

## 3. Coverage

Exercised (real UI, touch, 844x390 unless noted):
- Boot: default TLX-WebGPU, three-WebGL2, GLX, WGX; fallback when three gives no answer in 15 s (seen twice:
  "bound WebGL2 instead of the default", game playable); WebGL context loss on GLX (reload + GRAPHICS RESET card).
- Title and all 17 doors; ~600 controls tapped across career, settings, saves, garage, race/TT/practice pickers,
  data hub, watch, designer, VS FRIEND, help, visual studio, photo studio (controls inside closed disclosures were
  not opened).
- Races: Monaco (street, wet → dry MIXED), Singapore (night, wet), Red Bull Ring ×many, all 52 circuits loaded and
  driven 20 s each via hook. Full 3-lap races to the flag with ceremony (cooldown, parc fermé, podium) and results;
  results → MENU → second race (no leak: penalties, damage, tyres, retirements, flags all reset); RACE AGAIN; pause /
  resume / double-tap resume / quit; weather arc dry → rain; crash and reset; red flag restart; AI and player
  retirement; tyre wear; qualifying grid screen + flying lap; season round start (quali); daily; practice start;
  time trial start; custom designer circuit time trial.
- Persistence: career start and reload; 13 corruption payloads × ~55 keys; storage full (clear "Saving unavailable"
  banner, IndexedDB mirror restores); two tabs (second tab locked out with a clear message).
- Service worker on a production-like host: install, second load, offline boot, offline race, offline data hub
  message, upgrade 1695 → 1696, downgrade back (first load shows "UPDATE READY · RELOAD TO CONTINUE", second is clean).
- Robustness: rotate mid-race (pauses, rotate card, pause menu on return), 7 viewport sizes, hidden / shown,
  bfcache events, double taps, history, Esc stack, 6× CPU throttle; desktop keyboard: tab order, focus trap (0 of 60
  tabs escaped the dialog), arrows drive, Esc pause.

Sampled only: career hub via UI (started through the hook; slot buttons tapped in the crawl, no race round played
to the hub); settings export (download verified, import not reached — it sits behind the Restore tab); VS FRIEND
(lobby screens only: WebRTC is unavailable in this browser, shown as such); controller page (bad code message
only); results SHARE CARD ("Drawing the card…", no file within 8 s) and HIGHLIGHTS (no visible change within 8 s —
could be the box); photo capture (captured, export not downloaded); data hub tabs online; time trial lap saving (my
driving policy never set a valid lap).

Not reached: pit stop by driving into the lane (the lane sits 14.5 m off the centreline behind the wall and my
policy could not enter it; `pit({arm:true})` armed but no stop was served); sprint weekend; MY TEAM; replay; music
player; garage file save/load; real WebRTC race and phone pairing; very long idle; audio state before first gesture
(the hook for it throws, LP-13); high frame rate.

Flows with no automated browser test (subagent map, spot-checked): any race on the default backend; WGX boot;
backend-init fallback (unit VM only); weather change; red flag; player DNF and SKIP TO RESULTS; touch-only race;
time-trial ghost after reload; settings / garage file round trip through the UI; general corrupted-storage boot;
offline race start; double tap and Back; controller pairing; replay / highlights; data hub failure; audio before
first gesture. Only tests/specs/smoke.spec.js runs on every PR; the rest are diff-routed.

## 4. Wanted to check and could not

- Whether LP-01 fires on real GPUs and on Bryce's iPhone: no GPU here, and the phone-UA run timed out compiling
  shaders. The failing code is plain JS in three's cache-key path, so a real desktop WebGPU browser should behave the
  same; a phone depends on whether the car-shadow pass draws at its tier.
- Real-time feel, frame pacing, audio output, haptics, low / high refresh: in-race rendering ran at about 0.3 fps
  here, so races were driven through `__apex.rollout` with rendering skipped and touch was used for menus, pause and
  results only.
- Which other fixes the Nov 6 rollbacks removed (LP-02): out of slice, and it needs the PR list.
- The exact render-state change at results that touches a freed car caster (results camera vs lamp-shadow pass):
  not pinned; the A/B makes it unnecessary for the fix.

