---
name: multiplayer-debug
description: "Use when VS FRIEND, WebRTC connection, invite links or QR codes, room codes, Nostr signalling, TURN/ICE, build handshakes, replicated rivals, multiplayer lobby flow, or net determinism is being debugged."
---

## Overview

Multiplayer has local authority for the player's own car: each peer owns itself,
the host owns AI plus race control, and the wire carries state/events rather than
host corrections.

## When to Use

Use this for:

- VS FRIEND lobby bugs, invites, answers, QR/scan, room codes, or seat selection.
- WebRTC/ICE/TURN failures, missing relay candidates, or peers stuck in
  `checking`/`connecting`.
- Multiplayer state replication, interpolation, countdown/start sync, or dropped
  rivals.
- Nostr relay/rendezvous issues.
- Tests that need the in-page loopback transport instead of a real network.

Do **not** use this for:

- Single-player physics, collisions, or AI behavior except where host authority
  changes what a guest sees.
- Career/session flow outside a networked lobby.
- Race-control internals; use `race-incidents-control` for caution logic.

## Quick Reference

| Module | Role |
|---|---|
| `js/net/transport.js` | Two channels: `state` unreliable/unordered, `event` reliable/ordered; `loopback()` is deterministic and in-page |
| `js/net/sdp.js` | Packs gathered SDP facts into a scannable invite code; retains relay candidates first |
| `js/net/handshake.js` | ICE -> slim SDP -> deflate -> base64url invite; refuses mismatched `version.json` builds |
| `js/net/nostr.js` | Public Nostr rendezvous, signalling only |
| `js/net/rendezvous.js` | Backup room-code courier; typed errors, never throws |
| `js/net/snapshot.js` | 13 B/car snapshots, interpolation, road-following extrapolation |
| `js/net/session.js` | Clock sync, packet routing, heartbeat |
| `js/net/netplay.js` | Authority: own car never corrected; host relays guests and owns AI/race control |
| `js/net/lobby.js` | VS FRIEND UI; sequential invites; profiles filed by connection |

Hooks:

| Hook | Use |
|---|---|
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

Commands:

```sh
npm run test:net-unit
node tools/test-bg.mjs net
node tools/rtc-e2e.mjs
node tools/rtc-e2e-3p.mjs
```

Read first:

- `docs/MULTIPLAYER.md`
- `docs/DEBUG-HOOKS.md` multiplayer hooks section.

## Workflow / Implementation

1. **Classify the failure by layer.**
   - Lobby/UI: invite buttons, ready/start, seats, QR/scan.
   - Signalling: invite/answer strings, Nostr or room-code rendezvous.
   - ICE/TURN: candidates crossed, relay availability, nominated pair.
   - Game wire: snapshot ids, authority, interpolation, countdown/start.

2. **Prefer loopback before a browser/network run.**
   - Use `NetTransport.loopback()` via `__apex.netLoopback()` to remove real ICE
     and wall-clock timing.
   - Pass `nowMs`, then drive `__apex.netTick(nowMs)` explicitly.
   - Inject latency/jitter/loss only after the zero-latency path is understood.

3. **Preserve authority boundaries.**
   - A player's own car is never corrected by the host.
   - Remote cars are posed from replicated state; local physics must early-out
     when `netPlay.owns(c)` is false.
   - The host owns AI and race control and relays guest snapshots without
     changing authority.
   - Key rivals by content-derived ids (`wireId` / driver id), not `cars[]`
     index; grids can differ by player.

4. **Debug signalling as data crossing, not local gathering.**
   - `lobby().wire.candidates` and `turnProbe()` describe local gather.
   - `lobbySdp().remoteTypes` answers what the peer actually received.
   - If remote SDP has no `relay`, inspect SDP packing/truncation and make sure
     ICE prefetch completed before `RTCPeerConnection` construction.

5. **Debug ICE with candidate pairs.**
   - Run `await __apex.turnProbe()` first: no relay and dead relay are different
     fixes.
   - If relays exist but no connection forms, use `await __apex.lobbyPairs()`.
   - `recv: 0` across pairs means checks leave but no answer returns; a
     succeeded-but-not-nominated pair means something else ended first.

6. **Respect build handshakes.**
   - Handshake refuses mismatched `version.json` builds because physics/track
     constants can differ.
   - If JS/CSS changed, use `bump-cache`; stale builds can make peers unable to
     connect by design.

7. **Verify in order.**
   - Run `npm run test:net-unit` before any browser group; it covers transport,
     SDP, rendezvous, QR, snapshot, and session contracts.
   - Run `test:net` in the background through `tools/test-bg.mjs`.
   - Use real RTC scripts only for browser/ICE behavior that loopback cannot
     exercise.

## Common Mistakes

- Fixing a guest by correcting the local player's car from host state; that
  violates the authority model.
- Using `cars[]` index across peers; custom-team selection can change grid
  length/order.
- Treating local candidate counts as proof that the peer received relay
  candidates; inspect `lobbySdp().remoteTypes`.
- Building `RTCPeerConnection` before awaiting ICE server prefetch; servers are
  fixed at construction.
- Letting Nostr or room-code failures throw through the lobby; rendezvous errors
  must be typed so the UI can fall back to link/QR.
- Creating several host invites simultaneously; the lobby intentionally makes
  invites sequential so pasted answers are matchable by humans.
- Running browser net tests before `test:net-unit`, making deterministic unit
  failures look like WebRTC flake.
- Forgetting `version.json` in build handshakes after JS/CSS edits.
