# Phone as controller / restrictive NAT

The pad is VS FRIEND's wire with one seat (`docs/MULTIPLAYER.md` §Phone as controller; `js/input/phone-pad.js`).

1. Roles: the game page hosts the room (`createInvite` + `hostRoom`); the phone (`controller.html`) is the JOINER
   (`swap` + `acceptInvite`, 2.5 s gather). A late relay candidate missing from the phone's answer is the prime
   suspect for "stuck connecting".
2. QR: the pad QR opens `controller.html#pad=CODE`; the code can also be typed on a bare `controller.html`.
   The Camera/Safari advice (workflow.md step 5) is VS FRIEND only.
3. Evidence: `__apex` exists only on the game page, so `turnProbe`/`lobbyPairs` cover the host side. The phone
   page exposes `window.__apexPad` (`state()` returns `linked` and session `stats`); its `#status` text is the
   user-facing error.
4. Corporate or carrier NAT usually blocks UDP: only TURN over TCP/443 works. The shipped relay list
   (`js/net/transport.js`) carries a `:443?transport=tcp` entry; if a proxy blocks that host too, point
   `localStorage` key `apex26.turnApi` at your own credentials URL (Metered-style, see the `transport.js` comment).
5. Prove the relay leg on one machine: `npm run rtc:e2e-3p-relay` (relay-only ICE), or
   `node tools/net/rtc-e2e-3p.mjs --relay --turn=turn:host:port,user,pass` against your own TURN. It needs outbound
   TURN access, so a sandbox failure is an answer about the environment.
6. Room-code path only hangs: `node tools/net/nostr-probe.mjs` (which public relays accept an ephemeral event from
   an unknown pubkey); `rtc-e2e-room.mjs` runs the room-code path against a local relay (`nostr-local.cjs`).
7. Offline pins: `node --test tests/unit/phone-pad.test.mjs`. Steering/tilt once paired is input-controls.
