# Scenery hard rules — rejection, footprint, vertex budget

Load this when a prop vanished, clipped the racing line, or a dress grew
the mesh a lot. Placement model + helper families stay in SKILL.md.

## Survey before placing

Grep existing dressing at the target frac in `js/circuits/<id>.js` and read
`docs/tracks/<id>.md`. Montreal floating trees: the circuit already ships
`flatTerrain: true` + `terrainOuter: 70` — survey first (**survey-track**).

## On-track rejection

Every primitive emitter (`addBox`/`addCyl`/…) is wrapped in a Minkowski test
against the road half-width (`rejBox` / `onRoadHit`). If a prop's **full
oriented footprint** covers tarmac at **any** node it rises above, the
**entire shape is dropped**. Too-close props silently vanish — increase
`dist`/`gap`.

- **Console warning is not universal.** Composite helpers (`building`,
  `tree`/`pine`/`palm`, `wall`/`fence`/`guardrail`, `tower`, `billboard`,
  `grandstand`, …) `Log.warn("scenery", "<name> SUPPRESSED at k=…")`. Raw
  primitives only increment `_culled` in `js/track/tracks.js` and log a
  single build-end `Log.info("track", "<id>: culled N on-track primitive(s)")`
  — a count, not a location.
- **Circuit-inline `onTrack(x, z, margin)`** is a single-point guard. It
  does not prove the full footprint is clear. If a bespoke shape vanishes
  or clips, check for a single `onTrack()` vs `rejBox(...)` over the widest
  section.
- **New composite emitters** must use `rejBox(centre, [w,h,d], basis)` over
  the widest section — not one `onTrack()` point. The "props over the racing
  line" bug was `building()`/`neonTower`/masts testing an inner-face point
  on a curving street.
- **`RAW.*` bypasses the guard.** Crowd spectators via `RAW.addBox` are not
  footprint-tested; only place them behind a shell.
- **Regression:** `tests/specs/props-over-road.spec.js` (in `test:circuits`).
  One track: `TRACK=<id> PORT=<p> node tools/measure-props-over-road.mjs --shots`.

## Terrain anchoring

`place`/`prop`/`anchor` sit on raycast terrain when available, else
`groundYAt`. Props >120 m out or on street circuits can float/sink — pull
them in or use `anchor()` and read `c[1]`.

## Reverse circuits

When `reverse: true`, the engine auto-flips `side`; author in the original
trace direction.

## Vertex budget — increment, not a ceiling

Shipped circuits run **400k–900k** prop verts (monaco ~493k, zandvoort
~532k, watkins_glen ~680k, suzuka ~685k). **vegas ~1.8M is the known
ceiling — do not grow it.** Rule: `verify-track.cjs <id>` before and after;
keep the edit at or below the existing count unless you can say why.
`every(20)` for sparse features, `every(5)` only for hero sections; jitter
with `hash()`; double-place at two distances instead of doubling density.

## Overhead landmarks

Bridges/flyovers need clearance — a low `place()`/`building()` can hit the
deck from below.

## Trees/lamps

Must never call `blockAt`/`markBarrier` — they would shrink the driving
boundary. Keep furniture clear of the collision edge.
