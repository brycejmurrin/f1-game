# Brake-cue calibration against the AI brakeTarget — 2026-10-27 (#2177)

**Decision:** `conditionCues` defaults **ON**. Bryce delegated the call (worker brief, 2026-10-27: "decide, record it,
proceed"); this note is the record. The checkbox (`pm-condition-cues`) still turns it off, and an explicit stored
`false` is honoured.

## What changed

- `BrakeCue.conditionCapacity` now also returns `df` = `PhysicsConsts.DOWNFORCE`. `urgencyOf(…, df, vTop)` solves the
  corner speed with the aero load the car carries AT the corner's speed, `k·v² = lat·(1 + df·(v/vTop)²)`. That is the
  AI planner's envelope (`AiDrive.cornerSpeed`). With `df` 0 or absent it is the old `sqrt(lat·R)`, bit for bit.
- Condition-aware, the lookahead is multiplied by `BRAKE / brake`, so the slider's seconds of warning count from the
  braking point. A wet stop is that much longer, so without the factor the same `lookSec` saw the corner too late.
- `DrivingCues` (the driving-line audio cue) carries the same two changes, and the identity test keeps both
  `urgencyOf` copies equal.

This reverses one part of the 2026-10-16 Merge Desk call, (b): "no aero-aware early quiet". The data below is why.
Without the aero term the condition-aware cue in the rain calls 8 times a lap at Monza on corners the car takes flat,
such as Curva Grande. A cue that beeps at a driver who is doing it right is a cue they switch off
(`driving-line.js` §cue). The estimate still never adds grip from banking, an upgraded setup or `PLAYER_GRIP`, and the
condition scalars still only lower grip.

## Method

`node tools/check/brake-cue-calibrate.mjs [--track <id>] [--notch 6] [--json]` (VM, deterministic). A probe car rides
the lap at `vTop()` (60.5 m/s, the shipped PACE). Every 2 m the tool runs the real `BrakeCue.tick()` (stepped clock,
notch 6) and `AiDrive.brakeTarget()` for an ideal driver: skill 1, no style, attack or optimism, on the player's
slicks, with game.js's grip and brake scaling (`brake × gmC/gm0`). The margin is the reference braking point minus the
cue's first call, in metres. A positive margin means the cue calls earlier than the reference driver brakes. A flat
call is a corner where the cue fires and the reference never brakes within 300 m.

It is a point-mass sweep, not a driven lap: the cue sees the speed it would have arriving flat out, its worst case.

## Results (notch 6, slicks)

| track | weather | conditionCues | ref points | late calls | min / median / max margin (m) | flat-call corners |
|---|---|---|---|---|---|---|
| monza | dry | off (old default) | 8 | 0 | 12 / 26 / 50 | 0 |
| monza | dry | **on** | 8 | 0 | 10 / 24 / 46 | 0 |
| monza | rain | off | 7 | **4** | −24 / −10 / 12 | 0 |
| monza | rain | **on** | 7 | 0 | 8 / 22 / 44 | 0 |
| silverstone | dry | off | 15 | 0 | 16 / 38 / 82 | 2 |
| silverstone | dry | **on** | 15 | 0 | 0 / 36 / 74 | 0 |
| silverstone | rain | off | 13 | **3** | −20 / 24 / 296 | 1 |
| silverstone | rain | **on** | 13 | 0 | 12 / 32 / 66 | 0 |
| spa | dry | off | 12 | **1** | −46 / 32 / 80 | 2 |
| spa | dry | **on** | 12 | 0 | 6 / 30 / 74 | 1 |
| spa | rain | off | 19 | **5** | −20 / 16 / 204 | 0 |
| spa | rain | **on** | 19 | 0 | 2 / 26 / 88 | 0 |

Condition-aware, the cue calls before the reference driver brakes at every braking point measured, dry and wet, with
a median lead of 22–36 m (about 0.4–0.6 s at vTop). In the dry it calls slightly later than before, because the aero
term trims some early calls. In the rain on slicks it moves from up to 46 m late to always early. Flat calls fall from
2 corners to at most 1.

Before the fix, in the same rain run on Monza, the estimate without the aero term or the lookahead factor gave 2 late
calls (down to −16 m) and 8 flat calls a lap. Adding the aero term alone left 4 late calls (down to −18 m), which were
the lookahead clamp: notch 6 looks 90 m and the wet stop needs about 117 m. Adding the `BRAKE / brake` lookahead
factor gave the row above.

Notch 2 (0.7 s) is late everywhere by construction, whatever the setting: the player chose a short warning. At
notch 2, `conditionCues` still moves the rain median from −50 m to −34 m.

## Pins

`tests/unit/brake-cue.test.mjs`:

- **row 1:** at the same corner and speed, rain on slicks is more urgent than the dry.
- **row 2:** at top speed, a corner taken flat on aero load stays under `URGENCY_GATE`, dry and rain, while a hairpin
  still calls.
- At `df` 0 the corner speed is the bare `sqrt(lat·R)`, bit-identical.
- The wet lookahead reaches a corner the dry one does not yet see.
- The default is ON.
