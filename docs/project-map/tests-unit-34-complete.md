# Unit batch 34 — complete source map

Read-only mapping at `8a222466bc83de7cdbe6a42989f19f7824ce4c06` (2026-10-27 UTC). All 12 assigned files / 4,768 lines were read, including comments, setup, fixtures and teardown. No tests, browser, network probes or source edits were performed. Case names below state the behavior; the last column identifies the evidence mode and practical limit rather than dumping predicates.

## Production and fixture navigation

Used repository `code-nav` shell LSP fallback (`bash tools/mcp/lsp-mcp.sh outline … --concise --limit=100` and bounded `def … --body`) and targeted source reads. File-local method queries require the method column; three initial column-1 lookups returned no definition, corrected at column 5. Outline pagination on the large LightPresets object was explicit and is not a full-table read claim. Nostr readRelayFrame resolved by module-file fallback: export/caller coverage was unverified by that query.

| Key | Concrete production/fixture targets |
|---|---|
| S | `js/net/session.js`: NetSession.create 49, autoPong 364–377; PING/PONG 5. |
| I | `js/net/snapshot.js`: encodeSnapshot 80, encodeAged 101, decodeSnapshot 135–152, toView 154, createInterp 192; constants 5–24. |
| T | `js/net/transport.js`: loopback 43, prefetchIce 220, iceServers 387, hasRelay 409, rtc 416–909, STUN 150. |
| P | `js/net/netplay.js`: NetPlay.create 302–1478; start 886–1028, armStart 1082–1098, hostStart 1114–1118, reportResult 1164–1166, tick 1226–1412, ownership predicates 1420–1421 (arming, relay, result and spectators); `js/net/spectate.js`; `js/net/lobby.js` guest cap. |
| H | `js/net/handshake.js`: normaliseSdp 65, encodeCode 70, peekCode 99, decodeCode 112, waitForIce 139, metaBuild 174, localBuild 184, checkBuild 211, offerId 260, acceptInvite 289, acceptAnswer 307, fragment helpers 335–365. |
| G | `js/game.js`: inert netPlay 4186–4197, netLobby 4198–4207, netOrder 2852–2901. Recursive runtime-member census is text-based. |
| N | `js/net/nostr.js`: load 32, relayUrls 137, readRelayFrame 153–159, createBoundedInbox 161, directExchange 225, exchange 531; vendor nostr/index.js and core/utils.js API/package pins. |
| W | `vendor/trystero-0.25.4/core/action-wire.js`: createActionWireManager 52 onward; receive bounds 19–24. |
| A | `js/agent/apex.js`: ApexApi.create 5; obs 1702–1810, aiPlace 1916–1938, setEnergy 1988–1992, setLap 1994–1998, trackProfile 2029–2046. `js/agent/apex-lobby.js`: sectorState 11, lapHistory 21, timing 32–54, fieldState 55 onward. `js/agent/apex-track.js`: wallStats 48, modelDiagnostics 78, geometryDiagnostics 82, groundY 108. Actual circuit definitions/scenery supply sampled data. |
| L | `js/lighting/presets.js`: window.LightPresets table, per-track night/dry entries (real VM evaluation). |
| C | `tools/ci/nightly-group.mjs`: EXCLUDED, ROTATION, UNSCHEDULED, bare, dayIndex, groupForDay and CLI; `tests/groups.json`, `package.json`, `.github/workflows/*`, deploy/tooling-fast/verify-change/pick-tests sources. |
| Q | JS tree logging calls; `js/core/log.js` production sink; local test scanner is the implementation under direct fixture test. |
| V | `tools/lib/node-compile-cache.cjs`: augmentNodeCompileCache 7–12; `tools/lib/vm-script-cache.cjs`: cacheDir 13–17, runScriptCached 24–57 (atomic-v1 key, temporary write, rename, cleanup). |
| D | Shared real math/codec islands: `js/core/mat4.js` (M4 clamp/wrap), `js/net/bytes.js` (base64/byte conversion), `js/net/sdp.js` (packed SDP), `js/core/hash32.js` (offer identity). Handshake textarea ceilings are checked in `index.html`; Nostr importmaps in `index.html` and `controller.html`, lazy roster in `tools/manifest.cjs`; package guards inspect `.nojekyll` and vendor licenses. `tests/helpers/abs-src.mjs` supplies diagnostic VM filenames, not a fake production module. |
| F | `tests/helpers/network-adversary.mjs` is test infrastructure, not a production fetch client. Other fixtures: seed-log.mjs loads real Log; game-source.mjs/symbolSource extracts one declaration from game/module union; game-vm.cjs supplies stubbed browser/render environment. |

Fake `/telemetry?lap=1`, `/telemetry?lap=2`, `/retry`, `/slow` paths and example TURN/HTTPS/WebSocket domains are injected identifiers; tests do not require deployed endpoints or tracked files there. the synthetic cache-fixture filename, `/tmp/cov`, `test:no-such-group`, generated temporary cache paths and synthetic SDP IPs are deliberately fake inputs. The pinned vendor files, importmaps, licenses and `.nojekyll` are real repository dependencies.

## Full-read ledger

Each test slice returned individually with at most 100 lines and less than 10,000 characters. Session slices were 90 lines; other initial slices 100. An aggregate output cap obscured the initial snapshot tail, so 301–545 was explicitly re-read in 80-line slices. SHA-256 below fixes the exact content mapped.

| File | Fully read line range | SHA-256 | Cases (expanded) |
|---|---|---|---|
| `tests/unit/net-session.test.mjs` | 1–744 | `7cbef637faf0921b949809d1e4cf7113ecda2c24cf5aa6f96b8e36840dbb4652` | 32 |
| `tests/unit/net-snapshot.test.mjs` | 1–545 | `0e9742b7c3f34284326a44e134261727f12895c7808ea2c0f269ac6de67e3e14` | 33 |
| `tests/unit/net-start-arming.test.mjs` | 1–183 | `4ffca8dd90240db0b3be462eeb658a9f48eb80453ad2c6fb3d421401f606555b` | 6 |
| `tests/unit/net-stub-surface.test.mjs` | 1–114 | `86c8d35fa9cfc01c2acc4fd17dee050bbb0cbee63e9dcbdc52f4a6a98b4ad2f7` | 5 |
| `tests/unit/net-transport.test.mjs` | 1–1672 | `e9b2682f390d2e98bf026f5316c4d61169e6d90d3f95892e25dbeeae13950ff0` | 61 |
| `tests/unit/net-trystero-api.test.mjs` | 1–378 | `d28b3fc7d9d72e50b1693d8a0ce51ffeeedbd7bf64e61a5287435a4cb8acec04` | 21 |
| `tests/unit/netplay-resilience.test.mjs` | 1–143 | `ddcb3656ce1cb75fb224507593c744be140f7f6797232c234b98511a0f11555c` | 2 |
| `tests/unit/new-hooks-vm.test.mjs` | 1–602 | `c40bcc506575cb959729e0feda5de6dd79bc879941597dc9686c22450f628c58` | 55 |
| `tests/unit/night-washout-presets.test.mjs` | 1–86 | `6711b5a04869c6bef33f950de9044da1ca1b9c4e55fc2d262d27d7863620de4b` | 3 |
| `tests/unit/nightly-group.test.mjs` | 1–142 | `6f1bba03267d7eb8a16cff878a15947be782bca92d446c6ee0acf209ec235f54` | 9 |
| `tests/unit/no-bare-console.test.mjs` | 1–72 | `598fb6008baa60d5274f2408f3ff476c22c3908d11c989023491abe108fb631d` | 2 |
| `tests/unit/node-compile-cache.test.mjs` | 1–87 | `fad5b3fa3db3cbd95f3ae3651b0472e664bb39d47ebd93b2697d34265097f593` | 5 |

There are 234 expanded cases (233 declarations; the stub template expands twice). Shared VM helper assertion definitions are 30–35,39,42; loadTT adds 61,63 for its case. Stub surface helper assertion 39 is shared by both generated cases.

Assertion spans are inclusive call-expression spans, including multiline messages, plus named numeric/deep-comparison helpers in the VM suite. Setup/helper assertions outside a case are documented per file; repeated loop invocations share one source span. Case ranges are inclusive `test(...)` call spans, excluding surrounding comments.

## tests/unit/net-session.test.mjs

Seeded loopback pair (42–68) pumps at 1 ms, permits epoch-correct clock steps. Bare far end (459–464), 24-byte snapshot stub (469), spy transports, real 22-car NetPlay fixture (183–248). Tests exercise offset ±10 s/−7.5 s, ±25 ms jitter tolerance, 2 s step tracking, RTT/lag, byte and decoded subscriptions, reliable event routing, liveness, stall forgiveness, hidden cadence and release idempotency. Four-stamp PONG removes peer hold; 21-byte legacy PONG remains accepted. Fast 100 ms sync cadence returns to 500 ms after sync. Truncated or unhandled frames cannot extend liveness; configurable 25 s silence grace is separate from ordinary 6 s lobby defaults.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| clock offset is recovered across peers with unrelated clocks | 70–80 | 76, 77, 78, 79 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a clock STEP on one peer is followed in seconds, not after the whole sample window (NP-3) | 82–99 | 89, 97, 98 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| jitter spikes are NOT mistaken for a clock step | 101–105 | 104 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| round-trip time is measured, and the one-way lag is half of it | 107–112 | 110, 111 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a peer timestamp converts onto our timeline and back | 114–121 | 119, 120 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| jitter does not drag the offset estimate around | 123–131 | 129–130 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| state packets are delivered to the game; ping/pong never are | 133–149 | 143, 147, 148 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a pre-sync snapshot is held and delivered once the clock lands | 151–166 | 155, 161, 163, 164, 165 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a truncated pre-sync frame does not replace a held snapshot | 168–181 | 178, 179, 180 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| real session-to-NetPlay delivery decodes each field packet once and preserves byte subscribers | 183–247 | 213, 214, 217, 224, 225, 226, 227, 228, 229, 230, 231, 232, 235, 236, 237, 239, 240, 241, 244, 245 | S create; I decode; P create | Real Session/NetPlay with injected transport and counted codec; no RTC. |
| events are typed, and only their own handler sees them | 249–262 | 260, 261 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| events survive a lossy link because they ride the reliable channel | 264–274 | 272, 273 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a malformed event is dropped rather than thrown | 276–286 | 284, 285 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| an open transport that never receives a valid packet times out | 288–305 | 301, 302, 303, 304 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| silence is detected, and reported once | 307–322 | 312, 319, 320, 321 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a stall in OUR loop is not silence from THEM | 324–355 | 335, 343, 344, 348, 354 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a connecting transport gets its ICE window before the first-packet deadline | 357–367 | 365, 366 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a throwing state handler does not kill the session | 369–380 | 375, 378, 379 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a session that times out CLOSES ITS TRANSPORT, not just its bookkeeping | 382–421 | 408, 409, 414, 415, 416, 420 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| after the transport closes itself, session.close() neither throws nor re-closes | 424–445 | 440, 441, 443, 444 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a session talking to a BARE endpoint never syncs, and the game gets nothing | 471–486 | 481, 482, 484, 485 | S autoPong; T loopback | Runtime on virtual loopback clocks; no real network. |
| autoPong makes a bare endpoint stand in for a peer, and state flows | 488–504 | 490, 499, 500, 501, 502–503 | S autoPong; T loopback | Runtime on virtual loopback clocks; no real network. |
| autoPong answers only PINGs, and refuses a transport it cannot use | 506–521 | 518, 519, 520 | S autoPong; T loopback | Runtime on virtual loopback clocks; no real network. |
| an unsynced session pings harder than a synced one | 530–552 | 540, 542–543, 550–551 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| the fast cadence stops once the clock has landed | 554–577 | 571, 575–576 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a PONG for a ping we never sent, or with a forged t0, is not a clock sample | 584–603 | 597, 601, 602 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a reply held by the peer for a frame does not bias the clock offset | 606–628 | 625, 626, 627 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a PONG without t2 (21 bytes) is still a sample, read as if unheld | 630–640 | 638, 639 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a truncated PONG after sync does not keep the session alive past timeout | 645–677 | 666, 674, 675–676 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| session.close() reports 'local' to its own handlers and 'transport' to the peer's | 679–696 | 692, 693, 695 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| a hidden tab still times out a gone peer; a visible stall is still forgiven | 702–730 | 708, 712, 719, 726 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |
| setTimeoutMs raises the silence that ends the session | 734–744 | 737, 738, 741, 743 | S create; T loopback | Runtime on virtual loopback clocks; no real network. |

## tests/unit/net-snapshot.test.mjs

Real M4 and Log globals; car defaults (31–34), synthetic 5 km track, cross-line progress helper (356). Pins 13-byte cars, 6-byte headers, 22-car budget, signed speed, valid byte-sized integer IDs, truncated-frame rejection and aged stamps. Interpolation uses shortest arc and heading, bounded 250 ms forward prediction, 500 ms gap snapping, sorted/deduplicated and bounded history, uint32 epoch unwrapping, arrival-gated future refusal, discrete gear/flags and coupled lap/arc motion. Brake prediction derives deceleration from two poses and caps slowdown at 35%; single/increasing-speed samples remain flat. Adaptive delay settles above 160 ms path lag under 400 ms cap; 20 ms path keeps 100 ms floor.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| a car round-trips within the stated quantisation | 41–62 | 47, 48, 50, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61 | I encodeSnapshot/encodeAged/decodeSnapshot | Pure codec/interpolator with synthetic car poses; no visual proof. |
| the packet is 13 bytes per car | 64–72 | 69, 70, 71 | I encodeSnapshot/encodeAged/decodeSnapshot | Pure codec/interpolator with synthetic car poses; no visual proof. |
| reverse speed survives the wire | 74–79 | 78 | I encodeSnapshot/encodeAged/decodeSnapshot | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a full 22-car grid still fits comfortably | 81–91 | 85, 87, 88, 90 | I encodeSnapshot/encodeAged/decodeSnapshot | Pure codec/interpolator with synthetic car poses; no visual proof. |
| negative wire ids are omitted so the count byte matches | 93–103 | 100, 101, 102 | I encodeSnapshot/encodeAged/decodeSnapshot | Pure codec/interpolator with synthetic car poses; no visual proof. |
| non-integer and out-of-range ids never fold onto wire id 0 | 105–129 | 118, 119, 120, 127, 128 | I encodeSnapshot/encodeAged/decodeSnapshot | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a truncated packet decodes to nothing rather than a garbage car | 131–136 | 133, 134, 135 | I encodeSnapshot/encodeAged/decodeSnapshot | Pure codec/interpolator with synthetic car poses; no visual proof. |
| interpolation and prediction keep exact arc/lap wrapping with scratch output and packet extensions | 144–169 | 153, 154, 155, 156, 163, 164, 165, 166, 167 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a car is drawn between the two packets bracketing the delayed present | 171–180 | 177, 178, 179 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| s interpolation takes the short way round the start/finish line | 182–191 | 190 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| heading interpolation takes the short way round too | 193–200 | 199 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a late packet extrapolates ALONG THE ROAD, and gives up after a bound | 202–216 | 209, 210, 211, 215 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a multi-second dropout snaps to the new pose instead of lerping across the hole | 218–238 | 222, 227, 228, 229, 230, 236, 237 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| extrapolation wraps at the line rather than running past the track length | 240–246 | 244, 245 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| out-of-order and duplicate packets are handled, not trusted | 248–262 | 255, 256, 257, 258, 260, 261 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| interpolation unwraps uint32 wire ticks across the long-session rollover | 264–275 | 267, 270, 272, 273, 274 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| decoded rollover ticks use the arrival clock epoch for adaptive delay | 277–284 | 280, 281, 283 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| predict() leads sample() by exactly the interpolation delay | 286–299 | 296, 297, 298 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a far-future tick is refused: it cannot pin newest or freeze the adaptive delay | 301–320 | 307–308, 309–310, 311, 314, 315, 316, 318, 319 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| an empty buffer reports nothing rather than inventing a car | 322–326 | 324, 325 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| the buffer is bounded, so a long session cannot grow it without limit | 328–333 | 331, 332 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| discrete fields step instead of blending | 335–348 | 344, 345, 346, 347 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| prog is monotonic across the start/finish line (blend, both halves) | 358–375 | 368, 369, 370, 374 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a car reversing back over the line loses a lap rather than gaining one | 377–388 | 383, 385, 386, 387 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| extrapolating across the line carries the lap with it | 390–401 | 396, 398, 399, 400 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a state with no lap field is left alone by both movers | 403–411 | 409, 410 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a car that is not braking extrapolates exactly as it always did | 431–441 | 438, 439, 440 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a braking car is predicted short of where flat speed would put it | 443–454 | 449, 451, 453 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| the prediction never runs past a stop, or past the slow-down cap | 456–468 | 464, 465, 466, 467 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| one sample cannot imply a rate, and falls back to flat speed | 470–478 | 476, 477 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| a car that is speeding up while flagged braking is not accelerated further | 480–489 | 487, 488 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| the adaptive delay follows one-way LATENCY, so a slow link interpolates instead of extrapolating every frame | 491–521 | 510, 511, 512, 516, 520 | I createInterp | Pure codec/interpolator with synthetic car poses; no visual proof. |
| an aged multi-entry packet round-trips every car and its own stamp | 525–545 | 533, 535, 536, 537, 538, 541, 542, 544 | I encodeSnapshot/encodeAged/decodeSnapshot | Pure codec/interpolator with synthetic car poses; no visual proof. |

## tests/unit/net-start-arming.test.mjs

Real net stack and M4; Tracks.sample and stubG (35–45) supply synthetic cars/geometry. Guest-first build resends ARMED promptly; interp.presentedAt exposes delayed pose time; source pins 45 s host wait and guest backstop plus announcement. Independently skewed clocks prove one START conversion, including held pre-sync START. RESULT survives immediate host stop; extracted real netOrder via symbolSource is evaluated in a VM and stale verdict is rejected when cars identity changes.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| a guest whose circuit built first still gets the start named promptly | 48–67 | 55, 65, 66 | P create (start/tick/hostStart); S create | Runtime loopback with stub game facade; one source-shape guard. |
| the snapshot interpolator reports the time it last posed | 69–75 | 74 | I createInterp.presentedAt | Runtime loopback with stub game facade; one source-shape guard. |
| the host holds the grid 45 s for a guest that cannot arm yet, and says so (a split start was the 20 s alternative) | 77–83 | 80, 81, 82 | P create (start/tick/hostStart); S create | Text regex pins timeout/announcement shape; no 45 s runtime wait. |
| the named moment lands at the SAME instant on a guest whose clock is 5 s off the host's | 85–115 | 98, 99, 102, 110, 113, 114 | P create (start/tick/hostStart); S create | Runtime loopback with stub game facade; one source-shape guard. |
| a START heard before the guest clock syncs is held, then armed on the synced clock (#3516) | 123–150 | 133, 136, 142, 144, 147, 149 | P create (start/tick/hostStart); S create | Runtime loopback with stub game facade; one source-shape guard. |
| a guest keeps the host's RESULT when the host quits before the guest's results (#2199) | 156–183 | 163, 168, 171, 172, 178, 182 | P create; G netOrder | Runtime loopback with stub game facade; one source-shape guard. |

## tests/unit/net-stub-surface.test.mjs

Recursive JS discovery strips comments, excludes js/net and two agent net entry files, derives observed member names (not actual invocation semantics) and compares inert stub keys. Template test expands netPlay and netLobby. shared stubKeys assertion at 39 enforces declaration shape. Positive authority, negative activity and concrete empty arrays/room peers are regex-pinned; matching source formatting is part of this guard.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| the inert netPlay stub answers every call site outside js/net | 62–70 | 65, 68–69 | G | Static source contract; no solo race boot. |
| the inert netLobby stub answers every call site outside js/net | 62–70 | 65, 68–69 | G | Static source contract; no solo race boot. |
| the inert netPlay owns race control and classification (solo owns everything) | 78–91 | 80, 82–83, 88–89 | G | Static source contract; no solo race boot. |
| the inert netPlay reports no session | 95–101 | 98–99 | G | Static source contract; no solo race boot. |
| the inert stubs return the right EMPTY shapes where callers do not guard | 106–114 | 109, 110, 111, 112–113 | G | Static source contract; no solo race boot. |

## tests/unit/net-transport.test.mjs

First three cases test NetworkAdversary itself, not production networking: headers/body scheduling, request versus mid-body failure, abort settlement. Seeded loopback tests delay/loss/order/bidirectional close and exception isolation. FakePC/channel models exercise 64-state/256-event bounds, duplicate labels, outbound STATE shedding, critical EVENT queues (256 cap, BYE displacement), resource teardown and grace timers. withStore, stub fetch, fake Date.now test STUN/TURN configuration, expiring HMAC, TTL refresh, endpoint generations and construction-time relay stats. pcHarness (780–801) supplies channels; restartPair (926–1008) implements offer/answer/rollback plus virtual timers; boardCourier (1010–1037) models authenticated signaling delivery and delayed acknowledgement. Restart cases cover passive answerer, 3 s blips, failed versus connecting/connected, 8 s retry, rotating credentials, bounded old listeners, cancellation and late continuation safety. Handshake codecs use real compression and synthetic SDP; pins include size limits, copy whitespace, build identity, CRLF, fragments, ICE completion race and offer-ID ownership. No real RTC or relay is contacted.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| network adversary can reorder headers and stall each response body | 34–57 | 38, 48, 51, 56 | F NetworkAdversary | Tests test-helper fetch scheduling/failure semantics; no production client. |
| network adversary distinguishes request failure from a mid-body disconnect | 59–71 | 63, 70 | F NetworkAdversary | Tests test-helper fetch scheduling/failure semantics; no production client. |
| network adversary aborts a pending response without leaving a delivery path | 73–81 | 78, 79, 80 | F NetworkAdversary | Tests test-helper fetch scheduling/failure semantics; no production client. |
| nothing is delivered before its latency has elapsed | 93–102 | 99, 100, 101 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| loss hits the unreliable channel and never the reliable one | 104–118 | 116, 117 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| partial loss is reproducible for a given seed | 120–136 | 129, 135 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| the reliable channel preserves send order | 138–146 | 145 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| traffic flows both ways and close is seen by both ends | 148–162 | 154, 160, 161 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a throwing message handler cannot take down the transport | 164–174 | 172, 173 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| RTC inbox pressure drops state snapshots, never reliable events | 176–212 | 204, 205, 206–207 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a guest adopts only the expected data-channel labels, once each (NP-7) | 214–246 | 231, 232, 234, 235, 236, 239, 240, 241 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| RTC disconnects instead of dropping reliable events when its inbox overflows | 248–281 | 273, 274, 275, 276 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a congested outbound STATE queue drops the snapshot instead of buffering it | 283–323 | 310, 311, 312–313, 314, 317, 318 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| EVENT cap: non-critical drops above the outbound buffer; criticals arrive in order | 325–399 | 353–354, 355–356, 361, 362, 363, 372, 373, 374, 375, 376, 382, 383, 386, 390–391, 393–394 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| EVENT critical backlog is capped; a late BYE displaces the oldest | 401–443 | 432, 433, 434, 437, 438 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| no HARDCODED-PASSWORD relay ships, and a credentials URL becomes iceServers | 449–474 | 456, 466, 468, 469 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| NO relay ships by default, because both free ones were measured dead | 484–503 | 497–498, 499, 500–502 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| no credential endpoint ships by default, and yours overrides it | 505–535 | 522, 523, 530–531 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| the coturn REST credential is derived, not hardcoded, and expires | 537–573 | 556, 560, 561–562, 565, 570, 571–572 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| opting in adds relays LAST, and hasRelay() then says so | 575–591 | 581, 584, 585, 589 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| more STUN servers than one, from different operators | 593–601 | 597, 599–600 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| an invite code round-trips through compression | 607–617 | 615, 616 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| the code is markedly smaller than the SDP it carries | 619–625 | 623, 624 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| garbage and truncated codes are rejected with a usable message | 627–639 | 630, 631, 635, 636, 637–638 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| packed SDP rejects non-object payloads and missing handshake fields as corrupt | 641–661 | 652, 653, 656–657 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| invite decoding rejects oversized encoded and plain payloads before use | 663–679 | 665–666, 671, 672, 676–677 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| whitespace from a sloppy copy/paste is tolerated | 681–686 | 685 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a build mismatch is refused, and says which side is stale | 688–699 | 689, 692, 693, 694, 697, 698 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| an unknown build is refused, not treated as a match | 707–724 | 711, 712, 715, 720, 722, 723 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| SDP survives the round trip verbatim, CRLF-terminated | 726–753 | 745, 746, 747, 748, 752 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| the invite link keeps the code in the fragment | 755–771 | 759, 760, 762, 763, 764–765, 766–770 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a peer channel close releases the RTCPeerConnection, exactly once | 803–817 | 809, 810, 811, 814, 815 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a connectionState failure releases the RTCPeerConnection too | 819–829 | 826, 827 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a close inside the disconnect grace window reclaims its timer | 831–851 | 843, 845 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a race session's timeout sets the rtc disconnect grace: 6 s stays open, 26 s closes | 856–889 | 883, 885, 886, 887 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| raising disconnect grace re-arms a live lobby timer (lobby→race) | 891–920 | 908, 912, 914, 915 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| ICE failed after connecting rides the grace and restarts ICE through the courier (#3556) | 1039–1073 | 1047, 1052, 1053–1054, 1056, 1057, 1058–1059, 1060, 1061, 1062, 1063, 1064, 1065, 1069, 1070, 1071 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| with no courier, ICE failed after connecting closes at the grace end, not at once | 1075–1090 | 1084, 1086, 1087, 1088 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a disconnect that heals before the restart answer rolls the pending offer back | 1092–1110 | 1100, 1103, 1106, 1107, 1108 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| connecting preserves the restart token and accepts its late valid answer | 1112–1135 | 1120, 1122, 1123, 1124, 1129, 1130, 1132, 1133 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| connecting keeps the outage deadline; close rejects a late answer and stale recovery event | 1137–1159 | 1145, 1148, 1150, 1151, 1155, 1156, 1157 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| actual connected recovery cancels an unanswered offer and refuses its late answer | 1161–1180 | 1170, 1172, 1173, 1174, 1177, 1178 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a connected answerer handles one-sided failure, retry, and subsequent credential generation | 1182–1220 | 1186, 1188, 1190–1191, 1192, 1193, 1194, 1196, 1197, 1201–1202, 1203, 1204, 1207–1208, 1209, 1210, 1211–1212, 1214, 1215, 1217, 1218 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a healthy answerer rotates credentials before courier repost completion and expires only the old chain | 1222–1243 | 1227–1228, 1231, 1232, 1234, 1235, 1236, 1238–1239, 1241 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| closing while a restart offer is being created prevents its late SDP mutation | 1245–1260 | 1253, 1256, 1257, 1258 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| raising race grace also re-arms the answerer's live retry-generation expiry | 1262–1280 | 1267, 1272, 1274, 1276, 1277 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| rtc stamps message ARRIVAL and hands it to onMessage; loopback stays unstamped | 1282–1308 | 1296, 1297–1298, 1307 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a fetched ICE entry that makes the constructor throw is dropped and rtc() retries STUN-only | 1315–1349 | 1335, 1337, 1338, 1339–1340, 1341–1342, 1345 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| stats().turn follows the PC's iceServers, not a later hasRelay() flip | 1356–1388 | 1370, 1372, 1373, 1378, 1379–1380, 1383, 1384 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| localBuild() reads the shell's apex-build meta before it fetches | 1395–1410 | 1401, 1402, 1403, 1406, 1407, 1408 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| peekCode refuses the shapes decodeCode refuses, synchronously, and accepts a real code | 1416–1427 | 1417, 1418, 1419, 1420, 1421, 1423, 1425 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| loopback jitter never reorders the EVENT channel: it is reliable AND ordered on the real wire | 1429–1437 | 1436 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a handler that closes the endpoint mid-pump stops the rest of that batch | 1439–1451 | 1449, 1450 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| waitForIce re-checks after listening and honors a null icecandidate end | 1461–1483 | 1472–1473, 1474, 1482 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| prefetchIce retains last-good TURN while a TTL refresh is in flight | 1488–1522 | 1507, 1510, 1511–1512, 1513, 1516 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| prefetchIce follows TURN endpoint changes and removal | 1524–1555 | 1537, 1538, 1541–1542, 1544, 1545, 1549, 1550 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| a late answer from an old TURN endpoint cannot replace the new relay | 1557–1579 | 1570, 1573, 1574 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| acceptAnswer refuses an answer built for an older offer, and still takes an id-less one | 1581–1627 | 1600, 1601, 1604, 1606, 1609, 1610, 1611, 1614, 1615, 1617, 1621 | H codec/build/invite/waitForIce | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| remote close drains accepted messages before terminal close on the next pump | 1630–1649 | 1639, 1640, 1642, 1643, 1645, 1647 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| intentional local close discards accepted undelivered messages | 1651–1660 | 1658 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |
| BYE handling during remote-close drain can locally discard trailing mail | 1662–1672 | 1670 | T loopback/rtc/ICE | Deterministic transport/PC model and source pins; no ICE/TURN connectivity proof. |

## tests/unit/net-trystero-api.test.mjs

Reads pinned vendor 0.25.4 and current nostr module; comment-stripped negatives prevent legacy full-room APIs returning. Static checks cover frame API exports, own sockets/refusals, backoff markers, .js packaging, licenses, importmaps and lazy loading. Runtime relay override fixtures include intentional invalid ellipsis, scheme and type entries. Inbox tests bound frame parsing, concurrent decrypt and retained count/characters and allow 45 s sender skew while dropping hour-old replay. finish timer check is textual. wireHarness (265–269) directly imports action-wire.js; actionFrame (270–276) builds 36-byte-header frames. Runtime vendor tests cover inherited action names, departed peers, invalid JSON, 30 s expiry/tombstones, 64 pending/128 deferred bounds, >16 MiB overflow and multipart Unicode/JSON/binary metadata round trips. No WebSocket exchange or browser MIME handling is exercised.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| the direct exchange reaches createEvent and subscribe, and both are exported | 31–47 | 36, 38, 39, 40, 41, 42, 43, 44–45, 46 | N frame/inbox/exchange/relay policy | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| the direct exchange owns its sockets and reads NIP-01 refusals itself | 49–59 | 53, 54, 55, 56, 57, 58 | N frame/inbox/exchange/relay policy | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| the vendored version is 0.25.4 and carries the relay backoff this bump was for | 61–71 | 66, 67, 69, 70 | N + vendor/package/shell assets | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| the vendored tree ships as .js, not .mjs | 73–90 | 89 | N + vendor/package/shell assets | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| a .nojekyll file exists, so Pages publishes the tree verbatim | 92–97 | 96 | N + vendor/package/shell assets | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| the vendored tree is complete and self-contained | 99–113 | 108, 111, 112 | N + vendor/package/shell assets | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| every bare import in the vendored tree is covered by EVERY page's importmap | 115–147 | 136, 142, 143–144 | N + vendor/package/shell assets | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| Trystero is dynamic-imported, never in the boot path | 149–157 | 153, 154, 156 | N + vendor/package/shell assets | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| a bad relay override is dropped, never handed to WebSocket | 159–191 | 177–178, 179–180, 181–182, 183–186, 187–190 | N frame/inbox/exchange/relay policy | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| direct relay frames are rejected before unbounded parsing or decoding | 193–203 | 197, 198, 199–200, 201–202 | N frame/inbox/exchange/relay policy | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| direct relay dedupe and decrypt work stay hard bounded | 205–239 | 210, 211, 212–213, 214, 215, 220, 226, 229, 230, 231, 234, 237–238 | N frame/inbox/exchange/relay policy | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| finish() reclaims every timer the exchange armed, the reply re-publish included | 241–251 | 249, 250 | N frame/inbox/exchange/relay policy | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| an offer signed by a host clock 45 s behind this device is still heard | 253–262 | 258, 259, 261 | N frame/inbox/exchange/relay policy | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| vendored action wire treats inherited names as ordinary unregistered actions | 278–286 | 281, 284 | W createActionWireManager | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| vendored action wire drops queued unknown actions when the peer leaves | 288–295 | 294 | W createActionWireManager | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| vendored action wire rejects short and invalid JSON frames without poisoning later messages | 297–304 | 300, 301, 303 | W createActionWireManager | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| vendored action wire never delivers a suffix after an incomplete message expires | 307–318 | 314, 316 | W createActionWireManager | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| vendored action wire bounds pending messages and expires incomplete input | 320–333 | 326, 329, 332 | W createActionWireManager | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| vendored action wire bounds deferred unknown actions and expires their payloads | 335–345 | 340, 344 | W createActionWireManager | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| vendored action wire bounds cumulative message bytes and rejects trailing chunks after overflow | 347–357 | 353, 356 | W createActionWireManager | Mixed source/package guards and pure runtime inbox/action-wire tests. |
| vendored action wire preserves multipart text, JSON, binary and metadata round trips | 359–378 | 370, 371, 372, 373, 375, 376 | W createActionWireManager | Mixed source/package guards and pure runtime inbox/action-wire tests. |

## tests/unit/netplay-resilience.test.mjs

stubG (28–43), Tracks.sample and fakeSession (45–75) isolate race state. Loopback peer close must leave host active with AI car and no dead rejoin API. Spectator cases inspect real NetSpectate presence plus lobby MAX_GUESTS text; fake incoming pose cannot claim a host seat, fan-out includes field state, guest spectator can render but cannot send snapshots/events or own classification/control. Does not prove reconnection or live rendering.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| a dropped driver hands its car to AI while the host race stays live | 79–105 | 85–90, 91, 99, 100, 101, 104 | P | Runtime real stack/drop and fake sessions for spectator policy. |
| a spectator consumes no grid seat, receives field state, and cannot publish inputs | 107–143 | 108, 109–110, 114–119, 121, 122, 126, 129–130, 135, 138, 139, 140, 141, 142 | P | Runtime real stack/drop and fake sessions for spectator policy. |

## tests/unit/new-hooks-vm.test.mjs

One createGame boot (45–47), default Monza startup, load race/go/jump (51–55), TT cars-identity settle (58–65), realm-normalizing helpers (30–43); helper assertions at 61,63 enforce TT setup. Eight virgin-page cases precede all races. Hook cases cover shape, ranges, progress after stepping, AI placement, clamps and hook consistency; finite number/type assertions do not generally prove absolute timing accuracy. Sector bests test accepts either null or number despite its stronger title. Geometry cases sample ground/profile and inspect manifests for named tracks, not every vertex or rendered pixel. Foundation expectations: Silverstone 10–20 m relief and named Wing/hangar/tower; COTA finite diagnostics; Miami water/hero IDs and two overpasses; Jeddah exclusions, ≤3 m relief and tight walls; Singapore day/night props, 4–6 m relief; Shanghai wing/water heroes day/night, safe wall bounds. Typical ground gap ≤0.18 m and overhead clearance ≥4.8 m. Header documents 55/56 browser ports with Madrid long foundation test excluded; this map does not certify equivalence or run CI.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| timing() returns null before a track is loaded | 69–71 | 70 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| sectorState() returns null before a track is loaded | 73–75 | 74 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| lapHistory() returns null before a track is loaded | 77–79 | 78 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| fieldState() returns null before a track is loaded | 81–83 | 82 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| aiPlace() returns false before a track is loaded | 85–87 | 86 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| setEnergy() returns false before a track is loaded | 89–91 | 90 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| setLap() returns false before a track is loaded | 93–95 | 94 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| trackProfile() works on the default track loaded at startup (no race() call) | 97–101 | 99, 100 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| timing() returns an object with all expected fields | 105–113 | 108, 109, 110, 111, 112 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| timing().pos is between 1 and total | 115–119 | 118 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| timing().sector is 1, 2, or 3 | 121–124 | 123 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| timing().gear is between 1 and 8 | 126–130 | 129 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| timing().energy is between 0 and 1 | 132–136 | 135 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| timing().raceT advances after stepping physics | 138–143 | 142 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| sectorState() returns idx, elapsed, bests, last | 147–154 | 150, 151, 152, 153 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| sectorState() bests are null before first lap completes | 156–160 | 159 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| sector index is 0 in S1 and 1 in S2 | 162–172 | 168, 171 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| lapHistory() returns mode, laps, best, lastLap in race mode | 176–183 | 179, 180, 181, 182 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| TT mode has mode:'tt' | 185–190 | 188, 189 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| fieldState() returns an array with one entry per car | 194–199 | 197, 198 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| fieldState() entries have required fields | 201–211 | 204, 205, 206, 207, 208, 209 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| fieldState(): exactly one entry is the player | 213–216 | 215 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| fieldState(): pos is sequential 1..n and leader has gap 0 | 218–224 | 221, 222, 223 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| fieldState(): frac values are in [0, 1) | 226–229 | 228 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| aiPlace() returns false when called on the player car | 233–238 | 237 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| aiPlace() returns false for out-of-range index | 240–243 | 242 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| aiPlace() places an AI car at the specified fraction | 245–254 | 250, 251, 252, 253 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| aiPlace() result is reflected in fieldState | 256–263 | 262 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| setEnergy() sets energy to the given value | 267–271 | 269, 270 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| setEnergy() clamps to 0 | 273–276 | 275 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| setEnergy() clamps to 1 | 278–281 | 280 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| energy is visible in timing() after setEnergy() | 283–287 | 286 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| setLap() sets the player lap counter | 291–295 | 293, 294 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| setLap() clamps negative to 0 | 297–300 | 299 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| setLap() floors fractional input | 302–305 | 304 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| lap change is visible in timing() | 307–311 | 310 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| trackProfile() default returns 100 entries | 315–318 | 317 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| trackProfile() respects custom n | 320–323 | 322 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| trackProfile() clamps n to max 1000 | 325–328 | 327 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| trackProfile() entries have frac, y, k, hw, slope | 330–333 | 332 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| trackProfile() fracs run from 0 up to just below 1 | 335–340 | 338, 339 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| trackProfile(): all y values are finite numbers | 342–345 | 344 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| trackProfile(): hw (half-width) is positive everywhere | 347–350 | 349 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| Spa has measurable elevation change (>10 m) | 352–358 | 357 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| Shanghai stays flat-by-F1-standards, with a real back-straight crest | 360–375 | 371, 372, 373, 374 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| obs().gear field is present and in 1-8 range | 379–385 | 382, 383, 384 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| obs().gear matches timing().gear | 387–390 | 389 | A ApexLobby hooks | Game VM numeric/manifest evidence; renderer/browser excluded. |
| gear increases at high speed after stepping physics | 392–399 | 398 | A ApexApi hooks/physics | Game VM numeric/manifest evidence; renderer/browser excluded. |
| Silverstone uses grounded required landmarks and airfield-scale terrain | 405–447 | 418, 419, 420, 421, 422–423, 424, 425, 426, 429–436, 439–443, 444, 445, 446 | A ApexTrack diagnostics; circuit scenery | Game VM numeric/manifest evidence; renderer/browser excluded. |
| reports finite geometry and structured model outcomes | 449–458 | 453, 454, 455, 456, 457 | A ApexTrack diagnostics; circuit scenery | Game VM numeric/manifest evidence; renderer/browser excluded. |
| Miami emits validated water, grouped heroes, and safe overpasses | 460–484 | 468, 469, 475, 477, 478, 480, 481, 482, 483 | A ApexTrack diagnostics; circuit scenery | Game VM numeric/manifest evidence; renderer/browser excluded. |
| Jeddah declares its migrated waterfront foundation contracts | 486–522 | 503, 504, 505–509, 510, 511, 512, 513, 514, 515, 517, 518, 520, 521 | A ApexTrack diagnostics; circuit scenery | Game VM numeric/manifest evidence; renderer/browser excluded. |
| night rebuilds expose a distinct validated props manifest | 524–532 | 529, 530, 531 | A ApexTrack diagnostics; circuit scenery | Game VM numeric/manifest evidence; renderer/browser excluded. |
| Singapore migration keeps models, walls, terrain, and elevation intentional | 534–572 | 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 563, 564, 565, 566, 567, 568, 569, 570, 571 | A apex.trackProfile; circuit data | Game VM numeric/manifest evidence; renderer/browser excluded. |
| Shanghai declares safe required heroes and reflective water | 574–602 | 590, 591, 593, 594, 595, 596, 597, 598, 599, 600 | A ApexTrack diagnostics; circuit scenery | Game VM numeric/manifest evidence; renderer/browser excluded. |

## tests/unit/night-washout-presets.test.mjs

presets() (21–25) evaluates actual LightPresets into isolated window. MAST_RING_FIX (27–35) and MAST_THROW_FIX (37–46) are explicit expected tables. Qatar alone lowers pool energy to 0.6 and ssrDryNight to 0.05; Bahrain ring remains 0.85 pool and 1.3 radius; Abu Dhabi/Madrid use 0.85 radius and 0.06 bounce; Jeddah pins its separate beam/cone 0.55, bleed 0.65 and pool 0.8. These guard shipped numeric intent, not perceived brightness.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| qatar and bahrain keep the shipped flood-mast ring night\|dry trim | 48–61 | 52, 57, 59 | L | VM evaluates data table; no light rendering. |
| abudhabi and madrid pin the tall-mast pool trim (beam + radius + bounce) | 63–72 | 67, 69 | L | VM evaluates data table; no light rendering. |
| jeddah night\|dry trims street-lamp cores without the desert ring radius | 74–86 | 77, 78, 79, 80, 81, 82, 83, 84, 85 | L | VM evaluates data table; no light rendering. |

## tests/unit/nightly-group.test.mjs

Imports real rotation/exclusion/unscheduled definitions; reads groups/package and workflow/local gate text. HOMES (49–54) text scan uses name boundary but can count comments as homes. Fake test:no-such-group is an absent-name fixture, not a missing tracked path. Audit aliases must resolve through ratcheted suites and matching audit CLI text. Rotation checks modulo coverage, fixed index 7 and valid negative/huge indices; CLI stdout contract expects GROUP=<bare>. None proves GitHub actually dispatches a scheduled run.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| every browser group either rotates or states why it does not | 15–26 | 19–20, 23, 24 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |
| every EXCLUDED key names a real group, and every rotated group is a browser group with a package script | 28–40 | 32, 35, 36, 39 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |
| EVERY group has a home: a workflow, a local gate, the rotation, or a stated reason | 56–80 | 76–79 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |
| UNSCHEDULED states a real reason and does not overlap the other two homes | 82–94 | 84, 85, 86, 87, 93 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |
| the two un-ratcheted audit aliases still point at a suite that DOES gate them | 96–110 | 103, 104, 106, 107–108 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |
| the rotation covers every one of its groups within one cycle | 112–118 | 116–117 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |
| the pick is deterministic, and stable across a negative or huge day index | 120–127 | 124, 125, 126 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |
| every rotated group is a runnable npm script | 129–134 | 131–132 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |
| the CLI prints GROUP=<bare name>, which is what ci.yml's `npm run test:$GROUP` wants | 136–142 | 139, 140, 141 | C | Static scheduling census and pure selection; CLI invoked only if test runs. |

## tests/unit/no-bare-console.test.mjs

codeMask (35–49) blanks comments/strings/templates preserving newlines; bareConsole (50–51) matches log/warn/error/info/debug/trace dot calls. Four snippets prove URL string, multiline call and prose handling. Tree scanner (61–72) exempts Log implementation and entire nostr file. Nostr exception description is historical: net-trystero-api forbids the old interception now, so this allowlist remains broader than needed. Template interpolation contents are blanked too; computed member/aliases are outside this guard.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| the bare-console scan detects known-bad fixtures and ignores prose | 53–59 | 54, 55–56, 57, 58 | Q | Lexical source scan; limited to six console methods and allowlisted files. |
| no bare console.* outside js/core/log.js (allowlisted seams excepted) | 61–72 | 68–71 | Q | Lexical source scan; limited to six console methods and allowlisted files. |

## tests/unit/node-compile-cache.test.mjs

augmentNodeCompileCache env fixtures use /tmp/cov as a string flag only. withVmCache (26–36) creates/removes a temporary OS directory and restores APEX_VM_COMPILE_CACHE. fs.writeFileSync spy exposes half-write, failure spy leaves prefix then throws; safe final file must appear only after full write, execute to 42 and validate V8 cachedData. Legacy source-only SHA key stays untouched while safe-format key publishes separately. cache-fixture.js is a diagnostic VM filename, not a repository file.

| Case / asserted behavior | Case lines | Assertion spans | Production target | Meaning / limit |
|---|---|---|---|---|
| NODE_COMPILE_CACHE is off when collecting coverage | 8–11 | 9, 10 | V | Pure env and VM/filesystem fault injection; no multi-process race executed. |
| NODE_COMPILE_CACHE points at artifacts/.node-compile-cache by default | 13–16 | 15 | V | Pure env and VM/filesystem fault injection; no multi-process race executed. |
| VM bytecode cache becomes visible only after its entire write completes | 38–59 | 45–46, 52, 54, 56, 58 | V | Pure env and VM/filesystem fault injection; no multi-process race executed. |
| VM bytecode cache write failure leaves no partial entry and does not fail execution | 61–73 | 71, 72 | V | Pure env and VM/filesystem fault injection; no multi-process race executed. |
| VM bytecode cache ignores legacy non-atomic entries | 75–87 | 84, 85, 86 | V | Pure env and VM/filesystem fault injection; no multi-process race executed. |

## Referenced target fingerprints

These hashes identify the concrete target versions, without implying every indirect dependency was fully read.

| Target | SHA-256 |
|---|---|
| `js/net/session.js` | `7d016f38240c2360241162100995480a5c6635d67a6f876c54274c5b16456b01` |
| `js/net/snapshot.js` | `23659eed7cbe28b23d7a8363576db9e39c774e13af4e4b7b517b70e5ddb66298` |
| `js/net/transport.js` | `ae8e23ab480d0663a1576bbf8f52a1380f933ef5e84946dc4945c0b5c5a76bf4` |
| `js/net/netplay.js` | `49332e13214c1e5e9eb7c186af0591ef8b1054e33d5fc5df1a80abc957b9566c` |
| `js/net/handshake.js` | `79fa22247bccc7c4fd0704cc4299dd10dbeba761723f7e3c4f66db0dd9a38f0e` |
| `js/net/nostr.js` | `1ed832e0b025ba2e040a04e07d995720a60d36d1421df2cea7492921fbb90749` |
| `js/net/spectate.js` | `aeed0d8d52e8a67d1b72315f8a71f196ce671876fa117897315e0979ae52d779` |
| `js/net/lobby.js` | `91ef67f43cc1b03488a2a3dff6f83ada24c459fd2638cf51ccbb026ca496d110` |
| `js/game.js` | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| `js/agent/apex.js` | `fc763bef7f8648781baa4f884933265d07545630a54df8218197e6aa439c7fc1` |
| `js/agent/apex-lobby.js` | `ebda80729a1e3dd647da1038002e184d7a74623a73d38b4c2425d5abb9fc3a6e` |
| `js/agent/apex-track.js` | `275050e7855d328662285b66cd1aa13911a18e167def621eb76cd4f242c4f23e` |
| `js/lighting/presets.js` | `3fd21c305419049ba13bd7f3616afd84725053bdb9c375ad111c6c17ceea9012` |
| `vendor/trystero-0.25.4/core/action-wire.js` | `0de547fd4785b32db50d3c63005cb2517364a17484d24618e658f43dfbaec760` |
| `tools/ci/nightly-group.mjs` | `59456bbedd168aeed6a357a26ed52f31d998d81e72b3f4221d3aa149497f93ee` |
| `tools/lib/node-compile-cache.cjs` | `0b7a11aba8d7ef8a712a94028c8be3f47b46255bb6517d05b81fa7dbba63d6fe` |
| `tools/lib/vm-script-cache.cjs` | `b48406efff85fecc923cf1067dedff356def86d9acaeb7522175a91c0d16ab6d` |
| `tests/helpers/network-adversary.mjs` | `9c0c3a87d19c848f51d2d6501295efb5aa64645b97e37e28039879be42ee9422` |
| `tests/helpers/seed-log.mjs` | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| `tests/helpers/game-source.mjs` | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| `tools/lib/game-vm.cjs` | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |

## Coverage boundary

This report accounts for every declared case in the assigned files, including the two generated stub cases and assertions embedded in fixture callbacks. It records intended contracts and current source relationships, not a pass verdict. Browser drawing, native ICE, live TURN reachability, Nostr relay service, deployed MIME types, actual GitHub scheduling and multi-process crash safety remain outside these unit fixtures. Source-shape guards can reject equivalent refactors and cannot alone prove behavior.
