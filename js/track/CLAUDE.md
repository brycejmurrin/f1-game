# js/track/ — the track ENGINE

Rules that bind in this directory (circuit DATA lives in `js/circuits/` —
layout/palette/scenery edits go THERE, never here).

Since the 2026-09-03 move window the engine is split: `core/` is the road
itself (spline, mesh, geom, space, surface), `scenery/` is everything placed
beside it (the emitter split, graph, models, themes, kits, the generic
tables), and `tracks.js` at the root is the registry — `LIST`, `resolve`,
`build`, palettes.

- **The def is the single home of a circuit's data.** `path` (real
  centreline), `sectors`/`turns` (curated markings), `barrier`, `furniture`,
  `kit`, `standSet`, `cityStyle` are all keys of `js/circuits/<id>.js`; this
  directory holds only the GENERIC fallbacks (`FURN_DEF`, `KIT_DEF`,
  `THEME_DEF`, `STAND_SET_DEF` in scenery-data.js). Never add an id-keyed
  table here — read the key off the BUILT def (copied in tracks.js `LIST`;
  `tests/unit/circuit-def-fields.test.mjs` pins the copy).

- **Coordinates**: +Y up, metres, radians, arc `s` in metres, lateral `x`
  +right. **+k = LEFT-hand turn** (measured; the opposite label shipped for
  months). Never flip a curvature sign without a rendered lap.
- **`_sceneryShift`**: frac-keyed def tables must respect the 7a173519
  start-line rotation. Consume fracs via the compensated idiom (see
  `bankingProfile` in mesh.js or `buildCenterline`) — a raw `def` frac read
  places things 2/3 of a lap away.
- **Prefer a turn index to a lap fraction** when anchoring anything to a
  CORNER. A frac only means something against the exact centreline it was
  measured on, and compensating a stale one lands it on a real corner that is
  simply the wrong one — Zandvoort shipped 19° on Scheivlak and 18° on
  Hunserug while Hugenholtz and Luyendyk ran flat. `bankZones` takes
  `{ turn: N }` (1-based into `def.turns`, the curated FIA apex table,
  racing-space, no shift); frac zones that land on a straight >60 m from any
  apex are re-seated on the nearest one.
- **scenery(api) is a frozen 111-member contract**
  (`tests/unit/scenery-api-contract.test.mjs`). Adding a member is a
  deliberate contract change: update the test in the same commit.
- After ANY change here: `node tools/verify-track.cjs <id>` (2 s headless
  build) BEFORE running spec groups; `pick-tests` names the groups.
- Deep references: `docs/SCENERY-API.md`, `docs/TESTING.md`.
