# Multiplayer AI replication, silence grace and rejoin (design, 2026-10-04)

Status: design accepted for implementation in the same PR (claude/net-ai-replication);
the rejoin half stays design. Evidence: the 2026-10-04 net/PWA review (#3, #5, #11)
and its verification pass.

## The problem

Every peer simulates all 18-21 AI cars locally. `NetPlay.owns(c)` is
`remotes.has(G.wireId(c))` and `remotes` held only the human rivals, so
`updateCar` (js/game.js `if (netPlay.owns(c)) …`) and the contact solver
(js/physics/collide.js, `invMass = 0` for net-owned cars) treated every AI car
as local on every screen. The fields diverge the moment an AI reacts to a human
pose that differs between screens (a local car versus the same car ~100 ms
delayed) or to a contact resolved differently on each side. Players see it as:

- a guest overtakes an AI on screen and is classified behind it, because
  `netOrder` (js/game.js) re-orders the guest's result to the host's verdict;
- CAUTION flags arrive for host-side AI incidents that never happened on the
  guest's screen (netplay.js applies the host's CAUTION);
- different AI retirements on each screen (results-sheet.js already patches
  the guest's sheet from the host verdict).

`docs/MULTIPLAYER.md` said "the host additionally owns the AI", which was true
of authority (race control, classification) but not of the poses.

## Decision

THE HOST OWNS THE AI POSES, AND PUBLISHES THEM.

| | today | after |
|---|---|---|
| who simulates an AI car | every peer | the host only |
| what a guest draws for an AI car | its own simulation | the host's pose, interpolated like a human rival |
| packet | own car 20 Hz; relays one datagram per car per guest | own car 20 Hz; ONE aged packet per guest per publish carrying the relayed humans every tick and the AI every other tick (10 Hz) |
| AI contact on a guest | resolved locally, both cars move | the AI car is net-owned (`invMass 0`), as a human rival already is: the guest's own car takes the whole response |
| AI reliability (DNFs) | each peer arms its own | the host's: guests apply the host's `seed`/`round` from SETTINGS already (lobby.js), and a guest never runs `updateCar` for a replicated AI car, so no local DNF can fire |

### Wire format

The AGED snapshot (`NetSnapshot.TYPE_AGED`, type byte 2, added with the relay
batching in claude/netcode-polish): header `[type u8][tick u32][count u8]`,
then per car the existing 13-byte record plus a `u16` age in ms behind the
header tick. AI entries ride in the same packet as the relayed humans, so the
host still sends ONE datagram per guest per publish.

Size: 21 AI × 15 B = 315 B, + up to 3 relayed humans (45 B) + 6 B header =
366 B — one datagram, well under the ~1 200 B safe SCTP payload. (The review's
273 B was 21 × 13 B without the age.) At 10 Hz that is ~3.7 KB/s per guest of
AI, against ~0.3 KB/s for one human rival at 20 Hz.

Why 10 Hz for AI and 20 Hz for humans: AI cars follow the racing line and
change speed smoothly; the interpolation buffer's adaptive delay already
covers a 100 ms interval (`lag + interval + margin`), and extrapolation runs
along `s`, which follows the road by construction.

### Compatibility

No old client can receive the new packet: `NetHandshake.checkBuild` refuses
any build mismatch (or an unknown build) at pairing, in both `acceptInvite`
and `acceptAnswer`, and NetPlay's MODEL event refuses a different physics
revision at race start. A build that predates type 2 would also drop it as an
unknown type (`decodeSnapshot`), which degrades to today's behaviour (local AI)
rather than mis-posing anything. No version field is bumped: the type byte is
the version.

### Guest side

At `start()` a guest seats every car that is neither its own nor a human
rival's slot as a HOST-OWNED remote (`remotes` entry with `hostAi: true`,
`G.setCarRole` untouched — the car stays `human: false`). `owns()` is then true
for it, so `updateCar` skips it and `poseRemote` poses it from the host's
packets, exactly as for a human rival. Contact uses `predict()`, as for humans.

If the host leaves, `handBackToAI(null)` returns every remote, AI included, and
the guest's local AI resumes from the last posed state ("HOST LEFT — RIVALS NOW
AI", unchanged).

### Host side

`tick()` appends every car that is not local, not a human rival and not net-owned
to each guest's aged packet on every second publish. Each AI entry is stamped
with the frame's pose time (the same `poseAt` the own-car snapshot uses).

## Silence grace

A 6 s silence used to end a peer for good (`NetSession` `timeoutMs`), and the
car went to the AI. That is right in the lobby and wrong mid-race on a phone:
answering a notification on iOS suspends the page. In a race:

- the session's silence timeout is `RACE_GRACE_MS` = 25 s (`NetSession.setTimeoutMs`);
- a rival silent for more than `STALE_MS` = 2 s is driven by the LOCAL AI
  (`owns()` false, `G.setCarRole(car, false, false)`), so it never stands on the
  racing line as an immovable obstacle;
- when its packets resume within the grace, it is net-owned again and snaps to
  its real pose;
- after 25 s the session times out and the car is the AI's for good, as today
  ("RIVAL DISCONNECTED"; the host broadcasts LEFT).

A transport that CLOSES (ICE failed, the tab closed) still ends the peer at once:
the grace covers silence on a live connection, not a dead one.

## Rejoin by room code (design only)

Not built here; the pieces it would use:

1. At START the host issues each guest a random 16-byte rejoin token over the
   reliable channel, bound to the guest's wire id.
2. During a race the host keeps its room code open in REJOIN mode (sealRoom
   today closes it): `onJoiner` accepts an answer whose HELLO carries a valid
   token, and nothing else.
3. The new session is bound to the old wire id (`peerCar.set(id, wireId)`); the
   slot leaves its stale/AI state and is posed from the wire again.
4. A rejoin after the grace re-seats the player as a SPECTATOR (`start()`
   already tolerates slotless peers) — the car stays the AI's, so the race the
   others drove is never rewritten.

## Tests

`tests/unit/net-authority.test.mjs`: the host publishes AI poses at 10 Hz in
the aged packet and never the guests' own cars; a guest seats AI as host-owned
remotes and poses them from the packet; a silent rival goes to the local AI
after `STALE_MS` and back to the wire when packets resume; the race session
timeout is the grace. Browser proof (multiplayer-npeer, multiplayer-session,
multiplayer-room, tools/net/rtc-e2e*.mjs) runs in CI / by hand.
