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
4. Corporate or carrier NAT usually blocks UDP: only TURN over TCP/443 works. NO relay ships: the default
   is STUN-only (`TURN_API = ""` in `js/net/ice.js`). Point `localStorage` key `apex26.turnApi` at your
   own credentials URL (Metered-style) or `apex26.turn` at your own server; the free `:443?transport=tcp`
   relays sit behind the opt-in `apex26.freeTurn` and were measured dead (the ice.js comment;
   `docs/MULTIPLAYER.md`, `docs/DEBUG-HOOKS.md` TURN rows).
5. Prove the relay leg on one machine: `node tools/net/rtc-e2e-3p.mjs --relay --turn=turn:host:port,user,pass`
   against your own TURN. A bare `npm run rtc:e2e-3p-relay` sets relay-only with no TURN server, so on the
   STUN-only default it always fails and proves nothing. It needs outbound
   TURN access, so a sandbox failure is an answer about the environment.
6. Room-code path only hangs: first `npm i --no-save ws @noble/curves` (one-off; not in
   `package.json`), then `node tools/net/nostr-probe.mjs` (which public relays accept an ephemeral
   event from an unknown pubkey); `rtc-e2e-room.mjs` runs the room-code path against a local relay
   (`nostr-local.cjs`).
7. Pad feels laggy or stalls: the send cadence is anchored on `HEARTBEAT_MS` in `js/input/phone-pad.js` (read the
   current rule there, it has changed). Evidence is the pad's `stats()` — `sent`, `queued`, `expired`,
   `rejected` — plus the `HEARTBEAT_MS` beat; compare `sent` against the phone's input rate before blaming the network.
8. Offline pins: `node --test tests/unit/phone-pad.test.mjs`. Steering/tilt once paired is input-controls.
