---
name: survey-track
description: End-to-end playbook for making a circuit look accurate — survey the in-game scene against real-world reference, diagnose geometry problems (floating props, channels/steps, sunk water, terrain over the road), edit the scenery/terrain, then verify and ship. Orchestrates the component skills (scenery-dress, debug-tracks, inspect-scene, track-batch-verify, check-changes) into one loop and adds a lateral ground-profile probe. Use for "survey Monza", "make Spa more accurate", "do an accuracy pass on this track", "the trees are floating / there's a gap beside the road", "improve a circuit's realism".
---

# Survey & update a track

The loop for taking one circuit from "roughly dressed" to "reads like the real
place". This is the **orchestrator** — each step hands off to a focused skill or
tool. Work one circuit at a time; the same loop applies to all 24.

> **One command does the survey** — `node tools/survey-track.mjs <id>` self-boots the
> game and emits the screenshots + the flagged ground-profile probe in one pass (no
> server, one output folder). The focused skills handle the rest: **scenery-dress**
> (edit `scenery(api)`), **debug-tracks** (deeper geometry hooks), **inspect-scene**
> (one bespoke shot), **track-batch-verify** / **check-changes** (ship).

## Where the truth lives

1. **`docs/tracks/<id>.md`** — THE per-circuit brief (one exists for all 24). Theme
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
node tools/survey-track.mjs <id> before     # → scratch/survey-<id>/ + a flagged probe table
```
This self-boots the game (no server needed) and produces, in one boot:
- **screenshots** in `scratch/survey-<id>/` — a whole-track aerial plus an **orbit**
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
use `inspect-scene`'s `shot.mjs`. Deeper geometry hooks (`scan`, `wallStats`,
`groundY`) live in **debug-tracks**; `tests/terrain-over-road.spec.js` catches the
terrain-over-road class.

### 3 · Edit
- **Props / dressing** (trees, buildings, barriers, water, landmarks): edit
  `js/tracks/<id>.js` `scenery(api)` — follow **scenery-dress** and
  `docs/SCENERY-API.md`. Anchor with `anchor()` (seats on the *rendered* ribbon),
  not raw `groundYAt`, so props don't float where the ribbon is carved/sags.
- **The ground itself** (how wide/flat the land is): the terrain ribbon is built by
  `buildTerrain` in `js/tracks.js`, driven per-track by `def.terrainOuter` (ribbon
  width) and the sag/ease model. A flat man-made island wants a **wide, level**
  shelf out to the shoreline, not a narrow sagging verge backed by a separate slab
  — otherwise props in the gap between them float (the Montreal case below). New
  per-track terrain behaviour is added as a **`def` flag** read in `buildTerrain`
  **and** mirrored in `groundYAt` so props anchor to the same surface.
  - ⚠️ A `def` key only reaches the engine if it's copied in the `LIST = DEFS.map`
    block near the bottom of `js/tracks.js` (it whitelists keys). Add your new key
    there or it silently reads as `undefined`.

### 4 · Verify the build
```sh
node tools/verify-track.cjs <id>     # headless build check — catches a scenery THROW
```
A `THROW` here strands the game on the menu. For a sweep across all circuits use
**track-batch-verify**.

### 5 · Re-survey
Re-run the one survey command with an `after` label — same framings + probe, so you
get a clean before/after and confirm the flags cleared:
```sh
node tools/survey-track.mjs <id> after
```
Compare `scratch/survey-<id>/before-*.png` vs `after-*.png`; confirm the probe table
is now flag-free and the eye shots show props on real ground.

### 6 · Test & ship
- Geometry guards: `npx playwright test tests/terrain-over-road.spec.js tests/tracks-walls.spec.js`
- Per-track visual regression: `npx playwright test tests/track-<id>.spec.js`
  — if your change is **intentional**, the pixel baselines must be regenerated:
  `npx playwright test tests/track-<id>.spec.js --update-snapshots` (then eyeball
  the new `*-snapshots/*.png`).
- **bump-cache**: increment `?v=N` in `index.html` (every `js/*`/`css/*` edit).
  See the **bump-cache** skill / `sed -i -E 's/\?v=[0-9]+/?v=N/g' index.html`.
- Commit with a message that says the *why*, and push. Pick the test group with
  **check-changes**.

## Worked example — Montreal "floating trees" pass

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
   `terrain-over-road` + `tracks-walls` pass; regenerated the 25 `track-montreal`
   snapshots; bumped `?v=`; committed.

## Gotchas
- **Trees/lamps must never call `blockAt`/`markBarrier`** — they'd shrink the
  driving boundary. Keep furniture clear of the collision edge (see scenery-dress).
- **Probe both sides** — `ground-profile.mjs` reports whichever side has rendered
  terrain; a one-sided lake means one side reads `--` legitimately.
- **Intentional visual change ≠ regression** — when a `track-<id>` snapshot fails
  after a deliberate edit, regenerate it; don't chase the diff.
- **One circuit at a time, picture-driven** — assert with screenshots + the probe,
  not by reasoning about coordinates.
