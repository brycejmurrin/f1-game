---
name: survey-track
description: End-to-end playbook for making a circuit look accurate — survey the in-game scene against real-world reference, diagnose geometry problems (floating props, channels/steps, sunk water, terrain over the road), edit the scenery/terrain, then verify and ship. Orchestrates the component skills (scenery-dress, debug-tracks, inspect-scene, track-batch-verify, check-changes) into one loop and adds a lateral ground-profile probe. Use for "survey Monza", "make Spa more accurate", "do an accuracy pass on this track", "the trees are floating / there's a gap beside the road", "improve a circuit's realism".
---

# Survey & update a track

The loop for taking one circuit from "roughly dressed" to "reads like the real
place". This is the **orchestrator** — each step hands off to a focused skill or
tool. Work one circuit at a time; the same loop applies to all 24.

> The component skills do the heavy lifting: **scenery-dress** (edit `scenery(api)`),
> **debug-tracks** (geometry/surface hooks), **inspect-scene** (screenshots),
> **debug-cameras** (framing), **track-batch-verify** / **check-changes** (ship).
> This skill is the sequence that ties them together, plus the one diagnostic they
> don't cover: the lateral ground-profile sweep.

## Where the truth lives

1. **`docs/track-research/<id>.md`** — real-world reference per circuit: signature
   landmarks, skyline, barriers/kerbs/surface, vegetation/water, **gap analysis vs
   the current game**, and **concrete scenery recommendations**. Start here.
2. **`docs/tracks/<id>.md`** — the per-track visual brief / target.
3. Need to *see* it? Use the `WebSearch` tool for cited descriptions; if web image
   egress is allowed, drive a headless image search for reference photos. Treat
   research numbers (heights/distances) as best-effort — sanity-check before they
   drive geometry.

## The loop

### 1 · Read the brief
Open `docs/track-research/<id>.md` + `docs/tracks/<id>.md`. List the 3–5 highest-
leverage fixes (the "headline finding" in the research index is the first one).

### 2 · Survey the current scene
Screenshot the real game, don't guess. Frame deterministically with the camera
hooks (see **inspect-scene** / **debug-cameras**):
```sh
node .claude/skills/inspect-scene/shot.mjs <id> 0.25 orbit  scratch/<id>-25.png
node .claude/skills/inspect-scene/shot.mjs <id> 0.25 eye    scratch/<id>-25-eye.png
node tools/survey-track.mjs <id> before          # aerial + s00/s25/s50/s75 to /tmp
```
**Read the PNGs.** Note what floats, what's bare, what's the wrong colour/shape,
what's missing vs the brief. Orbit a landmark from several azimuths; take a
driver's-eye (`eye`) shot — the eye view is what exposes floating props and gaps.

### 3 · Diagnose the geometry (numbers, not vibes)
For "floating props / a gap or step beside the road / water that won't show",
run the **lateral ground-profile probe**:
```sh
node .claude/skills/survey-track/ground-profile.mjs <id>
```
Read the table:
- **`terrainY === "--"`** at a lateral distance → *no rendered terrain mesh there*.
  Trackside props placed that far out fall back to the closed-form `groundYAt()`
  estimate. If that estimate disagrees with a flat slab / water box you drew, the
  props **float or sink** and you get a visible **step ("channel between rings")**.
- A big jump in `terrainY` between adjacent lats → a cliff/step.
- `terrainY` sliding steadily more negative with distance → the ribbon is **sagging**
  (fine for a hill, wrong for a flat island sitting level with water).

Pair with `__apex.groundY(frac, lat)`, `scan()`, `wallStats()` (see **debug-tracks**),
and `tests/terrain-over-road.spec.js` for the terrain-over-road class.

### 4 · Edit
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

### 5 · Verify the build
```sh
node tools/verify-track.cjs <id>     # headless build check — catches a scenery THROW
```
A `THROW` here strands the game on the menu. For a sweep across all circuits use
**track-batch-verify**.

### 6 · Re-survey & re-probe
Re-run step 2 (same camera framings → clean before/after) and step 3's probe.
Confirm the numbers are now flat/sane and the pictures show props on real ground.

### 7 · Test & ship
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
1. **Brief**: `docs/track-research/montreal.md` — flat island in a river; Olympic
   Basin flanks the back straight; trees should sit on park land.
2. **Survey**: `shot.mjs montreal 0.5 eye` showed roadside trees floating over a
   grey void behind the wall, with a step between a narrow green verge and a flat
   slab further out.
3. **Diagnose**: `ground-profile.mjs montreal` →
   ```
   frac   roadY        8m     12m     20m     30m     45m     70m    110m
   0       0.00        --   -0.39   -0.53   -0.71   -0.98   -1.43   -2.15
   ```
   The ribbon only covered ~12–15 m then **sagged underwater** (−2.15 at 110 m);
   beyond it `terrainY` was `--` (no ground), so trees fell back to the sunk
   `groundYAt` and floated; the flat island slab sat at a different height → the
   step. Root cause: a flat island modelled with a *sloping* terrain ribbon.
4. **Edit**: gave `buildTerrain` a `flatTerrain` def flag (wide, dead-level shelf
   out to `terrainOuter`), mirrored it in `groundYAt`, added the key to the `LIST`
   whitelist, set `flatTerrain:true` + `terrainOuter:70` on the track, and aligned
   the slab just under the ribbon.
5. **Verify/test**: `verify-track montreal` clean; `terrain-over-road` +
   `tracks-walls` pass; regenerated the 25 `track-montreal` snapshots; bumped
   `?v=`; committed.
   *(That engine flag landed on branch `claude/track-research-scenery-li3ynm`.)*

## Gotchas
- **Trees/lamps must never call `blockAt`/`markBarrier`** — they'd shrink the
  driving boundary. Keep furniture clear of the collision edge (see scenery-dress).
- **Probe both sides** — `ground-profile.mjs` reports whichever side has rendered
  terrain; a one-sided lake means one side reads `--` legitimately.
- **Intentional visual change ≠ regression** — when a `track-<id>` snapshot fails
  after a deliberate edit, regenerate it; don't chase the diff.
- **One circuit at a time, picture-driven** — assert with screenshots + the probe,
  not by reasoning about coordinates.
