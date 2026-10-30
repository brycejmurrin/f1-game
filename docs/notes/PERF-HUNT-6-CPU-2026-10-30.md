# Perf hunt 6: main-thread CPU, not GPU (2026-10-30)

PR #4206. Scope: everything a phone's main thread does per frame that is not the GPU, meaning physics, AI, the
game.js loop, HUD and DOM, audio, netplay and input. It also lands the three items PR #4190 deferred. Every number
below is a COUNT (calls, bytes, sockets, constructions) taken from a behavioural test that runs the shipped code.
None is a SwiftShader timing (docs/notes/PERF-FINDINGS.md, "count the work avoided, do not time it").

## Method
- Phase 0: prior-art-scout (the do-not-re-report list, below), a call-tree map of `tick` → `tickBody` → the
  fixed-step `update` → `render` → `updateHud`, and physics-contract-auditor (the do-not-touch list: the player path
  in `updateCar`/`updateCarBicycle`, player-forces/tyre-model/vehicle math and RNG order. Its VM twin is
  `tests/unit/physics-characterization-vm.test.mjs`). No change here touches physics.
- Phase 2: four code-hunter slices (game.js+physics, race+audio, HUD/CSS+input, net), then finding-verifier on a
  9-row shortlist (9 CONFIRMED, 0 stale or refuted), then one opus code-review pass over the diff. It found two regressions (an outage on stale listener sockets, and a late third peer missing a relayed tyre) and one lost stamp input; all three are fixed with tests.
- Phase 1, browser profiling (CPU profile, LoAF trace, heap-snapshot diff): NOT RUN in this session; see Open.

## Fixed (before → after, from the named test)

| # | site | mechanism | before → after | test |
|---|---|---|---|---|
| D1 | `js/net/transport.js` nostrCourier, `js/net/nostr.js` directExchange | The healthy-race ICE-restart answerer listened on the 12 s guest JOIN window, then `answerRestart` re-listened on "expired", re-dialling every relay and re-deriving two PBKDF2 topics each time. A `listen` exchange now holds one socket set for `LISTEN_TIMEOUT_MS` (300 s); onclose and the foreground return still reopen a dead socket, and a socket that opened resets its backoff. Review fix: an OUTAGE no longer adopts the healthy listener, whose minutes-old sockets may be silently dead (NAT rebind, network switch). It cancels the listener and starts a fresh episode on the same code and attempt, using the old 12 s re-dial windows. | Scaled fake 120 s with 2 relays: 18 → 2 sockets. Projected 30-min race with 7 relays: ~1,050 → ~42 TLS handshakes, ~300 → ~12 PBKDF2 derivations | `net-nostr-sockets` "holds one socket set for a race"; `net-transport` "the healthy listener holds a long window" |
| D2 | `js/net/strategy-wire.js`, `netplay.js` broadcastStrategy, `session.js` sendEvent | The 1 Hz refresh between phases now sends scalars only, without `tyre`, `pitNext` or `tyreLog`. A phase change, the first publish and a new receiver epoch still send the full state, and the v1 receiver keeps an absent extension. The payload is stringified once and each receiver's epoch is spliced on. Review fix: the host's relay echo forwards a guest's scalar refresh as scalars, so on every new receiver epoch the host resends each relayed human's full state. Before this fix, a third peer arriving mid-stint never saw that car's tyre. | 17-car field, 60 s: 9,139 → 4,929 B/s per receiver. JSON.stringify: one whole payload per receiver → one per broadcast (plus each epoch string). Stint history is copied only on full publications (7 → 6 in the cadence test) | `net-authority` "a 20-car field's strategy wire", "AI strategy publishes on phase changes", "a receiver that arrives late" |
| D3 | `js/render/glx/glx.js` drawShadow / drawMark, `useProg`; `chunked.js` occlusionPass | Each decal bracketed `setPolyOffset(ROAD_BIAS)` … `setPolyOffset(null)`, which was enable + offset + offset(0,0) + disable per draw. Decals now leave the bias on, and `useProg` lifts it when it switches to any other program. The occlusion pass, which calls `gl.useProgram` directly, lifts it too. | 22 car shadows + 30 skid stamps: 208 → 2 polygon-offset state calls; total GL calls 423 → 217 | `glx-resource-balance` "states ROAD_BIAS once" (red on the old glx.js: 208) |
| F1 | `js/core/i18n.js` resolvePlural | `new Intl.PluralRules()` ran on every plural message, and the HUD tyre chip's aria-label formats one every 10 Hz tick. Now one instance per base language. | 101 plural labels: 101 → 1 construction (~25 µs → ~0.4 µs per label, desktop Node, hunter's micro-bench) | `i18n` "builds Intl.PluralRules once per language" |
| F2 | `js/ui/hud-relative.js` fitKey / refit | The phone stamp sync called `fitKey()` twice per HUD tick while RELATIVE is off (the default): 10 getElementById calls, 10 regex passes and a className concat each. Off, `refit` does nothing, and the key keeps only the clearance-control signature (review fix: hud.js's phone stamp needs it to re-probe when aero or the radio card toggles). | 100 phone ticks with REL off: 2 → 1 key build per tick; refit does 0 getElementById calls and 0 layout reads | `hud-relative` "REL off (the default)" |
| F3 | `js/audio/engine.js` setEngine → ErsLayer.update, setSkid | A 12-field literal and a `{gain,hz,lfo}` literal every frame. Each is now one record rewritten in place (the `_scrubArg` pattern). | 2 → 0 objects per frame | `audio-tune` "hands ErsLayer one record" |

## Verified, not fixed here (ranked; next session's list)
1. `js/race/pit-lane.js:1030` `pickFor`. On every 10 Hz HUD tick, via hud.js `planInfo` → `nextCode` → `nextFor`,
   it rebuilds option records (`CATALOG.find`, `ownedTyres().filter().map(optionRecord)`, 2–4 filters, a reduce).
   Fix: memoise per car on (tread, pitStops, unfitted-box flag, lapsToFlag, tyreLog.length, owned-set identity).
2. `js/audio/signal.js:190` `noiseBurst`. Every overrun pop (5–18/s while lifting) and wastegate hiss creates a
   BufferSource + Biquad + Gain + closure. Pool it the way `blip()` is pooled.
3. `js/net/interp.js:92` `push` copies an already-fresh decoded car (`Object.assign({t}, st)`) and `shift()`s an
   array of 32. `js/net/transport.js:609` `ep.pump` slices the inbox on every frame with mail. Both apply to online
   sessions only. Adopt the decoded object; double-buffer the inbox.
4. `js/net/netplay.js:1239-1272`: the host sends its own car as a separate snapshot on publishes that also carry
   the aged relay. That is 10–20 extra datagrams/s per guest; fold the host car into `_relay`.
5. `js/ui/hud.js:829` `fitHud` runs `dockSig` `querySelectorAll` over both docks every tick, before its same-key
   early return. Cache the button list and invalidate it in `pickDocks`/`invalidateFit`.
6. `js/game.js:4750-4774`: the pooled AI bags `_aiBoost`, `_aiOtFire`, `_aiBr` and `_aiOtPull` gain properties
   after their literal (5053, 5117, 5409, 5827). That is a one-time map transition per page, not per step; declare
   every key in the literal (bit-identical).
7. `js/game.js:4746`: `carSfx.update` runs every physics step. The verifier corrected the hunter: `aimGain` and the
   surface-filter guard skip unchanged targets, so the residue is clamps and compares only. Low.
8. `js/physics/collide.js:835` calls `wallLimits` per car per step even on contact-free steps. PLAUSIBLE; it needs a
   pit-wall-window proof before the skip, because it is on the player path.

Known and left alone (prior art): C5 engine `aimGain` per step (needs an audible A/B), C8 `laneRect`/`clearReadouts`,
the `fitHud` ping-pong, the clipper getBoundingClientRect cache, and C10 far-car AI LOD (awaiting Bryce).
Already fixed at head: C1 rank sort, C2 `_colField`, the C7 bucket arrays, the #4190 strategy stagger and muted
suspend.

## Open (not run this session)
- Browser CPU profile of a 60 s, 20-car race at 844×390 (`tools/perf/profile.mjs`), LoAF trace, heap-snapshot
  diff, and `tools/gfx/glx-call-census.mjs` live. D3 is counted on the real glx.js against the recording mock
  (`tests/helpers/glx-mock.mjs`), not in Chromium.
- `tools/perf/hot-bench.mjs`: no change touches `step()`. Baseline `tools/perf/baselines/hot-bench.json`
  (step 1.663 ms/call, 2026-10-29) still applies.
- No physics file changed, so the characterization VM twin is not affected.

## Read (URLs)
- V8 fast properties and hidden classes: https://v8.dev/blog/fast-properties
- JavaScriptCore tiers (LLInt, Baseline, DFG, FTL; OSR exit): https://docs.webkit.org/Deep%20Dive/JSC/JavaScriptCore.html,
  https://webkit.org/blog/3362/introducing-the-webkit-ftl-jit/
- Long Animation Frames (script attribution, Chrome 123+): https://developer.chrome.com/docs/web-platform/long-animation-frames
- content-visibility and CSS containment: https://web.dev/articles/content-visibility
- WebRTC data channels, bufferedAmount and SCTP head-of-line blocking: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel,
  https://pion.ly/blog/sctp-interleaving
- Nostr NIP-11 relay limitations (`max_subscriptions` is per connection; per-IP limits are not standardised):
  https://github.com/nostr-protocol/nips/blob/master/11.md
- WebGL redundant state: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- AudioParam automation: https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime,
  https://bugzilla.mozilla.org/show_bug.cgi?id=1273009
- Intl.PluralRules: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules
