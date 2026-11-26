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
2. TURN is NOT configured by default. `js/net/ice.js` ships `TURN_API = ""` (honest STUN-only);
   a relay exists only through `localStorage` `apex26.turnApi` (your credentials URL), `apex26.turn`
   (one static server) or the opt-in `apex26.freeTurn` (measured dead; the ice.js comment says
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

Module roster (`js/net/*`: transport, sdp, handshake, nostr, rendezvous, snapshot, session, ice, interp, netplay, lobby*, qr, scan, spectate, bytes) and the `__apex` net/lobby hook table →
[references/modules-hooks.md](references/modules-hooks.md). Primary inspector: `__apex.net()`.

Hook names drift: `__apex.agentHelp()` is the live manifest.

Commands:

```sh
npm run test:net-unit                                  # node, no browser: the wire logic, run first (the floor is AGENTS.md rule 3)
node tools/ci/pick-tests.mjs                           # which groups the change needs
# the browser `net` specs run in the PR's own CI (rule 5: never locally); a whole group is Bryce's opt-in
# The real-RTC scripts (tools/net/rtc-e2e*.mjs) boot Chromium: a PARENT-session diagnosis aid, never a pre-push step or a subagent's (rule 10).
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
