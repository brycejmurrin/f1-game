# Garage crew: AFTER THE RACE result clips (2026-10-30)

Four Blender-authored crew clips for the "home" sequence (`GarageArrival.poseHome`, the car brought
back after a race), added to `tools/gen/blender/crew-choreo.py` and regenerated into
`js/garage/crew-choreo.js`. Each is direction `in`, carries `result` (the RESULTS key it is timed
on) and `mix: false`.

| id | label | result | extra s | clip s | crew |
|---|---|---|---|---|---|
| `celebrate` | CELEBRATION CREW | win | 2.6 | 15.11 | 8: lined on both jambs, cheer the car up the lane, jump as it stops at the door, cheer it back in, then crowd round the parked car and clap |
| `applause` | PODIUM CREW | podium | 2.4 | 13.52 | 6: applause from the jambs; at park two walk to the cockpit for a high-five, the outer pairs high-five each other |
| `recover` | RECOVERY CREW | dnf | 3.0 | 17.06 | 4: two pushers ride the car's sides up the lane and back in, a caller waves it back from the jamb, then the pushers step away, the caller checks the front wing and an engineer brings a tablet to the cockpit |
| `console` | CONSOLATION CREW | finish | 3.6 | 12.3 | 4: polite applause from the jambs then heads down; a mechanic leans in with a hand on the driver's shoulder, the engineer brings the tablet |

## Decisions

- **MIX skips them.** `GarageCrewChoreo.MIX` deals only clips without `mix: false`, so the shipped
  rotation stays `current, marshal, inspect, debrief, service` in and `current, sendoff, pushout,
  check, service` out. Tested.
- **Timing is the home sequence's, at the default tuner** (door 1.8 s, CAR SPEED 1, HOLD BEAT
  default). The Python ports `RESULTS` and `timeline("home")` (`home_tl`, `car_home`). The clip spans
  `timeline.base + extra` exactly. A non-default CAR SPEED or HOLD BEAT shifts the car, but not the
  crew. The existing PUSH-OUT clip has the same limit.
- **Car-local pushers (`car='local'`).** PUSH-OUT's attachment adds the car's displacement and
  ignores its turn, but the retired car swings 90 degrees through the back-in arc. So the recovery
  pushers are keyed in the car's own frame (nose +Z) at local x = ±1.65, z = -0.9. They face the
  nose up the lane, turn toward the car at the door and face the tail for the back-in. They release
  0.14 s after park, when the car sits at the origin and the two frames coincide, so their
  after-release keys are plain bay metres. They are baked to linear 12 Hz keys, thinned (`thin`, 1 cm)
  to what linear interpolation needs.
- **The ±1.65 m pusher offset clears the DOOR eye.** The door eye sits at x -0.9, z 5.9, and anything
  that comes through the door near the car's side passes it. At ±1.35 m the body came 0.6 m from the
  eye. At ±1.65 m the clearance is 0.85 m.
- **Applying them is the parent's job.** `arrival.js` still maps RESULTS to `welcome` / `guides` /
  `current`. `settings()` accepts these ids for `enterCrew` too, and the enter picker lists them,
  because both read `IDS.in`. Played on the pit arrival's faster timing, the recovery pushers would
  not line up with the car. A picker filter on `result` is advisable.

## Checks (tests/unit/garage-crew-choreo.test.mjs)

The test runs every new clip on `poseHome` for its result, at angles left, right and cut (both lane
sides), every 0.05 s. It checks that:

- no member stands in the car footprint (2.95 + 0.25 by 1.0 + 0.25 m around the pose);
- every member stays at least 0.8 m from every CAMS eye, measured to a 0-1.8 m upright body;
- members stay inside the bay (|x| < 5.1, -6.1 < z < 6.3), except a pusher before park, which must
  stay within 2.2 m of the car's centre.

Measured minimums at angle left:

| clip | eye gap (m) | car clearance, body centre (m) |
|---|---|---|
| `celebrate` | 1.35 | 0.70 |
| `applause` | 1.63 | 0.60 |
| `recover` | 0.85 | 0.60 |
| `console` | 1.63 | 0.55 |

The existing clips' path test now skips result clips. The tablet engineer in `inspect` starts 0.4 m
from the LEFT/RIGHT eyes. That predates this work and is left unchanged.

## Authoring route

Blender 4.2.23 LTS via `tools/env/install-blender.sh` (SHA-256 verified). Before any edit,
regenerating with `--write-runtime` reproduced the committed `crew-choreo.js` byte for byte. After
the edit, the seven existing clips (marshal, inspect, debrief, sendoff, pushout, check, pit) export
JSON-identical. Only the four new clips and the source hash changed. Max hand target 0.613 m (limit
0.66). Top-down Cycles stills: `--render` into `artifacts/crew-choreo-render/` (ignored, not
committed). They draw the Empties as keyed, so the recovery pushers show in their car frame there,
not riding the car proxy. `celebrate-3.png` shows the eight-member ring round the parked car. No
browser run.
