# Scenery hard rules — rejection, footprint, vertex budget

Load this when a prop vanished, clipped the racing line, or a dress grew
the mesh a lot. Placement model + helper families stay in SKILL.md.

## Survey before placing

Grep existing dressing at the target frac in `js/circuits/scenery/<id>.js` and read
`docs/tracks/<id>.md`. Montreal floating trees: the circuit already ships
`flatTerrain: true` + `terrainOuter: 70` — survey first (**survey-track**).

## Frames: which `k` an emitter expects

A shifted circuit (`sceneryStartFrac`, or `reverse`) has TWO node frames — the
authored one the closure is written in, and the engine one the built centreline
uses. `def._sceneryShift` is the single arc number between them.

- **Racing frac → authored frac.** A frac read off a rendered lap or `__apex`
  hook is the engine frame; `docs/tracks/<id>.md` tables and `circuits/scenery/<id>.js`
  literals are authored. Engine ≈ (authored + `def._sceneryShift`) mod 1 (Spa: shift
  0.958, so Blanchimont racing 0.862 ≈ authored 0.904). Print it: build with
  `tools/lib/track-build-vm.cjs` `buildContext()`, read `def._sceneryShift`.
- **`K(s)` is authored-frame and passes straight through.** Never pre-shift it.
  The wrapped `(k, side, …)` helpers (`anchor`, `tree`, `place`, `building`, …)
  apply the shift themselves, exactly once.
- **`along()` hands authored-frame `k` to the callback** (fixed 2026-09-24 —
  `sceneryNodeToAuthored`). Wrapped helpers inside an `along` span apply the
  shift once. Table reads like `blocked(k / n)` still need care: prefer
  authored fracs / `K(s)` when testing against authored windows.
- **`bakedModel(id, k, side, dist, opts)` remaps correctly on shifted
  circuits** (dedicated `(id, k, side)` wrapper in `transformSceneryApi`).
  Always keep `if (!bakedModel(...)) …` anyway.
- **`every()` is full-lap**, so its double phase only moves which node a hash
  lands on — harmless for authored-frame tables, NOT for a table re-keyed into
  the engine frame (a `CLEAR`/exclusion list written through an `sl()` helper).

## On-track rejection

Every primitive emitter (`addBox`/`addCyl`/…) is wrapped in a Minkowski test
against the road half-width (`rejBox` / `onRoadHit`). If a prop's **full
oriented footprint** covers tarmac at **any** node it rises above, the
**entire shape is dropped**. Too-close props silently vanish — increase
`dist`/`gap`.

- **Console warning is not universal.** Composite helpers (`building`,
  `tree`/`pine`/`palm`, `wall`/`fence`/`guardrail`, `tower`, `billboard`,
  `grandstand`, …) call `noteSuppressed` (`js/track/scenery/build-props.js`): the
  `<name> SUPPRESSED at k=…` line is `Log.debug` only; a normal build logs one
  build-end `Log.warn("scenery", "<id>: suppressed <kind>=<n> …")` — counts per
  kind (`verify-track` prints them as `guard drops`). Raw primitives only
  increment `_culled` and log `Log.info("track", "<id>: culled N on-track primitive(s)")`
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
  One track: `TRACK=<id> PORT=<p> node tools/track/measure-props-over-road.mjs --shots`.

## Terrain anchoring

`place`/`prop`/`anchor` sit on raycast terrain when available, else
`groundYAt`. Props >120 m out or on street circuits can float/sink — pull
them in or use `anchor()` and read `c[1]`.

## Reverse circuits

When `reverse: true`, the engine auto-flips `side`; author in the original
trace direction.

## Vertex budget — increment, not a ceiling

Shipped circuits run roughly **170k–690k** prop verts (`verify-track --all`,
2026-10-05: catalunya ~170k, spa ~191k, zandvoort ~343k, suzuka ~360k, monaco
~376k, watkins_glen ~491k, miami ~586k; **mexico ~692k is the current ceiling —
do not grow it**). Rule:
`verify-track.cjs <id>` before and after; keep the edit at or below the existing count unless you can say why.
`every(20)` for sparse features, `every(5)` only for hero sections; jitter
with `hash()`; double-place at two distances instead of doubling density.

## Overhead landmarks

Bridges/flyovers need clearance — a low `place()`/`building()` can hit the
deck from below.

## Trees/lamps

Must never call `blockAt`/`markBarrier` — they would shrink the driving
boundary. Keep furniture clear of the collision edge.
