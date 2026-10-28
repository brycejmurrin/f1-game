---
name: multiplayer-debug
description: "Use when VS FRIEND or phone-as-controller breaks: pairing, invite links, QR or room codes, WebRTC, signalling, TURN/ICE, lobby flow, or desyncing rivals. Not for: steering once paired → input-controls; AI rivals → ai-racecraft; lobby layout → ui-menu-a11y."
---

## Overview

Multiplayer has local authority for the player's own car: each peer owns itself,
the host owns AI plus race control, and the wire carries state/events rather than
host corrections.

## First evidence (every "never connects")

1. Capture BOTH sides before classifying: the lobby's status text, `__apex.logs({ns:"net"})` and
   `await __apex.lobbyPairs()` on the game page; `window.__apexPad.state()` plus `#status` on a pad.
2. TURN is NOT configured by default. `js/net/transport.js` ships `TURN_API = ""` (honest STUN-only);
   a relay exists only through `localStorage` `apex26.turnApi` (your credentials URL), `apex26.turn`
   (one static server) or the opt-in `apex26.freeTurn` (measured dead; the transport.js comment says
   why). A guest behind carrier/symmetric NAT on STUN-only never connects: check the TURN config
   before anything in `sdp.js` ([references/workflow.md](references/workflow.md) step 6).

## When to Use

Use this for:

- VS FRIEND lobby bugs, invites, answers, QR/scan, room codes, or seat selection.
- WebRTC/ICE/TURN failures, missing relay candidates, or peers stuck in
  `checking`/`connecting`.
- Multiplayer state replication, interpolation, countdown/start sync, or dropped
  rivals.
- Nostr relay/rendezvous issues, or "build mismatch"/`build_unknown` refusals at pairing.
- Tests that need the in-page loopback transport instead of a real network.
- PHONE AS CONTROLLER pairing/connection (QR scan, room code, `controller.html`
  joining over the VS FRIEND wire, `docs/MULTIPLAYER.md` §Phone as controller,
  `tests/unit/phone-pad.test.mjs`). Steering/tilt response once paired stays
  **input-controls**.

Do **not** use this for:

- Single-player physics, collisions, or AI behavior except where host authority
  changes what a guest sees.
- Career/session flow outside a networked lobby.
- Race-control internals; use `race-incidents-control` for caution logic.

## Quick Reference

| Module | Role |
|---|---|
| `js/net/transport.js` | Two channels: `state` unreliable/unordered, `event` reliable/ordered; `loopback()` is deterministic and in-page |
| `js/net/sdp.js` | Packs gathered SDP facts into a scannable invite code; round-robins candidates by kind so a relay survives the cap |
| `js/net/handshake.js` | ICE -> slim SDP -> deflate -> base64url invite; refuses mismatched builds (authoritative `apex-build` meta; `version.json` fallback only when unstamped) |
| `js/net/nostr.js` | Public Nostr rendezvous, signalling only; the relay list is its `RELAYS` array |
| `js/net/rendezvous.js` | Backup room-code courier; typed errors, never throws; no default URL — `localStorage` key `apex26.rendezvous` |
| `js/net/snapshot.js` | Fixed-size per-car snapshots, interpolation, road-following extrapolation |
| `js/net/session.js` | Clock sync, packet routing, heartbeat |
| `js/net/netplay.js` | Authority: own car never corrected; host relays guests and owns AI/race control |
| `js/net/lobby.js` | VS FRIEND UI; sequential invites; profiles filed by connection |
| `js/net/lobby-codes.js` | Paste/copy/share/scan/QR routes for invite and answer codes (`codeFrom` on pasted links) |
| `js/net/lobby-roster.js` | Stateless roster DOM leaves (team lookup, seat rows) |
| `js/net/qr.js` / `js/net/scan.js` | `NetQr` encodes the invite QR; `NetScan` reads one in-page (BarcodeDetector, else jsQR) — the phone Camera→Safari route needs neither |
| `js/net/spectate.js` | `NetSpectate` driver/spectator role policy for seats and send gates |
| `js/net/bytes.js` | `NetBytes` shared base64url/hex codecs (loads first in LAZY_NET) |
| `js/net/lobby-settings.js` | Lobby race settings (the full module list: `LAZY_NET` in `tools/manifest.cjs`) |

Hooks (`js/agent/apex-net.js`; `turnProbe` is in `js/agent/apex.js`):

| Hook | Use |
|---|---|
| `__apex.net()` | **Primary remotes/buffers inspector** — role, grid slots, clock sync, buffered packets; `{ active: false }` when solo |
| `__apex.netLoopback(opts)` | Start one-page deterministic peer session |
| `__apex.netPeerSend(state, atMs?, wireId?)` | Publish remote state into the local session |
| `__apex.netTick(nowMs?)` | Pump net session by virtual time |
| `__apex.netStartArm(nowMs, atMs?, hold?)` | Test synchronized lights-out |
| `__apex.netHostStart()` | Exercise host start scheduling |
| `__apex.netPeerClose()` / `netStop()` | Drop peer or end local session |
| `__apex.lobbyInviteAnother()` | Mint a further host invite |
| `__apex.lobbyReady(v?)`, `lobbyStart()` | Drive waiting-room controls |
| `__apex.lobbySdp()` | Inspect SDP that actually crossed |
| `__apex.lobbyPairs()` | Inspect ICE candidate-pair state |
| `__apex.turnProbe(ms?)` | Probe TURN relays with relay-only gathers |

Hook names drift: `__apex.agentHelp()` is the live manifest.

Commands:

```sh
npm run test:net-unit                                  # node, no browser: run first
node tools/ci/test-bg.mjs --spec tests/specs/multiplayer-lobby.spec.js   # ONE spec for the symptom (lobby/room/scan/seats/session/roles/npeer), backgrounded (rule 4)
node tools/ci/remote-group.mjs net                     # the whole `net` group (tests/groups.json), on the pushed branch only
node tools/net/rtc-e2e.mjs
node tools/net/rtc-e2e-3p.mjs
node tools/net/rtc-e2e-3p.mjs --relay --turn=turn:host:port,user,pass   # relay-only ICE; a bare rtc:e2e-3p-relay has no TURN (STUN-only default) and proves nothing
# Room-code / relay diagnosis (not a package.json dep — install on demand):
npm i --no-save ws @noble/curves
node tools/net/nostr-probe.mjs
```

Read first:

- `docs/MULTIPLAYER.md`
- `docs/DEBUG-HOOKS.md` multiplayer hooks section.


---

## Load on demand

- Phone pairing, corporate NAT, TURN over TCP, nostr-probe → [references/phone-nat.md](references/phone-nat.md).
- Layer-classify workflow, loopback-first, QR routes, ICE/TURN (incl. pair up but channel never opens), build mismatch, three-player star, common mistakes → [references/workflow.md](references/workflow.md).
