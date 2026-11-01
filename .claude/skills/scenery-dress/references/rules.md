# Scenery hard rules — rejection, footprint, vertex budget

Load this when a prop vanished, clipped the racing line, or a dress grew
the mesh a lot.

## Contents
- Survey before placing
- Frames: which `k` an emitter expects
- On-track rejection
- Terrain anchoring
- Reverse circuits
- Vertex budget — increment, not a ceiling
- Denser vegetation
- Overhead landmarks
- Trees/lamps

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
  0.958, so Blanchimont racing 0.862 ≈ authored 0.904 — numbers drift; print them). Print it (no browser):
  `node -e 'const T=require("./tools/track/verify-track.cjs").buildContext(),d=T.LIST.find(x=>x.id==="spa");T.buildCenterline(d,{line:false});console.log(d.sceneryStartFrac,d._sceneryShift)'`
- **`K(s)` is authored-frame and passes straight through.** Never pre-shift it.
  The wrapped `(k, side, …)` helpers (`anchor`, `tree`, `place`, `building`, …)
  apply the shift themselves, exactly once. Dropping a non-zero `sceneryStartFrac` re-bases every
  authored frac literal at once — take a `tools/track/audit-circuit.cjs` baseline before and after,
  never a one-line edit.
- **`along()` hands authored-frame `k` to the callback** (`sceneryNodeToAuthored`). Wrapped helpers inside an `along` span apply the
  shift once. Table reads like `blocked(k / n)` still need care: prefer
  authored fracs / `K(s)` when testing against authored windows.
- **`bakedModel(id, k, side, dist, opts)` remaps correctly on shifted
  circuits** (dedicated `(id, k, side)` wrapper in `transformSceneryApi`).
  Always keep `if (!bakedModel(...)) …` anyway.
- **`every()` is full-lap**, so its double phase only moves which node a hash
  lands on — harmless for authored-frame tables, NOT for a table re-keyed into
  the engine frame (a `CLEAR`/exclusion list written through an `sl()` helper).

## On-track rejection

Every primitive emitter is footprint-tested (`rejBox` / `onRoadHit`; `docs/SCENERY-API.md` §rejection):
a footprint touching tarmac drops the **entire shape**. Too-close props silently vanish — increase `dist`/`gap`.

- **Console warning is not universal.** Composite helpers (`building`,
  `tree`/`pine`/`palm`, `wall`/`fence`/`guardrail`, `tower`, `billboard`,
  `grandstand`, …) call `noteSuppressed` (`js/track/scenery/build-props.js`): the
  `<name> SUPPRESSED at k=…` line is `Log.debug` only; a normal build logs one
  build-end `Log.warn("scenery", "<id>: suppressed <kind>=<n> …")` — counts per
  kind (`verify-track` prints them as `guard drops`). Raw primitives only
  increment `_culled` and log `Log.info("track", "<id>: culled N on-track primitive(s)")`
  — a count, not a location.
- **Circuit-inline `onTrack(x, z, margin)`** is a single-point guard; it does not prove the full
  footprint is clear.
- **New composite emitters** (engine, `js/track/scenery/*.js`, only — `rejBox` is not on the circuit `api`) must use
  `rejBox(centre, [w,h,d], basis)` over the widest section, not one `onTrack()` point (the "props over the
  racing line" bug: `building()`/`neonTower`/masts testing an inner-face point on a curving street).
- **`RAW.*` (engine-internal, not on the circuit `api`) bypasses the guard.** Crowd spectators via `RAW.addBox` are not
  footprint-tested; only place them behind a shell.
- **Regression:** `tests/specs/props-over-road.spec.js` (in `test:circuits`).
  One track: `TRACK=<id> PORT=<p> node tools/track/measure-props-over-road.mjs --shots` (browser, parent only).

## Terrain anchoring

Props >120 m out or on street circuits can float/sink — pull them in or use `anchor()` and read `c[1]`.
Which ground the helpers use and the fixes: [float-fix.md](float-fix.md).

## Reverse circuits

When `reverse: true`, the engine auto-flips `side`; author in the original
trace direction.

## Vertex budget — increment, not a ceiling

Per-circuit prop size: `node tools/track/props-tris.cjs <id>` (`--all`); `tests/unit/props-tri-ratchet.test.mjs` fails past its +0.5 % margin. Also `verify-track.cjs <id>` before and after; keep the edit at or below the existing count unless you can say why.
`every(20)` for sparse features, `every(5)` only for hero sections; jitter
with `hash()`; double-place at two distances instead of doubling density.

## Denser vegetation

Levers in order (then `clip-audit.cjs <id> --why`, `props-tris.cjs <id>`):
1. `forestEdge(s0, s1, side, gap, opts)` `opts.density` (clamped 0.05-1; above ~0.6 the engine adds a
   staggered back row — the comment above Spa's belts) and `gap`; `opts.pineFrac`/`hMin`/`hMax` for the look.
2. Deeper ranks: an `along()` loop that consults the circuit's own exclusion map before each tree (Spa's
   `OPEN` windows + `plantPine` → `forestRank`), never a bare `every()` pine loop — Spa's early `every()`
   pines ignored `OPEN` and caused the severe pine×motorhome / pine×crowd clips (the comment above `OPEN`).
3. Fleet-wide kinds (`foliage`, `city`, `lamps`): the def's `dressingExclusions` per lap window (SCENERY-API.md).

## Overhead landmarks

Bridges/flyovers need clearance — a low `place()`/`building()` can hit the
deck from below.

## Trees/lamps

Must never book a barrier: `recordBarrier` (on the `api`) and the engine's own `blockAt`
(`js/track/scenery/*.js` only) shrink the driving boundary (SKILL.md §Barriers).
