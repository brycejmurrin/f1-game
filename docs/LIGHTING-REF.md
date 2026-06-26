# Lighting & sky reference

`js/glx.js` owns the shaders and UBO; `game.js` (`applyRaceSettings`,
`buildTrackLights`, `setFrameLights`) drives the per-frame state.

---

## Light model overview

The lit shader combines three sources:

| Source | Shader uniforms | Notes |
|---|---|---|
| Directional sun | `uSunDir`, `uSunColor` | With shadow map |
| Hemisphere ambient | `uAmbSky`, `uAmbGround` | Blended by surface normal Y component |
| Point lights (up to 32) | UBO — see below | Floodlights, emissives |

The composite pass then applies: ACES tone-map → `colourGrade` (vibrance/contrast
lift — the main "washed-out" lever) → bloom → lens flare → vignette.

The sky shader's sun disc uses the same `sunDir` as the lighting uniforms, so the
bright spot in the sky always aligns with where shadows fall.

---

## Point-light UBO

`_lightUBOData` is a `Float32Array(256)` (1024 bytes) bound to UBO slot 0:

```
bindBufferBase(UNIFORM_BUFFER, 0, buf)
```

Layout (std140, 32 slots):

| Range | Name | Meaning |
|---|---|---|
| `[0..127]` (4 floats × 32) | `uLPosRad[32]` | xyz = world position, w = radius (metres) |
| `[128..255]` (4 floats × 32) | `uLCol[32]` | xyz = linear-space RGB colour, w = unused |

`setFrameLights()` re-uploads the buffer every frame: it sorts all active
floodlights by distance to camera and keeps the nearest 32.

---

## `applyRaceSettings` — time-of-day branches

Called on race load and again whenever `setTimeOfDay()` fires.

### `raceTimeOfDay === "default"`
Uses the track file's own palette verbatim. If the track's `_night` flag is set
(or the palette is detectably dark) the scene sun is dimmed to moonlight and
floodlights are activated.

### `raceTimeOfDay !== "default"` (explicit time)

**`"night"`**
- Ambient is floored AND capped — stops over-bright palettes from washing out to
  daylight.
- `frame.sunColor` is dimmed to moonlight (the palette may ship a near-overhead
  bright sun for sky glow; this prevents it lighting the road like day).
- `frameSky.sunColor` is left warm so dusk sky tints survive.
- Floodlights activated.

**`"dawn"` / `"dusk"`**
- Rich split-tone skies with a low sun angle.
- Floodlights activated (scene is dark enough).

**`"day"`**
- Driven by `_trackAtmoBias(def)` which returns a value from −clear to +overcast:
  - **Clear circuits**: deep saturated zenith, low raking sun for long shadows
    (avoids the flat near-overhead look), warm-sun-vs-cool-sky chiaroscuro, crisp
    low haze.
  - **Humid/overcast circuits**: paled-out sky, more haze.
- Bloom ≈ 0.74, grade strength ≈ 0.34 (set just before `GLX.present()`).
- `numLights = 0` — sun dominates, floodlights are suppressed.

---

## Floodlights

`buildTrackLights()` in `game.js` places one point light every ~40 m along both
edges of every circuit. Activated whenever the scene is dark:

- Any explicit night/dusk/dawn time-of-day, on any track.
- Default mode on a track whose `_night` flag is set.

Colour is chosen by `floodColor(theme)`:

| Theme | Colour |
|---|---|
| `desert` | Warm sodium orange |
| `street_day` / `street_night` / `modern` | Cool LED white |
| `green` (classic) | Neutral warm white |

**Masts**: `buildProps` (tracks.js) emits a floodlight mast mesh at every light
position using the same stride/offset/side — masts are visible day and night, so
each light pool reads as physically cast by a real structure.

`setFrameLights()` culls the full list to the nearest 32 to camera each frame and
uploads the UBO. When the sun dominates (bright day) it sets `numLights = 0` and
skips the upload.

---

## Live inspection & control

```js
// Read current state
__apex.lightState()
// → { ambientSky: [r,g,b], ambientGround: [r,g,b],
//     sunColor: [r,g,b], sunDir: [x,y,z],
//     exposure: number, numLights: number }

// Switch time of day (no asset reload; rebuilds meshes only on day↔dark flip)
__apex.setTimeOfDay('night')    // 'dawn' | 'day' | 'dusk' | 'night' | 'default'
```

---

## See also

- `docs/DEBUG-HOOKS.md` — full `__apex` API reference including `lightState()`
- `docs/SCENERY-API.md` — per-circuit `scenery(api)` callback, barrier/furniture
  definitions that interact with light placement
- `/debug-cameras` skill — framing & camera control in the browser console
- `/webgl-debug` skill — WebGL state inspection, shader uniforms, draw calls
- `/lighting-tuner` skill — live palette and bloom/grade tuning workflow
