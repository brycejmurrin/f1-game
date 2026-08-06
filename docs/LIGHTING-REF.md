# Lighting & sky reference

`js/render/glx.js` owns the shaders and light upload; `js/game/atmosphere.js`
(`applyRaceSettings`) and `js/game/lighting.js` (`buildTrackLights`,
`setFrameLights`, `appendCarTailLights`) drive the per-frame state.

---

## Light model overview

The lit shader combines three sources:

| Source | Shader uniforms | Notes |
|---|---|---|
| Directional sun | `uSunDir`, `uSunColor` | With shadow map |
| Hemisphere ambient | `uAmbSky`, `uAmbGround` | Blended by surface normal Y component |
| Point lights (up to 32) | uniform arrays — see below | Floodlights, emissives |

The composite pass combines AO, shafts, exposure and bloom in HDR, applies the
live HDR image grade described below, then runs ACES → display-domain colour
grade → lens flare → vignette, grain and dither.

The sky shader's sun disc uses the same `sunDir` as the lighting uniforms, so the
bright spot in the sky always aligns with where shadows fall.

---

## IMAGE & COLOUR grading

The LIGHTING TUNER keeps one `IMAGE & COLOUR` tab with four internal sections:
`TONAL RANGE`, `RGB LIFT / GAMMA / GAIN`, `COLOUR`, and `LENS & FINISH`.
`TUNE_DEFS.section` only controls those headings; profile resolution, Reset,
COPY VALUES and `__apex.lightTune()` continue to use the ordinary slider IDs.

### Composite order

1. Combine the HDR scene, AO, shafts and bloom; apply exposure.
2. Apply RGB Lift/Gamma/Gain.
3. Apply overlapping log-luminance Blacks, Shadows, Midtones, Highlights and
   Whites exposure masks.
4. Apply luminance-preserving Toe and Shoulder curves.
5. Apply the existing ACES fit.
6. Apply Contrast, Vibrance, Saturation, Warm/Cool, split tone and Black Floor.
7. Apply lens/finish effects.

The HDR grade is arithmetic in the existing composite pass. It adds no render
pass, target or texture sample. Both shaders clamp `pow`/log inputs and curve
divisors so every exposed slider extreme remains finite.

### Tonal controls

| ID | Range | Neutral | Purpose |
|---|---:|---:|---|
| `blacks` | −1…1 | 0 | Deepest near-black detail |
| `shadows` | −1…1 | 0 | Dark asphalt, tyres and unlit surfaces |
| `midtones` | −1…1 | 0 | Middle-grey paint and environment detail |
| `highlights` | −1…1 | 0 | Bright surfaces below peak white |
| `whites` | −1…1 | 0 | Brightest HDR values entering the ACES shoulder |
| `toe` | −1…1 | 0 | Transition out of black |
| `shoulder` | −1…1 | 0 | Highlight compression before ACES |

These are distinct from the existing `blackLift` and `whitePoint` IDs, labelled
**BLACK FLOOR** and **ACES WHITE SCALE** in the tuner. Their IDs and stored
meaning are unchanged for preset compatibility.

RGB grading exposes `liftR/G/B` (−0.15…0.15, neutral 0), `gammaR/G/B`
(0.5…2, neutral 1), and `gainR/G/B` (0.5…1.5, neutral 1). The fitted transform
maps input black to Lift, input white to Gain, and Gamma controls the midpoint.

All new registry defaults are neutral. The shipped broadcast grade lives in
`LightPresets["*"]`; track/time/weather presets and localStorage profiles retain
their existing higher precedence.

### WebGPU `CompositeU` packing

`CompositeU` is **256 bytes** (16 aligned `vec4<f32>` records). The original
nine records occupy bytes 0–143; grading appends:

| Offset | Record | Components |
|---:|---|---|
| 144 | `tone0` | Blacks, Shadows, Midtones, Highlights |
| 160 | `tone1` | Whites, Toe, Shoulder, padding |
| 176 | `lift` | Lift R/G/B, padding |
| 192 | `gamma` | Gamma R/G/B, padding |
| 208 | `gain` | Gain R/G/B, padding |
| 224 | `aces` | ACES tone-curve a/b/c/d |
| 240 | `dirtFx` | Lens-dirt amount, padding |

WebGL uploads the same five records as `uTone0`, `uTone1`, `uLift`, `uGamma`
and `uGain`.

---

## Point-light upload — uniform arrays

There is no UBO. `frame.lights` is a flat JS array of **15-float records**:

```
[x, y, z,  r, g, b,  radius,  aimX, aimY, aimZ,  coneIn, coneOut,  bleed, volW, glareW]
```

GLX uploads plain uniform arrays per frame — `uLightPos[i]` (xyz + radius),
`uLightCol[i]`, `uNumLights`, plus per-lamp aim/cone/bleed/volumetric/glare
arrays consumed by the lit shader and the god-ray pass. Every
`lights.push(...)` in `buildTrackLights` (`js/game/lighting.js`) must be
exactly 15 values.

`setFrameLights()` re-uploads every frame: it sorts active floodlights by
distance to camera (with behind-camera bias) and keeps the nearest CAP —
`LT.lampCull` (def 28) when there is traffic, otherwise 32 (`MAX_LIGHTS`).

### Dark-gap fill (`LT.lampGapFill`, def 60 m)

Lights are emitted **from the mast list** (`track.lampPosts`), so a circuit that
suppresses the generic flood masts over a stretch — a `dressingExclusions` rule
of kind `"floodlights"`, usually because a bespoke structure owns that ground —
also deleted the *light* there. An audit of all 40 circuits found **nine with a
genuinely unlit stretch at night** — worst of all baku (1.2 km, a fifth of the
lap) and redbull (784 m spanning its own start/finish straight), plus madrid,
mexico, silverstone, suzuka, monaco, abudhabi, montreal.

Placing bespoke masts circuit-side does not fix it: `floodMast()` and
`floodMastRing()` draw a fixture but never register a lamp post, so they emit
nothing either. Instead `buildTrackLights` walks the sorted mast list and
inserts fill lights wherever the gap exceeds `LT.lampGapFill`, keeping the mast
suppressed (the circuit's visual intent) while restoring the pool. Fill lights
carry `glareW = 0` and damped volumetrics — there is no fixture to anchor a lens
halo to, so they read as spill from off-camera architectural lighting.

Set the knob to 0 for the old behaviour. With it at the default every node on
all 40 circuits is within 28 m of a lamp.

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
- Bloom ≈ 0.60 (threshold 0.82), grade strength ≈ 0.34 (set just before `GLX.present()`).
- `numLights = 0` — sun dominates, floodlights are suppressed.

---

## Floodlights

`buildTrackLights()` in `js/game/lighting.js` places one point light every ~22 m
along both edges of every circuit. Activated whenever the scene is dark:

- Any explicit night/dusk/dawn time-of-day, on any track.
- Default mode on a track whose `_night` flag is set.

Colour is chosen by `floodColor(theme)`:

| Theme | Colour |
|---|---|
| `desert` | Warm sodium orange |
| `street_night` | Cool LED white |
| `modern` | Warm-white LED |
| `street_day` | Warm street-lamp amber (Monaco/Madrid) |
| `green` (classic) | Neutral warm white |

**Masts**: `buildProps` (the `js/track/` scenery modules) emits a floodlight mast mesh at every light
position using the same stride/offset/side — masts are visible day and night, so
each light pool reads as physically cast by a real structure.

`setFrameLights()` culls the full list to the nearest CAP lamps each frame
(`lampCull` / 32 solo) and uploads the light uniforms. When the sun dominates
(bright day) it sets `numLights = 0` and skips the upload.

---

## Live inspection & control

```js
// Read current state
__apex.lightState()
// → { ambientSky: [r,g,b], ambientGround: [r,g,b],
//     sunColor: [r,g,b], sunY: number, skySunDir: [x,y,z],
//     exposure: number, numLights: number, … }

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
