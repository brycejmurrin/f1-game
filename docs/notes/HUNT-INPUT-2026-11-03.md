# Hunt: input and phone pad (2026-11-03)

Kind: hunt · Re-measure-by: 2027-02-01

Lane 12 (cursor, HALF:front) under B2 / issue #4534. Slice: keyboard / gamepad /
touch surfaces that live beside `js/input/input.js`, plus the phone controller
pad (`controller.html`, `phone-pad*`). `js/input/input.js` is **read-only** this
session (held by draft PR #4602 / #4337); findings about it stay in this note.

Method: prior-art scout (30 KNOWN rows, mostly FIXED stuck-key / dead-zone /
reconnect nets) → code-hunter on OWNED modules → finding-verifier (5/5
CONFIRMED). Nothing measured in a browser.

## Ranked findings (player impact ÷ fix risk)

| # | Where | Verdict | What | Action |
|---|-------|---------|------|--------|
| 1 | `js/input/phone-pad.js` host `onClose` | CONFIRMED | ICE `failed` before the data channel opens leaves `phase === "connecting"`. Relink only ran for `"linked"`, so the host dropped the room while the phone redialed the same code → retries cannot succeed. | **Fixed:** relink when `linked` **or** `connecting` (public relay, `why !== "peer"`). Test: `phone-pad.test.mjs` "ICE failing while still connecting". |
| 2 | `js/input/phone-pad-page.js` release net | CONFIRMED | No `orientationchange` release. Portrait↔landscape (and `#rotate`) often delivers only that event; GAS/BRAKE/LOOK/steer stay latched; a reused pointer id is ignored. | **Fixed:** `window.orientationchange` → `releaseAll()` (parity with `InputHoldButtons.secondaryTap`). Test: "orientationchange releases GAS". |
| 3 | `js/input/phone-pad.js` `padSession.send` | CONFIRMED | A refused STATE send still cleared `dirty` and advanced `lastSent`, so `pump()` would not retry until the 100 ms heartbeat — a pedal lift could sit on the desktop until `REMOTE_STALE_MS` (700 ms) in `input.js`. | **Fixed:** only consume seq / `lastSent` / `dirty` when `send` returns true; on refusal set `dirty` for the next pump. Test: "refused STATE send stays dirty". |
| 4 | `js/input/phone-pad.js` `health()` | CONFIRMED | `ackAt` stores the **sample send** time, so `now() - ackAt` ≈ RTT and grows until the next ack. `"good"` needs age &lt; 250 ms → a steady RTT above ~250 ms (common off-LAN / TURN) never qualifies and the wheel sticks on `INPUT DEGRADED`. Before host hello, `peerAck` is false → `"unavailable"` paints `UPDATE GAME` on a current build. | **Open:** drive good/degraded from silence since **ack receipt**; keep sample age as the numeric readout; treat pre-hello as waiting, not unavailable, until a short timeout. Covered today only at age 0 (`phone-input-improvements.test.mjs`). |
| 5 | `js/input/phone-pad-page.js` `touchcancel` | CONFIRMED | `allUp` releases only when `e.touches` is empty. A one-finger `touchcancel` while another finger remains leaves that pointer latched unless `pointercancel` also fires. | **Open:** on `touchcancel`, `release` each id in `changedTouches`. |
| 6 | `js/input/input.js` `steerNow` / key ramp | READ-ONLY (PR #4602) | Releasing a steer key left `|k| > 0.001` and blocked pad/tilt/touch until ramp-out finished (#4337). | **Do not edit here** — tracked by #4602. |

## Covered and cleared (this pass)

`phone-pad.js` host / link / padSession (reconnect, dirty send, ICE-before-open);
`phone-pad-page.js` hold / orientation release; `phone-pad-codec.js` encode clamps;
`hold-buttons.js` / `pad-menu.js` prior stuck-key nets (KNOWN FIXED); `pedal-travel.js`,
`tilt-roll.js` shapes. `controller.html` skimmed (layout + `#rotate`); no new defect
beyond the page JS release gap above.

## Not covered (next hunt)

`steer-tuning.js` slider persistence; `haptics.js` emit tail; `bindings.js` /
`controller-profiles.js` beyond existing unit pins; live RTT health on a real TURN
path; browser confirmation of orientation latch on iPhone Safari; anything inside
`js/input/input.js` (owned by #4602 until it merges).

## Prior art (do not re-report)

Stuck holds / capture steal / WebKit ghost touch / Meta-Alt keyup / pad D-pad in
fields / phone QR on failed pair / tilt NaN / remote* UI-layer walk / gamepad
snapshot re-probe — see prior-art scout on #4534 Lane 12 (DEFECT-LEDGER +
CHANGELOG + `LIVE-INPUT-H11` / `INPUT-GHOSTS`).
