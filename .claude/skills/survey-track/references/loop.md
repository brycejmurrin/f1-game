# Survey-track loop and gotchas

## Contents
- Layout check (no browser)
- The loop
- Gotchas

Steps marked PARENT use a browser and run in the parent session. The track-surveyor
follows its own steps in `.claude/agents/track-surveyor.md`, not this numbering; it
reads the artifacts the PARENT steps produce.

## Layout check (no browser)

Compare the BUILT centreline's `total`, apexes, widths, sectors and elevation against dated
evidence. `path.len` is source metadata, not built length; the existing OSM comparison normalizes
scale, rotation and lap origin, so it cannot certify those quantities. Surveyed elevation
conditionally overrides authored bumps via `TrackDef.fromRaw` (`js/track/core/def.js`); absent
profiles do not prove flatness. `startFrac` and width zones use control-index fractions, built
`s/total` arc fractions, and turns/sectors racing-space fractions. Respect `_sceneryShift` through
wrapped helpers; never pre-shift `K(s)` (`.claude/rules/game-code.md`).

## The loop

### 1 · Read the brief

`docs/tracks/<id>.md`. List the 3–5 highest-leverage fixes from the landmark
table and palette.

### 2 · PARENT survey — one command

```sh
node tools/track/survey-track.mjs <id> before
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

**Artefacts:** `⚠ STEP` rows and `agent.mjs survey` `groundCliffs` sample at
lat 0, where the raycast falls through the ribbon (starts ~10 m out) to
`floorY`, so a flat circuit flags a cliff at every frac (estoril: all false).
A blank first capture is the pre-present frame. Real = a `--` sandwiched at
lat 4-24 or a >1 m step in a lateral `node tools/shot/apex-eval.mjs <id> "a.groundY(frac,lat)"`
sweep. Record artefact-vs-real per flag in the hand-back.

Add fractions or a label: `survey-track.mjs <id> after 0.1,0.55,0.78`.
`--oblique` adds a bounds-fitted topdown plus N/E/S/W high obliques
(flag may sit anywhere; `monaco --oblique 0.1,0.5` is valid).
Parent numbers-only probe (still boots Chromium):
`node .claude/skills/survey-track/ground-profile.mjs <id>`.
One bespoke frame: **playwright-probe** `tools/shot/shot.mjs`. Deeper hooks:
**agent-view** (its track-geometry reference, linked from SKILL.md). `tests/specs/terrain-over-road.spec.js` catches the
terrain-over-road class.

### 3 · Edit

- **Props / dressing** — `js/circuits/scenery/<id>.js` `scenery(api)` (**scenery-dress**,
  `docs/SCENERY-API.md`). Anchor with `anchor()` (rendered ribbon), not raw
  `groundYAt`.
- **The ground itself** — `buildTerrain` in `js/track/`, driven by
  `def.terrainOuter` and the sag/ease model. A flat man-made island wants a
  **wide, level** shelf out to the shoreline. New per-track terrain behaviour
  is a **`def` flag** read in `buildTerrain` **and** mirrored in `groundYAt`.
  This shared engine work belongs to the parent. A `def` key only reaches the
  engine if `TrackDef.fromRaw` in `js/track/core/def.js` copies it.

### 4 · Verify the build

```sh
node tools/track/verify-track.cjs <id>
```

A `THROW` here strands the game on the menu. One call for every offline check:
`node tools/track/audit-circuit.cjs <id>`. Fleet: `verify-track.cjs --all`.

### 5 · PARENT re-survey

```sh
node tools/track/survey-track.mjs <id> after
```

Compare matching `before-*.png` vs `after-*.png`; attribute each flag to a
confirmed defect, intended slope or probe artifact rather than forcing zero flags.

### 6 · PARENT test & ship

- Geometry: `node tools/track/verify-track.cjs <id>` (default), then that circuit's foundation spec ALONE:
  `node tools/ci/test-bg.mjs --spec tests/specs/<id>-foundation.spec.js`. A whole group (`circuits`) runs on the
  pushed branch: `node tools/ci/remote-group.mjs circuits` (AGENTS.md verification table).
- Pixel-diff suite is PARKED under `tests/manual/tracks-visual.spec.js` (no
  baselines). Do not treat it as a gate. Intentional goldens:
  `npm test -- tests/manual/tracks-visual.spec.js --update-snapshots`.
- `node tools/gen/gen-shell.mjs --check` (shell/cache: `?v=dev`, no bump; check-changes bump reference, linked from SKILL.md) after any `js/*`/`css/*` edit.
- Pick remaining groups with **check-changes**.

## Gotchas

- Trees/lamps must never call `blockAt`/`markBarrier` — they would shrink the
  driving boundary (**scenery-dress**).
- Probe both sides — `ground-profile.mjs` reports whichever side has rendered
  terrain; a one-sided lake means one side reads `--` legitimately.
- Intentional visual change ≠ regression — regenerate parked goldens; don't
  chase the diff.
- One circuit per worker, picture-driven; parent campaigns may delegate
  disjoint pairs in parallel (campaign.md).
- Survey before re-applying a known terrain fix: a flat island modelled with a
  *sloping* ribbon floats or sinks props; the cure is a level-shelf `def` flag
  (e.g. `flatTerrain` + `terrainOuter`), which `js/circuits/montreal.js` already ships.
