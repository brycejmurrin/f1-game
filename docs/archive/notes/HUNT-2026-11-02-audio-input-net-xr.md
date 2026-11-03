# Hunt 2026-11-02 — audio, input, net, XR (#4456)

Slice: `js/audio/`, `js/input/`, `js/net/`, `js/xr/`. Method: prior-art-scout, four sonnet code-hunters (partial
coverage each, see below), finding-verifier on every row. Read-only tracing; nothing was benchmarked.

## Fixed in this PR (CONFIRMED)
| # | where | finding | fix / test |
|---|---|---|---|
| 1 | `net/lobby-settings.js` installCircuit | hostile host varying `seed` mints a new content-hash id per SETTINGS; `Tracks.LIST` grows unbounded | reuse the one slot this module pushed; `lobby-settings.test.mjs` |
| 2 | `net/quali-wire.js` validQuali/validQualiLive | `Object.assign({}, d, …)` kept and relayed every extra peer field | whitelist `driverId,t,noTime,frac`; `net-authority.test.mjs` |
| 3 | `input/phone-pad.js` link() | transport pumped only by window rAF, which stops in immersive XR / hidden tab; phone samples and HUD dash stall | 50 ms `setInterval` fallback pump (not run on a headset: NEEDS-HEADSET to confirm); `phone-pad*.test.mjs` still green |
| 4 | `input/input.js` pollGamepad | per-frame `lookAxis` closure | inlined (perf, unmeasured) |

## Follow-ups (CONFIRMED, not fixed)
1. `net/lobby.js:618` HELLO stores/relays the raw peer object (unbounded extra fields) — whitelist via a `cleanHello` helper; needs the `localProfile()` field list.
2. `net/lobby.js:655` guest SETTINGS has no rate gate and rebuilds the circuit every event even when the fingerprint is unchanged.
3. `net/nostr.js:419` `attempt = 0` on open: a relay that opens then closes reconnects every 1 s for the whole window (each open = AES-GCM seal + sign). Reset only after the socket stays open ~5 s.
4. `audio/engine.js:1931` decel term: two `setEngine` calls at the same `ctx.currentTime` give dt = 0.001 and saturate `decelTarget` (harvest whine pop). Skip the decel update when `t - lastEngT < 0.008`.
5. `input/pad-menu.js:133-152` closures/arrays per frame in menus (GC only).

## Refuted
- engine.js:1931 missing upper clamp on dt after a pause: pause calls `stopEngine()`, which resets `lastEngT`/`pullT`.

## Coverage gaps (not hunted)
audio: most of engine.js outside `setEngine`, car-sfx, crowd, ers-layer, soundtrack, radio-voice, announcer, spotify, panel.
input: most of input.js, steer-tuning, bindings, controller-profiles, phone-pad-page. net: handshake, sdp, qr, bytes,
spectate, large parts of lobby.js. xr: xr-opts, xr-plan, apex-xr. Clean: mix-duck, driving-cues, battle-earcon,
rivals 150+, haptics, xr-session/input/rig/ui.
