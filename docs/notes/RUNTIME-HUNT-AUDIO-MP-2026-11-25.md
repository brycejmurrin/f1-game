# Runtime hunt: audio, VS FRIEND, phone-as-controller, 2026-11-25

Kind: measurement · Re-measure-by: 2027-01-31

Summary: I drove three flows in this container's Chromium: the title-screen audio unlock (iPhone 15 profile,
852×393 touch), the phone-as-controller pairing (a desktop page and a `controller.html` page in one browser,
over the real public Nostr rendezvous and a real WebRTC link), and the MENU PAD (#6408). Pairing, the MENU PAD
and the drop re-link all work. I found three defects, ranked below. Rows already in the prior-art list are not
repeated: DEFECT-LEDGER §7 latch and tilt arming, the pause fence #6393, Toggle/Hold #6372, the Wheel Layout
release #6334, the AudioContext rebuild fixes #3289 and 8197bd95, and MERGED-REVIEW-2026-11-25 rows 2/3. I did
not have the MERGED-REVIEW note itself, so I took those two rows from the brief. Bryce picks the fixes.

## Evidence

### Audio unlock (iPhone 15 profile, touch, headless Chromium 158)

- Fresh install: `apex26.sound` is absent, so `soundOn` defaults to `false` (`js/game.js:238`). A title tap
  loads the bundle and the context stays `uninitialised`, because sound is off. This is by design.
- `apex26.sound=true`, `music=true`, `sfx=false`, `volMusic=0.33` seeded, then one tap: the bundle landed and
  the log read `GameAudio.init state=running`. `volumes()` came back `{sfx:0.4, music:0.33}`, so the saved mix
  persists. Chromium unlocks on **sticky** activation, so `running` here proves nothing for WebKit, which needs
  a **transient** gesture (row 1).

### Phone as controller (desktop 1280×800 host + `controller.html` 852×393, one browser context)

| step | host `#pm-phonepad-status` | phone `#status` | log (ms) |
| --- | --- | --- | --- |
| STEER THIS GAME WITH A PHONE | Waiting for your phone… (room code SHFVZKNZ) | — | rtc create 3,733 → invite ok 11,763 (8 s gather, STUN unreachable here) → nostr ok 11,869 |
| CONNECT on `#pad=CODE` | Phone connected — tilt to steer. | Connected — tilt to steer. | linked under 3 s, admitted without ALLOW (fresh code) |
| MENU PAD Down, Down, Right, SELECT, BACK | focus `mb-career` → `mb-daily` → `mb-tt` → `sel-go` → `mb-tt` | menu pad shown (`body.menu linked`) | works |
| reload the phone page | Phone link lost — waiting for it to reconnect… | Tap CONNECT to pair with the game. | dropped (suspend), hosting again 112,072; invite ok 120,082; **answer fail wrong_offer 120,798** |
| CONNECT again (same phone) | **A phone connected — tap ALLOW on this screen…** | Connected — waiting for the game… If it asks, tap ALLOW | answer ok 136,521; `#phonepad-confirm` open, full screen |

## Findings (ranked)

| # | where | mechanism | repro | proposed fix (Bryce picks) | test | confidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `js/core/lazy-bundles.js:697-708` (`audioGestureUnlock`), `:681` (`restoreOnEngine` init); `js/audio/stub.js:118-130` (`stubClick`) | **The first title tap on an iPhone is always silent.** No real `GameAudio` exists until a gesture pulls `LAZY_AUDIO` (the idle `prefetchAudio` only fetches the files). On the first tap, the capture unlock sees the stub and returns. The bundle then evaluates outside the gesture, and `restoreOnEngine` calls `GameAudio.init()` under *sticky* activation, so WebKit creates a context that stays suspended. Only the **second** trusted tap resumes it. The SOUND button has the same shape: on the stub, `stubClick` flips sound on inside `ensure().then(...)`, after the gesture has ended, so it reads SOUND ON over silence until the next tap. | iPhone Safari, `apex26.sound=true`: cold-open the app, tap the title once and wait. No title music until a second tap. Fresh install: tap SOUND OFF once. The label reads ON and the phone is silent. | Prime a context **inside** the gesture while the stub is resident: in `audioGestureUnlock` (and `stubClick`), when sound is on or being turned on, `new AudioContext()` + `resume()` synchronously, then stash it. `engine.js createCtx()` adopts the primed context if it is not `closed` instead of constructing one. The second-tap path and `resumeIfNeeded` stay as the safety net. | game-vm unit: stub resident, call the unlock with `{isTrusted:true,type:"touchend"}` and a fake `AudioContext`; assert one context constructed + `resume()` called synchronously, and `createCtx` adopts it (no second constructor). Proof on the device: phone bridge, `GameAudio.context().state` after exactly one tap. `runtime: needs-browser` | high (mechanism, code + Chromium trace); the iPhone symptom is `runtime: needs-browser` |
| 2 | `js/input/phone-pad-page.js:145` (`peerId = opts.peerId \|\| makePeerId()`); `js/input/phone-pad.js:362-373` (`admit` / `samePeer`) | **A reloaded or discarded controller page counts as a stranger.** The page's peer id is minted once per page load and never stored. When iOS Safari discards a background tab (common on a phone that was locked or switched away), restoring it reloads the page. A pull-to-refresh does the same. Either way the same phone re-dials with a new id and a new DTLS fingerprint, `samePeer` fails, and the host raises the full-screen ALLOW card. On a TV or desk setup the player has to walk to the screen mid-session. The fresh-code bypass does not apply because `relink` is true. | Pair, reload `controller.html#pad=CODE`, tap CONNECT. The host shows "A phone connected — tap ALLOW…" (measured above). | Persist the id per tab: `sessionStorage` key `apex26.padPeerId` (survives reload and Safari's discard restore, dies with the tab), read before `makePeerId()`. It stays a bearer id sent inside the DTLS hello, as now. | `phone-pad` unit: two page instances over one fake `sessionStorage` send the same hello id; `admit` with `trusted.id` equal → true without `confirm`. | high (measured) |
| 3 | `js/input/phone-pad.js:452-459` (`onJoiner` public-relay branch) vs `js/net/lobby.js:1848-1853` | **A re-link flashes VS FRIEND's "older invite" error on the pad.** When the pad re-hosts the same code after a drop, the relay replays the previous link's answer. `acceptAnswer` returns `wrong_offer` ("That answer is for an older invite. Ask your friend to answer the latest one."), and the pad paints it red via `say(msg, true)` until the next `onTick`. The lobby already treats `wrong_offer` (and `already_answered`) as silent for exactly this replay. The pad does not. The copy also talks about "your friend" on a controller screen. | Pair, reload the phone page. Host log: `handshake answer fail wrong_offer` ~8.7 s after the drop. The red line shows on `#pm-phonepad-status` until the following tick. | In the pad's `!acc.ok` branch, return silently (stay `waiting`) on `wrong_offer` / `already_answered`, as lobby.js does. | `phone-pad` unit: a fake `acceptAnswer` returning `wrong_offer` leaves `phase` `waiting` and calls `ui.say` with no `bad=true`. | high (log + code) |

## Checked, no defect

- Saved mix restore: `volMusic`/`volSfx` restored before the panel (`restoreOnEngine`), MUSIC/SFX switches by
  `AudioPanel.init` (`panel.js:199-200`, `:1058`).
- Pause and resume audio: pause stops the engine, skid and rain and halts the radio. Music keeps playing (one
  playlist), and `startMusic` on resume does not restart a playing track (`soundtrack.js:550`). In a VS FRIEND
  race the world runs on under the card and the local car gets `PAUSED_NET_INPUT` (brake on,
  `js/game.js:961`).
- Garage drive-out engine (`js/garage/setup-camera.js:238-262`): starts only with SOUND on, always stopped by
  `stopDriveOut`.
- SOUND button second press: `panel.js:83-85` keeps sound ON, not muted, when the context has made no sound yet,
  so row 1's second tap unlocks and does not toggle off.
- MENU PAD navigation (#6408) and the drop → re-host → re-dial path (R3-PHONE-3) work as designed.

## Not covered (stopping with these named, rule 9)

- VS FRIEND lobby driven live (invite/QR/room code between two game pages, guest disconnect and rejoin, host
  pause desync). Only the code paths above were read. A loopback run (`__apex.netLoopback`) is the next step.
- Engine pitch across gears in a live race. `tests/unit/audio-tune.test.mjs` pins the curve; no race was run here.
- Photo studio audio. Tilt and HOLD under open #6429 were not re-tested, since that PR owns them.
- Everything on a real iPhone (row 1). Bridge command: one cold tap, then read `GameAudio.context().state` and
  `navigator.userActivation.hasBeenActive`.
