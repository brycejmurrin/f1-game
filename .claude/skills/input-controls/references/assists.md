# Assists and steering sliders

| Store / slider | Effect |
|---|---|
| `drivingHelp` | ROAD_FOLLOW gain via `helpFromSlider` — stored default 1 = OFF (gain 0) |
| `raceLine` (slider id `pm-line`) | pull to line / push wide; 0 = off. `G.raceLineAssist = raceLine / 5` |
| `adaptiveButtons` | digital-steer rate half of SPEED STEER (keys + on-screen arrows). v1 = OFF, **unset default 5**; migrated since STEER_SCHEMA step 4. The drag range follows the same mix when DRAG AT SPEED (`touchDragSpeed`, default 1 = OFF; `def` in `settings-export.js`) is above OFF. Not the stick or tilt |
| `brakeCue` | pulse-rate brake warning. v1 = OFF, unset default 1. Never writes throttle/brake |
| `gripSteer` (slider `pm-gripsteer`) | GRIP STEER: notch 1 = OFF. This skill owns the slider, its default and migration only; the cap maths, A/B and which lock it receives (the shaped `og.shaped`, so expo/maxSlip reach it) are **tune-physics** |
| `STEER_SCHEMA` | per-version migration ladder in `steer-tuning.js` — do not flatten to one gate |

The STEER LOCK / LINEARITY / SPEED STEER sliders (`maxSlip` / `expo` / `speedRef`) are owned here as player
settings; **tune-physics** owns them only as `setPhysics` A/B knobs.

## Changing a default

Changing an assist **default** does not reach existing players (`store.get` keeps the stored value). A new default
and a stored-value migration are different acts — both are usually needed: add a `STEER_SCHEMA` step. See
`docs/PHYSICS.md` (road-follow) and `tests/specs/steer-migration.spec.js`.
