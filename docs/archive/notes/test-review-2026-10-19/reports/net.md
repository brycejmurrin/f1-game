<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT net (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261099563
- Posted: 2026-10-19T06:26:11Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT net

Batch net of #2952: 40 files (31 `tests/unit`, 9 `tests/specs`; 20,065 lines). Reviewed by me plus two read-only subagents, each given half the files and told to read every test in full and its module under test.

**Run results**
- Unit: **31/31 pass** with `node --test <file>`, 0 fail, 0 skipped. The slowest is net-lobby-lifecycle at 37 s, then net-seed-sync-vm at 34 s; everything else is 21 s or less.
- Specs: **8/9 pass.** I ran them one at a time with `node tools/ci/run-playwright.mjs --with-twinned <spec>` (`--with-twinned` is needed or VM-twinned specs get dropped locally). Logs are in `artifacts/logs/net-*.log`, each ending in a `= run passed` / `= run failed` line.
- `multiplayer-room.spec.js` failed 1 of 15 tests both in the batch run and when re-run alone (see "Not run / red"). The other 14 pass.
- Load was < 3 at every start except the room re-run, which began at loadavg 3.57 just after the batch run, so it is not a clean-box measurement.

**Debugger method (said once).** `debugger_targets` does not list node processes, so for the 31 unit files I drove the Node inspector over CDP myself.
- The script runs `node --inspect-brk --experimental-test-isolation=none --test <file>` and attaches over WebSocket.
- It sets `Debugger.setInstrumentationBreakpoint beforeScriptExecution` so `eval`/`vm` scripts (no URL) get their breakpoints before they run. It then puts a plain breakpoint on the matching source line, counts pauses, resumes, and removes a breakpoint after 300 hits.
- A first version used a `console.log` condition. It silently produced 0 hits in `vm` contexts (the sandbox has no `console`); the final pass counts pauses instead.
- `hit N` below is how many times the line in the code under test was reached (capped near 300 per line).
- `APEX_VM_POOL=0` was set so the game VM boots in-process (the pool uses a worker thread the inspector does not see).
- For the specs I used the real `debug-chrome.mjs` + js-debugger MCP once, after all spec runs. The MCP refuses `debugger_evaluate` unless paused, so I drove the page over CDP `Runtime.evaluate` with the specs' own `__apex` hooks (`lobbyFake`, `lobbyWatch`, `lobbyPeerEvent`). I did not replay each spec, so spec debugger cells say what was and was not driven.

## Per-file table
Quality: S = strong, M = mixed, W = weak, V = vacuous.

| file | purpose | run | debugger | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| blip-voice-pool | UI blips must not allocate a node per pop | pass 3, 1s | hit signal.js:106 (x18), :127 (x604); **NOT-HIT signal.js:116** (pool-exhausted steal branch) | M | fake AudioContext collapses ramps, `poolCap===8` copied, unseeded `Math.random` | strengthen: force > 8 voices |
| desktop-notices | Electron THIRD-PARTY-NOTICES lists only existing licence files | pass 4, 0s | hit notices.mjs:44, :47 (x78) | M | tmpdir created but unused (:36-41); test 3 repeats test 2's `length > 1000` | strengthen: test `writeNotices` and the missing-file throw |
| lobby-answer-flight | a second guest's answer must not start a second negotiation | pass 2, 1s | **n.a., pure source-text scan** (lobby.js:1853 not hit; the one hit at :1835 was a text match, no lobby code ran) | V | order of strings in lobby.js; :34 passes when the strings are absent | rewrite behaviourally in lifecycle via `codeRoomHarness` |
| lobby-codes | pasted/shared invite text becomes a clean code | pass 11, 0s | hit lobby-codes.js:83 (x134), :79 (x138), :148 (x24) | S | `inviteFromUrl` stubbed except in one test; :129-130 asserts `wrap.hidden === true` from a start of true; :143-148 regex on manifest.cjs | keep + 2 fixes |
| net-audio-revs-vm | net-owned rivals sound at race pitch | pass 1, 5s | hit game.js:4720, netplay.js:439 (x300 each) | S | fake session, fine | keep |
| net-authority | who may declare START/CAUTION/RESULT/QUALI/LAP/fin | pass 73 (74 outside isolation=none), 9s | hit netplay.js:702, :799, :823 (x284 each) | S (positive controls) | wall-clock sleeps (400 ms, 1100 ms); regex over `retireCar` (:992-996) | regroup (4 themes in 1590 lines) |
| net-grid-separation | all peers lay humans into the same grid slots | pass 2, 0s | hit netplay.js:423 (x2), :427, :428 (x1) | M | :102 `swaps.length > 0` is true for any swap | strengthen: two-peer layout equality |
| net-lobby-friend-quali | friend-quali lifecycle, flood cap, qgo, HUD garage button | pass 15, 6s | hit lobby.js:741 (x7), :1398 (x4), quali-net.js:123 (x8) | M | 4 regex scans of game.js/lobby.js (:84-97, :131-137, :162-167); loose bounds (`live <= 12`, `driven < 50`); HUD test misplaced | strengthen, move HUD test |
| net-lobby-lifecycle | VS FRIEND lobby state machine | pass 114, 37s | hit lobby.js:981 (x126), :1331 (x10), :1836 (x14) | S | about 10 regex tests on lobby.js text; fixed 700-1700 ms sleeps; mini DOM | strengthen: delete superseded scans, poll not sleep |
| net-nostr-sockets | room-code relay across skew, drops, stale replays | pass 10, 21s | hit nostr.js:394 (x14), :422 (x18), :457 (x6) | S/M | :150-163 pure source text and copied `HOST_TIMEOUT_MS = 120000`; source patched at runtime (:65-67) | strengthen |
| net-qr | encoder decodes with independent jsQR; NetScan prefers BarcodeDetector | pass 10, 1s | hit qr.js:289 (x12), scan.js:118, :121 (x3) | S/M | :161 `calls >= 2 && calls <= 4` from real 450 ms timing; :101-113 pins jsQR behaviour | keep, fix the timing bound |
| net-rendezvous | room-code client vs a local HTTP relay (v2 envelope crypto) | pass 37, 18s | hit rendezvous.js:93 (x300), :273 (x29), :431 (x23) | S | relay re-implements the worker; `relay({hang:true})` is dead (:75) | keep + add timeout test |
| net-roster | roster/finish/host-validation over the fake wire | pass 26, 1s | hit netplay.js:626 (x1), :63 (x143), :802 (x30) | S | :603-621 two regex-only lobby.js tests; `stubG` differs from net-authority's | strengthen: delete scans, share helper |
| net-sdp | invite codec round trip | pass 19, 0s | hit sdp.js:191, :207, :263 (x21/17/14) | S | hand-pasted SDP fixture with no provenance | keep + test `packChecked` |
| net-seed-sync-vm | host and guest build the same field | pass 2, 34s | hit lobby.js:1337, :1364 (x1-2); **NOT-HIT lobby.js:1009** (`applySettings` seed) | M | guest side hand-simulated (:101-102); test 2 runs no lobby code (:109-120); 2 full game VMs per test | strengthen |
| net-session | clock sync, routing, liveness | pass 30, 1s | hit session.js:119, :157, :237, :263 (x300 each) | S | duplicate jitter tests (:101, :123); weak `>= 1`/`<= 1` (:237-238) and OR at :592 | keep |
| net-snapshot | wire format and interpolation | pass 31, 0s | hit snapshot.js:214, :232, :310 (x300), :282 (x2) | S | loose wrap bounds (:163, :172) | keep + clamps and `clear()` |
| net-start-arming | guest-first ARMED start agreement | pass 5, 0s | hit netplay.js:1079, :1100, :1241, :1400 (x1-4); **NOT-HIT netplay.js:1355** (relay stamp) | M | :77-83 is a regex scan of netplay.js; header says 20 s ARM_WAIT, code is 45 s | strengthen |
| net-stub-surface | game.js stubs cover every call site | pass 5, 1s | **n.a., pure source scan** (NOT-HIT game.js:4106, netplay.js:1384) | M | stub parsed by `\n};` regex; no reverse check vs real API | strengthen: eval the stub |
| net-transport | transport plus handshake codec plus ICE config | pass 47, 0s | hit transport.js:555, :616, :644, :661, handshake.js:322 (x1-12) | S/M | 3 tests (:34-81) test a helper, not the product; 3 contradictory relay stories (:405-529); module-level state shared | regroup |
| net-trystero-api | pin vendored Trystero + nostr exchange | pass 12, 0s | hit nostr.js:138, :153, :183; **NOT-HIT nostr.js:288-289** (`finish`) | M (9 scans / 3 behavioural) | scans of vendor/index.html; `finish` sliced by `"};"` (:241-251) | regroup |
| netplay-resilience | rejoin reclaims the car; spectators hold no seat | pass 2, 0s | hit netplay.js:836, :1001, :1008, :1011 | S/M | :119-121 regex `MAX_GUESTS = 3`; `existsSync` makes a missing module `undefined` | strengthen |
| phone-input-improvements | phone pad FIFO, multi-touch release, ACK health, scanner teardown | pass 11, 0s | hit phone-pad.js:499, :531, scan.js:92, :183 | S (hard to read) | magic counts (24/16/25), 16-microtask settle | keep/strengthen |
| phone-pad-netplay-vm | phone controller works inside a multiplayer race | pass 5, 7s | hit input.js:336, :349, :350, netplay.js:1208 (x300), phone-pad.js:217 (x1) | S | order-dependent shared state; magic thresholds | keep |
| phone-pad | phone wire format, link, host pairing, + unrelated Input/XR | pass 66, 0s | hit phone-pad.js:217, :586, input.js:349/350; **NOT-HIT phone-pad.js:75 and :675** (`onOrient`) | S | ~10 source scans in a behaviour file; `globalThis.Input` leaks (:910) | regroup |
| phone-recorder (unit) | sampler, serializer, SHARE/COPY, caps | pass 15, 1s | hit phone-recorder.js:200, :202, :232, :234, :250 (x300), :281 (x42), :292, :293 (x4) | S | `HOWTO.length === 6`, `timers.length === 39` change detectors | keep |
| phone-touch-surface | phone tap targets, safe areas, gesture rules + Input gyro | pass 26, 0s | hit input.js:158, :279 (x22-24) for the VM Input tests only; CSS tests run no code | M | `paintedLabelPx` copied into the test (:642-689); CSS string pins | regroup |
| pick-unit-slices | CI slice picker | pass 19, 5s | hit pick-unit-slices.mjs:256, :271, :285 | S | cwd-relative paths, `p50=455s` hard-coded, "six-slice" names stale vs 9 | keep + fix |
| radio-voice | radio plan/preempt/squelch/duck/pause | pass 60, 1s | hit radio-voice.js:259, :643, :649 (x332/76/66) | S/M | :871-880 regex over engine.js/tlx.js/game.js (wrong file); literal list `ALLOWED_LONG` | strengthen |
| service-worker | sw.js install/activate/fetch caching | pass 98, 5s | hit sw.js:222, :608, :684-685, :892, :914, :933; **NOT-HIT sw.js:761** (activate handler) | S | `setTimeout(0)`/one-microtick pending proofs; fake `Cache.match` doesn't clone | keep + 3 fetch-guard tests |
| voice-pack | recorded voice packs: composer, integrity, coverage | pass 52, 9s | hit voice-pack.js:91, :104 (x28k/86k), :257 | S | :484-487 `continue` skips the `comm` row; `PACK_VOICE` copied (:482) | keep + fixes |
| multiplayer-lobby (spec) | VS FRIEND screen in a real browser | pass 15/15, 60s | lobby.js:1574, lobby-codes.js:148, :265 **not driven** | M | QR test calls `NetQr.encode` on a self-built URL (:302-321); header "UNVERIFIED IN A BROWSER" | strengthen: spy on `NetQr.draw` |
| multiplayer-npeer (spec) | rival keyed by wire id; seats; spectators | pass 5/5, 185s | netplay.js:1208 hit via my drive; :360, :423 not driven | M | :91-107 no positive control, unused `before.s` | strengthen |
| multiplayer-roles (spec) | human/local split, physics authority | pass 5/5, 112s | game.js:1346 not driven | S/M | :94-127 compares two runs without proving the car moved | keep + `speed > 0` |
| multiplayer-room (spec) | waiting-room rules | **FAIL 14/15 (twice)**, 247 s | hit lobby.js:1331 (START) and netplay.js:1100 (armStart) via my drive; lobby.js:981 not hit | S | `EV`/`HOST_RULES` copied (:36-40); weak "not on the grid" (:69-76) | keep; see finding 3 |
| multiplayer-scan-cancel (spec) | cancel/close/hidden stop the camera | pass 3/3, 31s | scan.js:92-95 not driven | M | `liveTracks` reads `srcObject`, which scan.js nulls | strengthen |
| multiplayer-scan (spec) | camera reads a QR | pass 2/2, 25s | scan.js:121/133 not driven | S (decode) / M (release) | same `liveTracks` weakness | strengthen |
| multiplayer-seats (spec) | no two humans on one car | pass 9/9, 242s | lobby.js:1038 not hit in my host drive (guest path) | M | negatives wait on already-true text (:117-126, :143-152); `not.toContainText("taken")` is lower-case vs "TAKEN" | strengthen |
| multiplayer-session (spec) | game-side authority: rivals, drop, start sync | pass 21/21, 415s | hit netplay.js:1100, :1208; netplay.js:99 not driven | S | stale "UNVERIFIED" header | keep |
| phone-recorder (spec) | RECORD to frames to SHARE | pass 1/1, 21s | phone-recorder.js:234/292 not driven in the browser (hit by the unit file) | S | needs working GL (`gl.ok`) | keep |

## Top findings (ranked)
1. **specs/multiplayer-scan-cancel.spec.js:53-57 and multiplayer-scan.spec.js:53-57** | `liveTracks()` counts `video.srcObject` tracks, and scan.js:92-95 stops the tracks and then sets `srcObject = null`, so the helper returns 0 whether or not `stop()` ran. Confirmed by reading both files. | The camera-light privacy claim in 5 tests cannot catch a leaked MediaStreamTrack. | Wrap `getUserMedia` in `addInitScript`, keep the tracks, assert `readyState === "ended"`. | high
2. **unit/lobby-answer-flight.test.mjs:21-35** | The whole file is string-order scans of lobby.js; :34 also passes when the strings are absent. No lobby code executed under the debugger. `answerInFlight` appears in no other test (grep). | The guard that stops a second guest corrupting the host's pending negotiation has no behavioural test. | Rewrite in net-lobby-lifecycle with `codeRoomHarness` (:1531), a gated `acceptAnswer` and two concurrent `onJoiner` calls. | high
3. **specs/multiplayer-room.spec.js "lights-out clears whatever screen the guest was standing on"** | Red 2/2 here: `#hud` stays hidden for the 60 s `toBeVisible` budget; the page log shows the Bahrain build taking about 55 s in SwiftShader. | A spec in the multiplayer group is red locally. I classify it **environment** (slow build), not a game bug, but I have not proven it on CI. | Wait on a build-done hook (`__apex` state) instead of a fixed 60 s, or lengthen the budget; confirm on CI's llvmpipe shard before changing anything. | med
4. **unit/blip-voice-pool.test.mjs:91-104** | The debugger shows signal.js:116 (pool-exhausted steal branch) is **never reached**; 300 pops at 16 ms need at most 7 voices under the cap of 8. | The GC-churn guard never exercises the case it exists for. | Burst more than 8 pops in one tick; assert no new nodes and that the oldest voice is reused. | high
5. **unit/net-grid-separation.test.mjs:102** | The pace-grid case asserts only `swaps.length > 0`. | A wrong layout passes; the header's "every peer sees the same slots" property is unasserted. | Run two peer views and assert identical final human slot sets in wireId order. | high
6. **unit/phone-touch-surface.test.mjs:642-689** | `paintedLabelPx` re-implements the CSS `max()` formula in the test and asserts on itself. | Vacuous coverage of the 10 px touch-label floor. | Delete it, or compute the painted size from `fitHud`. | high
7. **unit/net-seed-sync-vm.test.mjs:101-102, :109-120** | The guest half is hand-simulated (`guest.G.seed = host.G.seed`); the debugger shows lobby.js:1009 (`applySettings` seed) never runs. Test 2 runs no lobby code. | The "friends race the same field" regression is checked only on the host side. | Drive a second real lobby's `applySettings` and `beginRace`; fold test 2 into a comment. | high
8. **unit/net-start-arming.test.mjs:77-83 and header** | A regex scan stands in for ARM_WAIT behaviour; netplay.js:1355 (relay stamp) is not hit; the header says 20 s, the code uses 45 s. | Breaks on harmless refactors and misses logic changes. | Fake-clock ARM_WAIT test plus a relay-stamp assertion. | high
9. **specs/multiplayer-seats.spec.js:117-126, :143-152** | Negative cases wait for text already on screen, then assert "unchanged"; `not.toContainText("taken")` uses the wrong case. | A late wrongful seat yield passes. | Await the peer's HELLO, then assert over a time window; match case-insensitively. | med-high
10. **specs/multiplayer-lobby.spec.js:302-321** | The "QR encodes the invite LINK" test calls `NetQr.encode` on a URL the test built. `drawQr`/`drawAnswerQr` (lobby-codes.js:264-271) have no test anywhere. | The lobby's actual QR argument is unchecked. | Spy on `NetQr.draw` and assert the invite URL. | high
11. **unit/voice-pack.test.mjs:484-487** | The `comm` row `continue`s right after resetting `packCalls`, so it asserts nothing; :482 pins a copied constant. | The recorded announcer channel is never verified. | Remove the row or test it with the announcer switch enabled. | med
12. **unit/net-transport.test.mjs:34-81, :405-529** | Three tests test `tests/helpers/network-adversary.mjs`, not the transport; three contradictory relay stories share module-level `fetchedIce` (order-dependent); one embeds the literal "openrelayprojectsecret". | They pass when transport is broken, and the suite depends on test order. | Move the adversary tests to a helper test; one fresh-load ICE-config group. | med-high
13. **unit/net-trystero-api.test.mjs:31-157, :241-251** | 9 of 12 tests are source or filesystem scans; the debugger shows nostr.js:288-289 (`finish`) never runs. | Refusal, poison-frame and re-mint paths of the direct exchange are untested. | Keep the 3 behavioural tests, move deploy-layout scans to an integrity test, add OK:false and oversize-frame socket tests. | high
14. **specs/multiplayer-npeer.spec.js:91-107** | `before.s` is computed and unused; the only assertion is that `buffered` is unchanged. | Passes if `netPeerSend` silently does nothing. | Send a valid packet first, show the buffer moves, then show the unknown id does not move it. | high
15. **unit/radio-voice.test.mjs:871-880** | Regex checks on engine.js, tlx.js, game.js and setup-camera.js live inside the radio-voice file. | Wrong target: those behaviours have no test owner. | Move to their own suites and make them behavioural. | high

Also notable, not in the top 15:
- Superseded regex tests: net-roster :603-621, net-lobby-friend-quali :84-97, :162-167, and net-lobby-lifecycle :938-957, :756-760, :1071-1073, :1121-1123.
- net-session has duplicate jitter tests (:101, :123) and weak asserts at :237-238, :592; net-qr :161 is a real-clock bound that will flake on a loaded box.
- phone-pad.test.mjs :910 leaks `globalThis.Input`.
- service-worker has setTimeout(0)/microtick "still pending" proofs (:224, :425, :481, :1313-1314).
- pick-unit-slices.test.mjs is cwd-relative (:13-17, :24, :220) with stale "six-slice" names and a hard-coded `p50=455s`.
- Four specs (lobby :27, npeer :20-21, roles :22, room :31) still carry "UNVERIFIED IN A BROWSER at conversion time"; lobby, npeer and roles passed here, and room passed 14 of 15.

## Gaps (verified by the subagents with `grep -l` across tests/ unless noted)
- **Lobby:** concurrent `onJoiner` (`answerInFlight`), `drawQr`/`drawAnswerQr`, the `copy`/`handOff` UI paths, the three-player rank rule (lobby.js:1049-1069), spectators and reconnect re-resolving seats in a browser.
- **Netplay:** rejoin failure branches (`not_host`, `unknown_peer`, already seated; netplay.js:998-1001), spectator `reportResult`/`reportLap` refusal, `HOLD_MAX_MS` refusal in `armStart` (:1079), late-ARMED re-answer with the named moment, and the grid clamp `first = max(1, last - humans.length + 1)` (:427).
- **Session/snapshot/transport/sdp:** `MAX_PLAUSIBLE_RTT_MS` and NaN-offset guards (session.js:105-106), `clockMaxAgeMs` expiry, stale-ping eviction, `interp.clear()` (snapshot.js:378), the encoder clamps, `relayOnly()`/`iceTransportPolicy` (transport.js:346), `derivedRelays` failure, `NetSdp.packChecked`/`verify` (sdp.js:294-324), and `createInvite`'s `waitForIce` timeout.
- **Nostr/rendezvous:** the OK:false / CLOSED refusal path (`rejectedBy`, nostr.js:441-449), poison-frame close, `mintOffer`/`rotate`, and the rendezvous timeout path (the `hang` option is dead).
- **Phone:** `onOrient` / deviceorientation permission path (phone-pad.js:674-675, not hit in two files), the signal.js pool-exhausted steal branch, `sw.js` non-GET/blob/cross-origin guard (:895-902) and DEV_HOST exclusion, the activate handler (sw.js:761, not hit).
- **Specs:** QUICK 30 s, COPY, AUTO SOAK and reload+adopt in the phone recorder; eviction and the verification code in the browser; 3-peer host relay; the separateGrid pace-vs-quali choice in a browser.

## Not run / red / caveats
- **No file was skipped.** All 31 unit files and all 9 specs were run.
- **multiplayer-room.spec.js is red (1 of 15) twice.** First error: `expect(locator('#hud')).toBeVisible() failed ... Received: hidden`, after a 60 s step, with the log showing `buildProps done bahrain` only at 182 s of page time. Reproduced on the single re-run. I class it **environment (SwiftShader, no /dev/dri)**, not flaky and not a proven real defect; it needs a CI llvmpipe shard to decide.
- **Spec debugger coverage is partial.** I attached the real MCP debugger to a hand-driven page, not each spec's Playwright page. Hits: lobby.js:1331, netplay.js:1100 and :1208. Not hit: lobby.js:981 (guest-side settings path; I only drove the host). Not driven: scan.js, lobby-codes.js drawQr, game.js:1346, phone-recorder.js in a browser, netplay.js:99 and :360. `debugger_logpoint_read` also timed out while the game was building a race, so some reads were not retrieved.
- **Counts are capped.** Pause counts stop near 300 per line and include every script containing the line's text (eval'd or `vm` copies), so they show "reached", not exact call counts.
- **lobby-answer-flight :1835** shows one hit that came from a text match on a script, not from lobby code running; I treat that file as `n.a.`.
- **net-authority** reports 74 passes under plain `node --test` and 73 under `--experimental-test-isolation=none`. I did not chase the difference.
- Pass 1 only: no edits, commits, pushes or PR. Scratch is `artifacts/test-review/net/` (`hitsF.jsonl` has the raw debugger counts).

---
_Generated by [Claude Code](https://claude.ai/code)_
