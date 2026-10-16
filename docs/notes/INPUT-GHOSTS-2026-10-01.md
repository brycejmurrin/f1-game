# Local deterministic input ghosts (2026-10-01)

## Goal

Record Time Trial controls at the fixed physics timestep together with the sim
seed and a physics/build stamp, so a local ghost can be re-simulated open-loop.
Online leaderboards and backends stay out of scope.

## What already existed

| Piece | Role |
|---|---|
| `js/car/ghost.js` | Pose samples at 20 Hz (`t/s/x`) — visual PB + translucent draw |
| `js/car/ghost-share.js` | Portable APXG1 pose envelopes for a guest rival |
| `js/race/session-records.js` | Comparable-class fingerprint + TT sample/finish |
| `PhysicsConsts.FIXED_DT` / `simSeed` / `__apex.setInput` | Fixed step, seed, injectable inputs (used by tests) |
| `js/race/real-replay.js` | OpenF1 broadcast puppets — **not** local ghosts |

Pose ghosts stay the cheap visual path (version-tolerant). They do **not**
store inputs, seed, or a build stamp.

## Design

New module `js/car/input-ghost.js` (`InputGhost`), loaded after `ghost-share`
in `tools/manifest.cjs`:

- **Record** every `PHYS_DT` sample while TT is clean (`records.sample(c, inp)`):
  quantized steer (`int8`, ×127) + throttle/brake flags.
- **Envelope:** `{ v:1, kind:"input-ghost", track, seed, physRev, build, dt,
  time, steer[], flags[], context?, meta? }` under `apex26.inputGhost.v1`
  (256 KiB budget, separate from pose `ghost.v1`).
- **Compatible replay** requires matching `PhysicsConsts.REVISION`,
  `FIXED_DT`, and `__APEX_BUILD` (build `0` = unstamped harness, accepted).
- **API:** `atStep(i)` / `beginReplay()` / `next()` for driving a future
  physics ghost car via `c.netInput`. Visual TT ghost remains pose `Ghost.at`.

## Wiring

- `SessionRecords.begin/sample/finish` arms and finishes InputGhost beside Ghost.
- `restartTTRecorders()` in `js/game.js` restarts both after an invalid / reverse
  line cross.
- The `InputGhost` global (manifest IIFE) is the API surface for tests and a
  follow-up physics ghost car (`beginReplay` / `next` → `c.netInput`).

## Tests

- `tests/unit/input-ghost.test.mjs` — record, PB gate, persistence, version
  refuse, source wiring pins.
- `tests/unit/input-ghost-replay-vm.test.mjs` — packed tape → `setInput`+`step`
  is byte-identical under one seed.

## Out of scope (v1)

- Spawning a second colliding/non-colliding physics car in the TT field
  (pose draw covers the visual; `next()` is ready for a follow-up).
- Sharing input ghosts over APXG1 / `#ghost=` (pose share stays).
- Online boards / lockstep netplay.
