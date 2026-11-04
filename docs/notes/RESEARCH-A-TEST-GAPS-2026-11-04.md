# Research A — what we are not testing, and bugs nobody had looked for (2026-11-04)

Kind: research · Re-measure-by: 2027-02-04

Bryce asked (2026-11-04) for two research lanes over the whole tree. This is lane A: coverage gaps and unhunted
bugs. Lane B (a sibling session) owns perf-testing ideas and techniques; nothing of that is here. Deploy tip
`3be4c319`. Method: `prior-art-scout` seeded the do-not-re-report list (DEFECT-LEDGER, docs/BUGS.md, every
`*HUNT*-2026-11-03` note, the flaky quarantine); six `code-hunter` passes on Opus, one per slice (race/physics,
ui/input, render backends, career/data, net, tools/ci); a function-level V8 coverage merge over the node unit
groups (`NODE_V8_COVERAGE` over `tooling-fast` + `test:game-vm` + `test:state-unit`, script in the PR log);
live probes in Chromium through chrome-devtools at 844×390 touch, DPR 3, iPhone UA, Bryce's settings export
(`tests/data/settings-defaults-export.json`, 152 keys applied); `deploy-research` for the web; `finding-verifier`
on Opus over every row before it was filed. Every hunter hit its 35-turn cap, so each slice's "not covered" list
below is real: this is a first pass, not a sweep.

## Ranked findings

Rank is phone impact × confidence. CONFIRMED-LIVE = reproduced in Chromium this session; CONFIRMED = read on the
tree by the verifier with the quoted lines; NEEDS-BROWSER = the code matches but the claim needs a real device.
Effort: S < 1 h, M half a day, L more.

| # | Finding | Evidence | Why it matters on the iPhone | Proposed test / fix | Effort | Status |
|---|---|---|---|---|---|---|
| 1 | **Rotating the phone never releases a held HUD button.** `onScreenRotate` clears touch-drag steer state but never calls `holdReleaseAll()`, so GAS / BRAKE / steer arrows keep their pointer id through an `orientationchange` that arrives without a `pointerup`. The 2026-11-03 input hunt fixed this class in `controller.html` only. | `js/input/input.js:2167-2177` (handler), `:2349/:2351` (wiring); `holdReleaseAll` runs only from `reset()` via blur/hidden (`:2240/:2242`) and the zero-touch `touchend` net (`:2276`). Live: pointerdown `#btn-throttle` in portrait (race paused by the rotate blocker) → back to 844×390 → `#pm-resume` → `Input.debugState().btn.throttle` true, `holdPointers [1,0,0,0]`, `throttleLevel 1`; `physState().speed` 1.27 → 9.02 m/s in 0.7 s with no pointer down. Hidden-tab and blur DO release; bfcache fine. | Bryce steers with buttons at BUTTON SIZE 245 %. A rotation mid-race (rotation lock off, phone tilted) can resume with the throttle latched on. | One line: `holdReleaseAll(true)` in `onScreenRotate` (same choice as blur). Test: `tests/unit/input-clock-rotate.test.mjs` already has a vm rig that fires `orientationchange` (`:49`) and a wireHold case (`:132-138`), but none combined: press, rotate, assert `btn.throttle === false` and `holdPointers` all 0. | S | CONFIRMED-LIVE |
| 2 | **A vendor bump that rides with any routed edit ships on unrelated specs.** No `pick-tests` rule covers `vendor/three-*`, `vendor/rapier-*`, `vendor/three-patches/`, `vendor/gpu-capture/`, `vendor/jsqr-*` (only trystero has one); none is in select-specs `TRACKED`. pick-tests marks the diff `partial`; select-specs never reads that and answers `matched` whenever any group is set; the CI step fails closed only on `unmatched`. | `tools/ci/select-specs.mjs:1498-1501`, `tools/ci/ci-select-specs-step.sh:50`, `tools/ci/pick-tests.mjs` RULES (`:54-352`; trystero `:308`), TRACKED `:984-999`. Measured: `select-specs --files vendor/three-0.187.0/three.core.min.js,js/ui/scale.js --json` → reason `matched`, groups `[tiny, ui]`, 12 UI specs, no gfx/tlx spec. A vendor-only diff does fail closed. | A three.js or Rapier bump is exactly the change that breaks TLX on the phone or the collision sim, and it is the one change that can go green on the wrong specs. | Rules: `^vendor/three-` → gfx, `^vendor/rapier-` → collisions + game-vm, `^vendor/jsqr` → net-unit, `^vendor/gpu-capture` → hooks; and make select-specs treat any `unclaimed` path like `TRACKED` (reason `infra`) or fail closed on `partial`. Test: `tests/unit/select-specs.test.mjs` case for the mixed diff. | S | CONFIRMED |
| 3 | **A qualifying or time-trial flag leaks the ceremony flag into the next race.** Every natural flag runs `RaceCeremony.want(true); endRace()`. Only `afterClassify` reads and clears `_want`, and `endRace` returns before it for quali and TT. `resetLive()` → `_api.reset()` resets phase/age/order, never `_want`. In the next race, SKIP TO RESULTS (`skipToResults` → `endRace()`) does not disarm, so the leaked flag runs cooldown → parc fermé → podium instead of `#results`. | `js/game.js:4703` (arm), `:2927-2942` (quali/TT early returns), `:3009` (afterClassify), `:9319` (skipToResults); `js/race/ceremony.js:61-63` (only reader/clearer), `:196-205` (reset). Live: `want()` false → `tt("suzuka")` + `finishRace({ceremony:true})` → `want()` true → `race("suzuka")`, `go()` → still true. | A GP weekend with qualifying is the normal phone flow; the SKIP tap after the flag then plays a ceremony the player did not ask for. | `RaceCeremony.want(false)` in the quali/TT early returns (or in `skipToResults` before `endRace`). Test: `tests/unit/race-ceremony.test.mjs` (`want(true)`, no afterClassify, then an eligible afterClassify → expect no ceremony) and a game-vm case in `race-flow-vm.test.mjs`. | S | CONFIRMED-LIVE |
| 4 | **The ICE-restart courier always uses public Nostr relays, even on a private relay.** Nothing passes `restartCourier`; `nostrCourier()` checks only `NetNostr.available()` (`typeof WebSocket`), never `NetRendezvous.usingPrivateRelay()`; the answerer calls `listenRestart()` as soon as it connects. A privately paired phone pad holds sockets to every public relay for the session and re-listens every 300 s. | `js/net/transport.js:411`, `:669-675`, `:307/:571`; `js/net/nostr.js:47`; `js/net/rendezvous.js:15` ("a security boundary"), `:48`. | Breaks the private-relay promise; battery and cellular data on the phone; on a network that blocks public relays the restart can never work. | `nostrCourier()` returns null (or a private-relay courier) when `usingPrivateRelay()`. Test: stub `usingPrivateRelay` true, connect `rtc({role:"guest"})`, spy `NetNostr.directExchange` never called. | S | CONFIRMED |
| 5 | **The ICE restart cannot finish inside the default 5 s disconnect grace on phone-pad and lobby wires.** A Wi-Fi → cellular switch shows as `disconnected`; `beginRestart` waits `RESTART_DELAY_MS` 3000 and the disconnect timer closes at 5000; only `netplay.js` raises the grace to 25 s, in a race. About 2 s remain for digest, offer, gather (up to 4 s), a Nostr round trip and the phone's own answer. | `js/net/transport.js:374` (5000), `:408` (3000), `:580`; the only `setDisconnectGrace` caller chain is `session.js:330` ← `netplay.js:860`. | The pad never recovers in place on a network switch; it takes the full re-link with 5/15/30 s backoff, so input is dead for that long. | `PhonePad.link` and the lobby call `setDisconnectGrace(~20000)` when a courier exists, or restart delay = min(3000, grace/4). Test: `net-transport.test.mjs` `restartPair(courier)` at the default grace, drive `disconnected` (not `failed`), courier answers after 1500 ms, assert `open` at 6 s. Device evidence: force a NAT switch on the real pad and read the "ice restart recovered" vs "connection closed (disconnected 5000 ms)" lines. | M | NEEDS-BROWSER |
| 6 | **Seven unit tests return before any assertion and report PASS, not SKIP.** The worst can never run: `frame-hotpath-alloc` guards on `globalThis.gc` and no runner passes `--expose-gc`, so the "iterator GC microbench" passes in 0.2 ms in every gate. The others are environment-dependent bare returns. | `tests/unit/frame-hotpath-alloc.test.mjs:150` (`✔ … 0.21 ms`, 21 pass, 0 skipped); `agent-config.test.mjs:694`, `docs-integrity.test.mjs:517,:547`, `garage-looks.test.mjs:102` (dead guard: `buildStatic` IS exported, `js/garage/scene.js:1719`), `parts-visual-distinctness.test.mjs:166`, `perf-hot-bench.test.mjs:79`, `run-pid.test.mjs:74`. `frame-lights-shed.test.mjs:128` and `race-retain-vm.test.mjs:28` already self-enable gc with `v8.setFlagsFromString`. | A green row that never ran is the kind of evidence this repo cites. | `v8.setFlagsFromString("--expose-gc")` + `vm.runInNewContext("gc")` in frame-hotpath-alloc; `t.skip(reason)` for the rest; an `assert-audit` rule that flags a bare `return` before a test's first assertion. | S | CONFIRMED |
| 7 | **`tooling-fast --changed` adds nothing, silently, for an unclaimed path in a `partial` diff; and the phone-pad page routes to nothing.** On receipt `partial` an unclaimed path with no pin-index hit adds no tests and prints nothing (`verify-change.mjs:277` does handle `unclaimed`). `controller.html`, `overlay.html`, `bench.html`, `icons/`, `data/`, `playwright.gpu.config.js`, `tsconfig.checkjs.json`, `.githooks/` route to no group at all. | `tools/ci/tooling-fast.mjs:1146-1175` (`partial` appears only in a comment at `:559`); `node tools/ci/pick-tests.mjs --json controller.html overlay.html` → `unmatched`, groups `[]`. | `controller.html` is the phone-as-controller page Bryce pairs with; an edit to it rides any mixed diff with no test. | Route `controller.html` → steering-unit, `overlay.html` → state-unit, `icons/` → service-worker; `tooling-fast` returns `full("unclaimed")` or prints the path as not covered. Test: `tooling-fast-runner.test.mjs` case with a claimed js file plus an unpinned path. | S | CONFIRMED |
| 8 | **BUTTON SIZE shows a stale "fits N%" after a race.** `refreshBtnFit` returns early outside a race and nothing restores the plain label; the only other writer runs at boot, slider input or revert; `#pm-btnscale-v` is the single `#pmsettings` dialog the title screen also opens. | `js/ui/scale.js:167-173` (`:169` early return), `:134/:231-247` (writers), `:263-266` (observer); `index.html:1456`, `:904`; `js/game.js:8914-8935`. | At 245 % Bryce reads "fits 118 %" from the last race's dock cap on the title-screen Settings: the "245 % read as broken" confusion the suffix was added to cure. | Drop the `in-race` early return and write `btnFitLabel(…, "")` out of race. Test: `hud-feel.test.mjs` near `:1161` (loads `UiScale`): mount with `in-race`, set `--hud-z-dock: 1.18`, remove `in-race`, assert no "fits". | S | CONFIRMED |
| 9 | **Four career save-migration holes (all low, no crash).** (a) `year = finiteNumber(year)|0 \|\| 2026` wraps a huge finite year negative and nothing clamps it; every `sponsorPicks` key then fails `/^\d{4,8}:/` and the picks reset on each load. (b) `money` has no floor until `settleRound`. (c) `migrateSlots` compares `Number(c.v) > CAREER_V` (NaN never greater) instead of `SaveMigrate.careerVersion`, so `v:"abc"` is moved into a slot that `blockedSlot` reports "damaged" and the legacy key is nulled (data kept, slot stuck). (d) the dev key `career.freeMoney` matches the `careerKey` prefix, so it is refused when the career writer lock is busy (PWA + Safari tab) and mirrored into IndexedDB like a save. | `js/career/save-migrate.js:305`, `:306`, `:381`; `js/career/career.js:162-169`, `:181-182`, `:1301`, `:979`; `js/career/career-planning.js:13`; `js/core/store.js:318,:321,:405`. `node -e "3e9|0"` → -1294967296. | An imported or hand-edited backup on the phone shows a garbage year or a negative balance for good; a damaged-slot false positive blocks a slot. | Clamp year 2026..9999 and year0 ≤ year; `Math.max(0, money)`; `careerVersion(c.v)` in migrateSlots and `CareerPlanning.protect`; move `freeMoney` out of the career prefix. Test: `tests/unit/save-migrate.test.mjs` fixtures `{v:2,year:3e9}`, `{v:2,money:-500}`, legacy `{v:"abc"}`. | S | CONFIRMED |
| 10 | **The unit suite is not runnable under `NODE_V8_COVERAGE`.** Two files go red only with the env set: `garage-camera-rigs` and `garage-entrance-motion`. Minimal repro: evaluate `arrival.js` in a vm context, call `rigData("crane")` (null, `GarageData` not yet defined), evaluate `garage-data.js`, call again → data without the env, null with it. The closure's `typeof GarageData` lookup stays cached under coverage. | `tests/unit/garage-camera-rigs.test.mjs:20-24`; `js/garage/arrival.js:486-489`; repro script in the PR. `tooling-fast` under coverage: 2 FAIL of 751, both green without the env. | Function-level coverage is the cheapest way to find the gaps in §Coverage below; today it cannot gate. | In the tests, load `garage-data.js` before `arrival.js` (the production order is lazy, so keep one "before the data lands" case that reads through a fresh accessor); or make `rigData` read `globalThis.GarageData`. Then a weekly coverage job can publish per-function misses. | S | CONFIRMED |
| 11 | **The phone-pad wire and the session heartbeat are not fuzzed.** `fuzz-untrusted-inputs.test.mjs` covers GhostShare, lobby codes, SDP, QR, snapshots, settings, migrate, store, track codec, real-race; not `PhonePadCodec.decodeSample/decodeEvent/hudOf/pairingFromUrl`, `NetSession.onStateBytes` PING/PONG, `clampWire`, `armStart`, `validClassification`, `applyStrategy`. | `tests/unit/fuzz-untrusted-inputs.test.mjs` (13 tests, grep for those names: none); `js/input/phone-pad-codec.js:32,:58,:74,:121`; `js/net/session.js:142-174`; `js/net/netplay.js:62,:142,:952`; `js/net/strategy-wire.js`. | The pad wire is the one a stranger's phone can reach through a room code. | Add the six decoders to the N=2000 harness with the same "never throws, never NaN" contract. | S | CONFIRMED |
| 12 | **A suspended tab can time out a healthy peer on resume.** Pause forgiveness is skipped whenever `document.hidden` is true at pump time; if the first timer pump after an iOS resume runs before the `visibilitychange` that clears `hidden`, the whole gap counts as peer silence and the session closes with "timeout" (6 s lobby, 25 s race). | `js/net/session.js:254-256`, `:281`, `:287`. | An iPhone guest coming back from another app after 25 s is dropped although the host kept sending. | Forgive any gap over 2 s even while hidden. Test: `document.hidden = true`, pump at t=0 then t=30000 with no messages, assert `alive()`. Device evidence: suspend a real session > 6 s and read the close reason. | S | NEEDS-BROWSER |

Refuted this round (do not re-file): `js/render/webgpu/wgx-chunked.js:60` `makeRoadLUT` outside the try: `device.createBuffer`
without `mappedAtCreation` does not throw on OOM or a lost device (error scopes), the "#3569 never throws" rule
does not exist in that form, and the call is a lazy build on the frame path, not inside `render()`.

Leads, not findings: `window` `error` "ResizeObserver loop completed with undelivered notifications" fires once or
twice per race entry at 844×390 with Bryce's settings (intermittent; observers are created before a wrapper can
attribute them; no test asserts zero window errors across a race cycle). `js/ui/css-zoom.js:37` returns 1 when
`currentCSSZoom` is missing (pre-26.4 WebKit only; not Bryce's build). `js/ui/screen-looks.js:410` dead ternary.

## Coverage map

**Routing (what runs for an edit).** 22 of 613 `js/` files have no topical browser group: `js/xr/*` (steering-unit
only; `test:xr` is opt-in by design), `js/track/build-client.js` (462 lines) and `build-worker.js` (sweeps only),
`js/overlay/*` and `js/share/*` (state-unit only), `js/workers/*` (tooling only). `sw.js` and `manifest.json` route to
the node service-worker group only: there is still no browser test that a second visit is served from cache or that
the game boots offline (known gap, PERFTEST-HUNT-2026-10-24). `js/roster.js` and `js/track/circuit-meta.js` are the
ratcheted blanket-only pair. Source-quote pins: 314 unit files make 4261 source-match assertions; 52 files are
pin-only (636 asserts); `gfx-backend-canary` alone has 715 (#1682 owns this). 69 `waitForTimeout` calls remain
across 22 specs (ratchet 75): ui-button-touch 10, menu-survey 10, gamepad 6, season 6.

**Node function coverage (what the unit groups execute).** Merged V8 coverage over `tooling-fast` + `game-vm` +
`state-unit` (3 374 processes, 609 `js/` files seen; merge script `covmerge.mjs` in the PR log, output
`cov-final.json`). Browser specs cover more, so a zero here is "no node test reaches it", which is the
cheap-to-fix kind. `js/game.js` reaches 68 % (633/937 functions; `redFlagRestart` IS run by the red-flag vm
tests) and `js/career/career.js` 79 % (423/533), so the headline gaps are narrower than the hunters' greps
suggested. Largest never-run functions, by bytes, excluding circuit scenery (browser foundation specs own those):

| File | fn hit | Never executed by a node test (line, bytes) |
|---|---|---|
| `js/net/lobby.js` | 101/292 (35 %) | `onConnected@560` (13 k), `codeHost@1692` (11.7 k), `newTransport@227` (6.6 k) |
| `js/net/netplay.js` | 50/99 (51 %) | `create@163` (71 k, the whole module body), `clampWire@62` (1.3 k, row 11) |
| `js/net/transport.js` | 18/31 (58 %) | `rtc@151` (25.7 k, the WebRTC path; `loopback@43` is what tests use) |
| `js/input/phone-pad-page.js` | 2/6 (33 %) | `pad@78` (32.7 k, the controller page) |
| `js/audio/engine.js` | 181/540 (34 %) | `radioMediaClip@1586` (7.3 k), `radioVoice@1487` (4.7 k), `playIndex@803` (4.7 k) |
| `js/input/input.js` | 240/509 (47 %) | `onKey@991` (9.3 k), `reset@2396` (2.3 k: the blur/hidden release path, row 1), `debugStateNow@2492` |
| `js/ui/settings-export.js` | 52/151 (34 %) | `create@978` (20.9 k, the LOAD/SAVE UI), `garageValue@688` (4.1 k), `applySettings@561` (2.6 k) |
| `js/ui/results-sheet.js` | 86/130 (66 %) | `buildResults@250` (21 k), `buildTTResults@570` (12 k), `buildStandings@794` (4.2 k) |
| `js/career/career-ui.js` | 94/201 (47 %) | `buildSetupPanesNow@801` (8.9 k), `buildOffers@1402` (7 k) |
| `js/career/career.js` | 423/533 (79 %) | `rollover@1720` (9.2 k), `acceptOffer@1659` (2.2 k), `offerPreview@1635` (2.1 k) |
| `js/game.js` | 633/937 (68 %) | `raceIntroFromSheet@3984` (2.6 k), `introWarm@3919` (2 k), `introPrepare@3806` (1.6 k) |
| `js/perf/metrics-overlay.js` | 67/163 (41 %) | `snapshot@190` (10.8 k), `paintOverlay@563` (7.1 k) |
| `js/track/core/mesh.js` | 77/110 (70 %) | `buildTerrainSteps@919` (14 k), `buildRoad@685` (13 k), `buildKerbs@345` (9.7 k) |
| `js/agent/apex.js` | 194/458 (42 %) | `diag@2385` (7 k), `reset@2071` (5.9 k), `obs@1722` (4.6 k) — the agent surface itself |
| `js/render/three/tlx.js` | 20/35 | `create@205` (432 k: the whole backend is browser-only, as designed) |

The season rollover (`career.js:1720`), the lobby's connected-peer path and the real WebRTC transport are the
three biggest behaviours no node test executes; each has a browser spec in `test:modes` / `test:net`, which is
why they only run on a routed PR.

Hunter coverage gaps with no test reference at all (grep of `tests/`): `js/race/jump-start-penalty.js:64`
`reactWindowOpen` and a rolling start against `tickReaction`; `js/race/reliability.js:117` `Reliability.plan`;
`js/game.js:1622` `redFlagRestart` with damage or a first-start fine; `js/ui/settings-export.js:570-574` the legacy
`appearance.motion` → `a11y.motion` import migration (Bryce's own export carries `appearance.motion`) and
`:593-599` the `failed` branch when storage refuses; `js/ui/platform-session.js:327/:353` hidden-tab pause during
the countdown; `js/career/career-backup.js:960-977` a conflict on slot 2 after slot 1 was written (no rollback);
`js/core/store.js:368-380` `setRoomy` when the second `setItem` still throws; `js/render/three/tlx.js:1135-1141`
the hidden-loss `onVisible` listener is not on `_createUndo`; `tlx.js:1112-1118` a device loss while `compileAsync`
is in flight; `js/net/interp.js:233` `presentedAt` never re-anchors after a clock step back; `phone-pad-page.js:464`
`pagehide` → `cancel()` so a bfcache-restored pad never redials.

## Live probe log (Chromium, 844×390 touch, DPR 3, iPhone UA, Bryce's settings; TLX `three` backend on the soft raster)

Clean: boot console (two a11y form-field issues, the known TLX-on-a-phone geometry warning); hidden tab during the
countdown pauses with `why=hidden-tab` and stays paused until RESUME (by design); `localStorage.setItem` forced to
throw `QuotaExceededError` through a race finish + MENU: one throw, the `[game] localStorage write lastSession
failed` warning, results and menu intact, the save-health banner (RETRY SAVE / EXPORT RECOVERY / DISMISS) on the
title; three race → results → menu cycles: 0 live intervals, no net window/document listener growth, heap
133 → 138 → 137 → 138 MB; triple tap on RACE within 60 ms: one setup screen, no error; `lifecycle({bfcache:true})`
mid-race: pagehide/pageshow/persistedShow counted, state kept, holds released; hidden tab mid-race releases holds.
Not clean: rows 1 and 3 above.

## Web research (deploy-research, 2026-11-04)

WebKit: 302711 (WebGPU crash on iOS 26, Metal vertex-buffer validation memory growth) fixed 2025-12-04; 301627
(WebGPU canvas flicker) fixed in Safari 26.4; imgui #9103 reports "device lost (destroyed)" on the second render
pass on Safari 26.1 with no WebKit resolution found. No open WebKit bug matched "device lost on backgrounding";
the TLX handler (`tlx.js:1108-1213`) already treats a loss within 3 s of return as the iOS background loss. ITP
deletes script-writable storage after 7 days without interaction in Safari (Home Screen web apps exempt): a
non-installed Safari player can lose localStorage saves; nothing in the game warns about it. three.js: r187 is
current (30 Oct); r188 not released as of today. Techniques we do not use: fast-check property and model-based
tests (a natural fit for `TrackCodec`, `NetSnapshot`, `SaveMigrate` round-trips and the lobby state machine);
Playwright `Clock` for rAF/visibility timing; `QuotaExceededError` injection (done by hand above, worth a helper).

## Not covered this round (next hunt)

Each hunter stopped at its turn cap. Unread: `js/ui/hud.js`, `hud-layout.js`, `select-screen.js`,
`results-sheet.js`, `menu-nav.js`, most of `input.js`, all of `css/` and `index.html` (the ≥ 44 px touch-target
check at 245 % was not done); `pit-lane.js` (quit during a pit stop, DNF in the pit lane), `ai-drive.js`,
`collide.js`, `tyre-model.js`, `incident-sim.js`, `real-replay.js` (pause during replay), `js/car/*`,
`race-control.js` past line 260 (red flag during formation, last-lap safety car); `glx/*`, `tlx-post/shadow`,
`wgsl-*`, `lighting/*`, `renderer-boot.js`; `js/net/lobby.js` (2339 lines: host leaves mid-countdown, duplicate
hello), `netplay.js` 680-880 and 1280-1380, `quali-wire`, `strategy-wire`, `spectate`; the rest of `career.js`,
`career-planning.js`, `custom-team.js`, `js/garage/*` persistence, `js/share/*`, `js/audio/*` lifecycle; the rest
of `select-specs.mjs`, `node-plan.mjs`, `pick-unit-slices.mjs`, the `tests/helpers/` bodies, and a groups.json
membership audit (is every unit file in some group?).

## Issues filed

All `ready` plus an `area:*`; PR #4765 carries this note.

| Row | Issue |
|---|---|
| 1 | #4767 input: rotating the phone never releases a held HUD button |
| 2, 7 | #4768 ci: a vendor bump in a mixed diff is routed to no spec |
| 3 | #4769 race: a quali/TT flag leaks `RaceCeremony.want` into the next race |
| 4 (+5 as needs-browser) | #4770 net: the ICE-restart courier ignores the private relay |
| 6 | #4771 tests: seven unit tests return before any assertion |
| 8 | #4772 ui: BUTTON SIZE keeps a stale "fits N%" after a race |
| 9 | #4773 career: four save-migration holes |
| 10 | #4774 tests: the unit suite is not runnable under `NODE_V8_COVERAGE` |
| 11 | #4775 net: fuzz the phone-pad wire and the session heartbeat |

Not filed: row 12 (session.js hidden forgiveness, NEEDS-BROWSER: a real-iPhone suspend/resume reading comes first)
and the refuted WGX row.
