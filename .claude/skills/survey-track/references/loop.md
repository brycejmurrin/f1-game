# Survey-track loop, Montreal example, gotchas

Load this when reading a probe table, editing terrain `def` flags, or deciding
whether a visual baseline should move.

## The loop

### 1 · Read the brief

`docs/tracks/<id>.md`. List the 3–5 highest-leverage fixes from the landmark
table and palette.

### 2 · Survey — one command

```sh
node tools/survey-track.mjs <id> before
```

Self-boots (no server). Writes `scratch/captures/survey-track/<id>/`:
whole-track aerial plus **orbit** and **driver's-eye** at 0/25/50/75 %. EYE
shots expose floating props and gaps. Also emits the lateral ground-profile
probe, auto-flagged:

- **`terrainY === "--"` sandwiched between solid readings** → a terrain
  *hole*; props fall back to closed-form `groundYAt()` and **float or sink**.
  A trailing `--` at the outer lats is just the ribbon edge — benign. At
  water, also check `waterSurface` vs `terrainOuter` ribbon mismatch and
  `dressingExclusions` at that frac.
- **a >1 m jump between adjacent lats** → a cliff/step.
- `terrainY` sliding steadily more negative with distance → the ribbon is
  **sagging** (right for a hill, wrong for a flat island level with water).

Add fractions or a label: `survey-track.mjs <id> after 0.1,0.55,0.78`.
`--oblique` adds a bounds-fitted topdown plus N/E/S/W high obliques
(flag may sit anywhere; `monaco --oblique 0.1,0.5` is valid).
Numbers-only: `node .claude/skills/survey-track/ground-profile.mjs <id>`.
One bespoke frame: **playwright-probe** `tools/capture/shot.mjs`. Deeper hooks:
**debug-tracks**. `tests/specs/terrain-over-road.spec.js` catches the
terrain-over-road class.

### 3 · Edit

- **Props / dressing** — `js/circuits/<id>.js` `scenery(api)` (**scenery-dress**,
  `docs/SCENERY-API.md`). Anchor with `anchor()` (rendered ribbon), not raw
  `groundYAt`.
- **The ground itself** — `buildTerrain` in `js/track/`, driven by
  `def.terrainOuter` and the sag/ease model. A flat man-made island wants a
  **wide, level** shelf out to the shoreline. New per-track terrain behaviour
  is a **`def` flag** read in `buildTerrain` **and** mirrored in `groundYAt`.
  A `def` key only reaches the engine if it is copied in the
  `LIST = DEFS.map` block near the bottom of `js/track/tracks.js`.

### 4 · Verify the build

```sh
node tools/verify-track.cjs <id>
```

A `THROW` here strands the game on the menu. Fleet: `verify-track.cjs --all`.

### 5 · Re-survey

```sh
node tools/survey-track.mjs <id> after
```

Compare `before-*.png` vs `after-*.png`; confirm the probe is flag-free.

### 6 · Test & ship

- Geometry: `node tools/test-bg.mjs circuits`
- Pixel-diff suite is PARKED under `tests/manual/tracks-visual.spec.js` (no
  baselines). Do not treat it as a gate. Intentional goldens:
  `npm test -- tests/manual/tracks-visual.spec.js --update-snapshots`.
- `bump-cache.mjs --apply` after any `js/*`/`css/*` edit.
- Pick remaining groups with **check-changes**.

## Worked example — Montreal floating trees

Montreal already ships `flatTerrain: true` + `terrainOuter: 70` in
`js/circuits/montreal.js`. Do not re-apply that fix blindly — survey first.

1. Brief (`docs/tracks/montreal.md`): flat island; Olympic Basin flanks the
   back straight; trees on park land.
2. Survey showed roadside trees floating over a grey void; the probe sagged
   underwater then went `--`. The ribbon only covered ~12–15 m then sagged
   (−2.15 at 110 m); beyond it `terrainY` was `--`, so trees fell back to the
   sunk `groundYAt`. Root cause: a flat island modelled with a *sloping*
   terrain ribbon.
3. Edit: `flatTerrain` def flag (wide, dead-level shelf out to
   `terrainOuter`), mirrored in `groundYAt`, key added to the `LIST`
   whitelist, slab aligned just under the ribbon.
4. `verify-track montreal` clean; after-survey flag-free; bumped `?v=`.

## Gotchas

- Trees/lamps must never call `blockAt`/`markBarrier` — they would shrink the
  driving boundary (**scenery-dress**).
- Probe both sides — `ground-profile.mjs` reports whichever side has rendered
  terrain; a one-sided lake means one side reads `--` legitimately.
- Intentional visual change ≠ regression — regenerate parked goldens; don't
  chase the diff.
- One circuit at a time, picture-driven.
