# Assists and steering sliders

| Store / slider | Effect |
|---|---|
| `drivingHelp` | ROAD_FOLLOW gain via `helpFromSlider` |
| `raceLine` (slider id `pm-line`) | pull to line / push wide; sets `G.raceLineAssist` |
| `adaptiveButtons` | digital-steer rate half of SPEED STEER (keys + on-screen arrows). migrated by a STEER_SCHEMA step. The drag range follows the same mix when DRAG AT SPEED (`touchDragSpeed`) is above OFF. Not the stick or tilt |
| `brakeCue` | pulse-rate brake warning. Never writes throttle/brake |
| `gripSteer` (slider `pm-gripsteer`) | GRIP STEER. This skill owns the slider, its default and migration only; the cap maths, A/B and which lock it receives (the shaped `og.shaped`, so expo/maxSlip reach it) are **tune-physics** |
| `STEER_SCHEMA` | per-version migration ladder in `steer-tuning.js` — do not flatten to one gate |

## Changing a default

Defaults are the `store.get` fallbacks in `applySteerTuning` (`steer-tuning.js`) and `def` in `settings-export.js`.
Changing an assist **default** does not reach existing players (`store.get` keeps the stored value). A new default
and a stored-value migration are different acts — both are usually needed: add a `STEER_SCHEMA` step. See
`docs/PHYSICS.md` (road-follow) and `tests/specs/steer-migration.spec.js`.
