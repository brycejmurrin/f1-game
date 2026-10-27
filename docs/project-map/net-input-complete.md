# Network and input complete source map

## Goal and source
GPT-6.1 Sol complete_net_input fully read all 25 files / 14,237 lines at c4dc493d9. AGENTS and code-nav read. Attached LSP reference queries covered all module globals and selected members. No writes or browser/tests in agent environment; parent persists report.

| File | Coverage |
|---|---|
| js/net/bytes.js | Full |
| js/net/handshake.js | Full |
| js/net/lobby-codes.js | Full |
| js/net/lobby-roster.js | Full |
| js/net/lobby-settings.js | Full |
| js/net/lobby.js | Full |
| js/net/netplay.js | Full |
| js/net/nostr.js | Full |
| js/net/qr.js | Full |
| js/net/rendezvous.js | Full |
| js/net/scan.js | Full |
| js/net/sdp.js | Full |
| js/net/session.js | Full |
| js/net/snapshot.js | Full |
| js/net/spectate.js | Full |
| js/net/transport.js | Full |
| js/input/bindings.js | Full |
| js/input/controller-profiles.js | Full |
| js/input/haptics.js | Full |
| js/input/hold-buttons.js | Full |
| js/input/input.js | Full |
| js/input/pad-menu.js | Full |
| js/input/phone-pad.js | Full |
| js/input/steer-tuning.js | Full |
| js/input/tilt-roll.js | Full |

## Contracts and flow
NetBytes supplies encodings. SDP packs at most eight total prioritized round-robin UDP candidates. Handshake encodes bounded invitations and checks build identity. Rendezvous derives secure topics/envelopes and chooses optional private mailbox or encrypted Nostr signaling; Nostr owns bounded exchange/reposts/deadlines. Transport supplies ordered reliable EVENT and unreliable STATE channels with queues, ICE/grace and authenticated restart. Session supplies authenticated clock samples, liveness and typed event/snapshot routing. Snapshot handles binary validation, adaptive interpolation/extrapolation and tick wrap. Lobby owns pending/connected peers, roster/readiness/settings and start adoption; NetPlay owns star replication, host AI, timing/finish evidence and silence fallback. Scan owns cancellable camera lifecycle; QR implements byte-mode encoding.

Input arbitrates local/remote tilt, touch, digital buttons, calibrated pads, pedals, hold/toggle edges, menu routes and free look. Bindings owns sanitized two-slot maps and conflicts; ControllerProfiles owns bounded per-device maps. HoldButtons handles multipointer travel and release; Haptics mixes local/remote motors. PadMenu targets focused controls and delegates back navigation. PhonePad provides desktop host/link, phone pad session/page, HUD protocol, sensor/control and wake/redial lifecycle. SteerTuning migrates through schema 5, applies presets/settings to physics and Input. TiltRoll is shared screen-relative gravity math.

## LSP evidence
All 25 globals queried. Input has 301 references across 28 files; Input.steer resolves to game updateCarLateral at 5693, poll to tickBody at 8508, throttleLevel to brake-plan at 5324 and jump-start penalty. PhonePad.host resolves platform-session at 272. Input.remoteSample uses injected alias so global reference query alone was inconclusive; phone-pad caller at 256 was directly read.

## Verified comment discrepancies
- steer-tuning.js:420 describes obsolete absolute-nearest pace migration; actual log-distance at 445 maps old 10 to 19.
- bindings.js:105 says malformed saved slots fall back to defaults; actual existing-array slots become null (118/122).
- sdp.js:160 says eight of each candidate kind; combined budget is eight (193).
- input.js:1521 calls Start fixed, while pause is remappable; 1539 describes document dispatch and local helpers now in PadMenu with focused target.
- pad-menu.js:21 points below for a note actually above, partly describing superseded dispatch behavior.
- input.js:1946 calls look-back held/key-pad-only despite toggle modes and remote held support.
- input.js:2094 calls linearity 5 shipped; effective tuning default is 6.
- steer-tuning.js:75 says adaptive buttons default 6; effective default/preset is 5.
- haptics.js:59 calls priming zero-length/frame lifetime; actual vibrate(1), latched for page lifetime.
- phone-pad.js:723 promises pointerleave release for held controls; actual hold release uses up/cancel/lost-capture/safety nets; pointerleave applies to edge controls.
- input.js:1825 incorrectly describes pedals-only phones entering remote sensor path; they skip it.
- Several source first-line summaries literally end midword with ellipsis; these are real clipped comments, distinct from tool output truncation.

## Limits and next goal
All scoped source lines read. Browser/RTC/device behavior and all consumer bodies were not executed or universally reviewed. Continue game integration, remaining areas, documentation validation and serialized commits.
