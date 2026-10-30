# Garage camera rigs (Blender-authored), 2026-10-30

Moving cameras for the garage sequences: moves a fixed eye (`GarageArrival.CAMS`)
cannot do. Authored as animated Blender cameras by
`tools/gen/blender/garage-camera-rigs.py`, sampled, and written into the
`// @blender-rigs:start` / `:end` block of `js/garage/arrival.js` (with the
script's SHA256). `rigSample(id, dir, u, side = 1)` next to it returns
`{ eye, aim, fov }`; `RIG_IDS` and `RIG_LABEL` list them. Wiring them into the
angle presets and the exports is the integrating PR's job.

## The rigs (lane side +1; side -1 mirrors x)

| id | label | in / home (pit stop, after the race) | out (race start) |
|---|---|---|---|
| `crane` | CRANE | low by the door (y 0.45) watching the lane, then rises to 3.35 m over the car as it backs in and parks, fov 60 → 48 | high over the parked car, drops to floor level by the door as it rolls out, holds low on the lane |
| `orbit` | ORBIT | an eye on a keyed pivot (radius 4.4 m about (0, 0.5)) circles 90° (35° → 125° from +Z toward +X) round the bay while the car backs in | the same circle the other way as it rolls out |
| `dolly` | DOLLY | on a track at x ≈ 3, from the door (z 5.5) back to z 0.4 alongside the car as it backs in | from z -1 to the door (z 5.6) alongside the car as it drives out |
| `rear` | REAR TRACK | from the back of the bay, looking out the door; pulls back and up (z -4.6 → -5.7, y 1.3 → 1.9, fov 52 → 44) as the car reverses toward it | from the back wall, pushes low behind the car to z ≈ 2.4 as it leaves |

Eye keys sit on the sequence's own beats (shutter open, car stopped, back-in
start, parked; or roll, doorway, gone), read off the real poses. The aim Empty
is keyed every 0.25 s on the car path (clamped like `aimAt`, blending off the
shutter over 1.8 s around the door beat). All keys BEZIER / AUTO_CLAMPED.

## Regenerate

```sh
python3 -m venv <scratch>/bpyenv && <scratch>/bpyenv/bin/pip install bpy==5.2.3
<scratch>/bpyenv/bin/python tools/gen/blender/garage-camera-rigs.py -- --output-dir artifacts/garage-camera-rigs --write-runtime
```

(`blender -b --python … -- …` works too.) The script runs
`node tools/garage/arrival-poses.mjs --dir all --angle left --fps 24` itself
(or takes `--poses <json>`), writes `artifacts/garage-camera-rigs/{poses.json,
garage-camera-rigs.json,garage-camera-rigs.blend}`, and asserts every eye
inside x (-5.2, 5.2), y [0.3, 3.6], z (-6.2, 6.1) and no eye step ≥ 1 m between
samples. `tests/unit/garage-camera-rigs.test.mjs` re-checks bounds and
smoothness through `rigSample` at u step 0.01 and fails when the block's SHA256
is not the script's.

## Measured (2026-10-30, bpy 5.2.3 LTS module, Python 3.13)

- 49 samples per rig per sequence (u step 1/48: 0.18 s on "in" 8.7 s, 0.26 s on
  "home" 12.5 s); 4 rigs × 3 sequences × 49 × 7 integers (cm, 0.1°). It was 65 until
  the eager shell went 1,295 bytes over `MAX_EAGER_BYTES` (`boot-load-budget.test.mjs`);
  49 keeps the generator's own check (worst eye step 0.85 m < 1.0; 41 samples gives 1.02). The merge
  ref still sat 1,648 bytes over after the tip grew, so the block is now packed: each integer as two
  base64url characters (+2048), unpacked once at load (15.9 KB → 9.2 KB; all 4,116 values identical).
- Largest eye step between samples: 0.64 m (rear, out, t 4.45 s).
- Car framing (off-axis angle / half fov while the car is inside the bay):
  ≤ 0.42 on in/home, ≤ 0.81 on out after the shutter (crane, at the doorway).
- Timing is authored against crew `current` and result `win`: the sampled aim
  follows the car of THAT duration. A crew with `extra` seconds or another
  result stretches `u`, so the aim leads or lags the car by up to that share.
- Not rendered: no contact sheet (`--render` not implemented), no browser look.

## Integration follow-up (parent, 2026-10-30)

- 844×390 captures of ORBIT on a win put a CELEBRATION crew member's head in the lens: the rigs were authored before the result crews existed. `clearOfCrew` in `js/garage/arrival.js` now lifts a rig's eye over any Blender crew member within 2.4 m (eased to head height, then up to 1.3 m over heads within 1.2 m). Every rig × result crew stays ≥ 0.8 m clear; the worst eye step is 0.43 m per 50 ms, when a celebration member sprints through the dolly's eye (`garage-crew-choreo.test.mjs`).
- Crane-in's keys moved from x 1.6 to x 2.4–2.7 and the rigs were regenerated with bpy 5.2.3. At 1.6 the RECOVERY pushers walked under the low lens.
- Past the shutter shot, the aim eases onto the live car instead of the baked aim, so a crew's extra seconds or a result's slower drive cannot leave the car out of frame.
- The eye now keeps its beats as well as the aim. `rigU` warps t piecewise across the sequence's own beats onto the authored timing (crew "current", a win): shutter, lane stop, pause, back-in and end. Before that, u = t / duration let a slow RETIRED push leave the DOLLY in the bay while the car was still out in the lane. The authored timing maps to itself, and the drive-out keeps t / duration (`garage-arrival.test.mjs`, "keep their beats").
- The DOLLY's pit / after-race start moved from x 3.0 to x 1.7–2.0, inside the 5.4 m door aperture. At 3.0 the jamb covered half the frame while the car was in the lane.
