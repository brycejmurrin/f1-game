---
name: survey-track
description: Use when the user asks to survey a track, make a circuit more accurate/realistic, compare Apex 26 to real-world reference, fix floating trees/props, gaps beside the road, terrain channels/steps/sunk water, or do a picture-driven accuracy pass.
---

# Survey & update a track

The loop for taking one circuit from "roughly dressed" to "reads like the real
place". This is the **orchestrator** — each step hands off to a focused skill or
tool. Work one circuit at a time; the same loop applies to all 40.

> **One command does the survey** — `node tools/survey-track.mjs <id>` self-boots the
> game and emits the screenshots + the flagged ground-profile probe in one pass (no
> server, one output folder). Requires **Chromium + SwiftShader** (same preinstalled
> browser as Playwright probes). The focused skills handle the rest: **scenery-dress**
> (edit `scenery(api)` in `js/circuits/<id>.js` — not the old `js/tracks/` path),
> **debug-tracks** (deeper geometry hooks), **playwright-probe**
> (one bespoke shot via `shot.mjs`), **check-changes** (ship).

## Where the truth lives

1. **`docs/tracks/<id>.md`** — THE per-circuit brief (one exists for all 40). Theme
   + palette, elevation notes, and a **landmarks-by-lap-position table** (s, side,
   distance, box-modelling note). This is your target; start here.
2. Need to *see* the real place? Use the `WebSearch` tool for cited descriptions; if
   web image egress is allowed, drive a headless image search for reference photos.
   Treat any numbers (heights/distances) as best-effort — sanity-check before they
   drive geometry.

## The loop

### 1 · Read the brief
Open `docs/tracks/<id>.md`. List the 3–5 highest-leverage fixes from the landmark
table and palette (what's missing, wrong-coloured, wrong-shaped, or floating).

### 2 · Survey the current scene — **one command**
Don't guess: screenshot the real game and probe its geometry in a single pass.
```sh
node tools/survey-track.mjs <id> before     # → scratch/captures/survey-track/<id>/ + a flagged probe table
```
This self-boots the game (no server needed) and produces, in one boot:
- **screenshots** in `scratch/captures/survey-track/<id>/` — a whole-track aerial plus an **orbit**
  and a **driver's-eye** shot at 0/25/50/75 % (the EYE shots are what expose
  floating props and gaps). **Read the PNGs** against the brief.
- the **lateral ground-profile probe** as a table, with the classic failure modes
  auto-flagged:
  - **`terrainY === "--"` sandwiched between solid readings** → a terrain *hole*;
    props out there fall back to the closed-form `groundYAt()` estimate and **float
    or sink** (the "channel between rings"). A trailing `--` at the outer lats is
    just the ribbon edge — benign.
  - **a >1 m jump between adjacent lats** → a cliff/step.
  - `terrainY` sliding steadily more negative with distance → the ribbon is
    **sagging** (right for a hill, wrong for a flat island level with water).

Add fractions or a label as needed: `survey-track.mjs <id> after 0.1,0.55,0.78`.
For a quick numbers-only re-probe (no screenshots) use
`node .claude/skills/survey-track/ground-profile.mjs <id>`. For one bespoke framing
use `playwright-probe`'s `shot.mjs`. Deeper geometry hooks (`scan`, `wallStats`,
`groundY`) live in **debug-tracks**; `tests/terrain-over-road.spec.js` catches the
terrain-over-road class.

### 3 · Edit
- **Props / dressing** (trees, buildings, barriers, water, landmarks): edit
  `js/circuits/<id>.js` `scenery(api)` — follow **scenery-dress** and
  `docs/SCENERY-API.md`. Anchor with `anchor()` (seats on the *rendered* ribbon),
  not raw `groundYAt`, so props don't float where the ribbon is carved/sags.
- **The ground itself** (how wide/flat the land is): the terrain ribbon is built by
  `buildTerrain` in the `js/track/` engine, driven per-track by `def.terrainOuter` (ribbon
  width) and the sag/ease model. A flat man-made island wants a **wide, level**
  shelf out to the shoreline, not a narrow sagging verge backed by a separate slab
  — otherwise props in the gap between them float (the Montreal case below). New
  per-track terrain behaviour is added as a **`def` flag** read in `buildTerrain`
  **and** mirrored in `groundYAt` so props anchor to the same surface.
  - ⚠️ A `def` key only reaches the engine if it's copied in the `LIST = DEFS.map`
    block near the bottom of `js/track/tracks.js` (it whitelists keys). Add your new key
    there or it silently reads as `undefined`.

### 4 · Verify the build
```sh
node tools/verify-track.cjs <id>     # headless build check — catches a scenery THROW
```
A `THROW` here strands the game on the menu. For a sweep across all circuits run
`node tools/verify-track.cjs --all` (~30 s; see **check-changes**).

### 5 · Re-survey
Re-run the one survey command with an `after` label — same framings + probe, so you
get a clean before/after and confirm the flags cleared:
```sh
node tools/survey-track.mjs <id> after
```
Compare `scratch/captures/survey-track/<id>/before-*.png` vs `after-*.png`; confirm the probe table
is now flag-free and the eye shots show props on real ground.

### 6 · Test & ship
- Geometry guards: `npx playwright test tests/terrain-over-road.spec.js tests/tracks-walls.spec.js`
- Visual regression (all circuits): `npm run test:visual`
  — this suite skips when `tests/tracks-visual.spec.js-snapshots/` is absent; if
  baselines exist and your change is **intentional**, regenerate them with:
  `npm run test:update -- tests/tracks-visual.spec.js` (then eyeball
  `tests/tracks-visual.spec.js-snapshots/`). Prefer Linux/SwiftShader for CI-matching goldens.
- **bump-cache**: increment `?v=N` in `index.html` (every `js/*`/`css/*` edit).
  See the **bump-cache** skill / `sed -i -E 's/\?v=[0-9]+/?v=N/g' index.html`.
- Commit with a message that says the *why*, and push. Pick the test group with
  **check-changes**.

## Worked example — Montreal "floating trees" pass

> **Survey first:** Montreal already ships `flatTerrain: true` + `terrainOuter: 70`
> in `js/circuits/montreal.js`. Do not re-apply that fix blindly — run the survey
> command and read the probe/EYE shots; only edit if flags are still present.

The exact shape of a survey+update pass:
1. **Brief** (`docs/tracks/montreal.md`): flat island in a river; Olympic Basin
   flanks the back straight; trees should sit on park land.
2. **Survey** (`survey-track.mjs montreal before`): the EYE shots showed roadside
   trees floating over a grey void behind the wall, and the probe table showed the
   ribbon sagging underwater then going `--`:
   ```
   frac   roadY        8m     12m     20m     30m     45m     70m    110m
   0       0.00        --   -0.39   -0.53   -0.71   -0.98   -1.43   -2.15
   ```
   The ribbon only covered ~12–15 m then **sagged underwater** (−2.15 at 110 m);
   beyond it `terrainY` was `--`, so trees fell back to the sunk `groundYAt` and
   floated; the flat island slab sat at a different height → the step. Root cause:
   a flat island modelled with a *sloping* terrain ribbon.
3. **Edit**: gave `buildTerrain` a `flatTerrain` def flag (wide, dead-level shelf
   out to `terrainOuter`), mirrored it in `groundYAt`, added the key to the `LIST`
   whitelist, set `flatTerrain:true` + `terrainOuter:70` on the track, and aligned
   the slab just under the ribbon.
4. **Verify/re-survey/ship**: `verify-track montreal` clean; `survey-track.mjs
   montreal after` showed a flat, flag-free profile and props on real ground;
   `terrain-over-road` + `tracks-walls` pass; regenerated the montreal
   `tracks-visual` baselines; bumped `?v=`; committed.

## Gotchas
- **Trees/lamps must never call `blockAt`/`markBarrier`** — they'd shrink the
  driving boundary. Keep furniture clear of the collision edge (see scenery-dress).
- **Probe both sides** — `ground-profile.mjs` reports whichever side has rendered
  terrain; a one-sided lake means one side reads `--` legitimately.
- **Intentional visual change ≠ regression** — when `tracks-visual` baselines fail
  after a deliberate edit, regenerate them; don't chase the diff.
- **One circuit at a time, picture-driven** — assert with screenshots + the probe,
  not by reasoning about coordinates.
