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

Commands:

```sh
npm run test:net-unit
node tools/ci/test-bg.mjs net
node tools/net/rtc-e2e.mjs
node tools/net/rtc-e2e-3p.mjs
```

Read first:

- `docs/MULTIPLAYER.md`
- `docs/DEBUG-HOOKS.md` multiplayer hooks section.


---

## Load on demand

- Layer-classify workflow, loopback-first, ICE/TURN, three-player star, common mistakes → [references/workflow.md](references/workflow.md).
