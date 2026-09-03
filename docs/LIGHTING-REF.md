# Lighting & sky reference

`js/render/glx.js` owns the shaders and light upload; `js/game/atmosphere.js`
(`applyRaceSettings`), `js/game/track-lights.js` (`buildTrackLights`) and
`js/game/frame-lights.js` (`setFrameLights`, `appendCarTailLights`) drive the
per-frame state; `js/game/lighting-knobs.js` is the `TUNE_DEFS` / `LT` registry
and `js/game/lighting.js` (`LightTune`) the façade over the three.

---

## Light model overview

The lit shader combines three sources:

| Source | Shader uniforms | Notes |
|---|---|---|
| Directional sun | `uSunDir`, `uSunColor` | With shadow map |
| Hemisphere ambient | `uAmbSky`, `uAmbGround` | Blended by surface normal Y component |
| Point lights (up to 32) | uniform arrays — see below | Track lamps, emissives |

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
| `blacks` | −1.5…1.5 | 0 | Deepest near-black detail (shader stop gain ×3, then `exp2` clamps ±4) |
| `shadows` | −1.5…1.5 | 0 | Dark asphalt, tyres and unlit surfaces (stop gain ×2) |
| `midtones` | −3…3 | 0 | Middle-grey paint and environment detail |
| `highlights` | −3…3 | 0 | Bright surfaces below peak white |
| `whites` | −3…3 | 0 | Brightest HDR values entering the ACES shoulder |
| `toe` | −1…1 | 0 | Transition out of black |
| `shoulder` | −1…1 | 0 | Highlight compression before ACES |

These are distinct from the existing `blackLift` and `whitePoint` IDs, labelled
**BLACK FLOOR** and **ACES WHITE SCALE** in the tuner. Their IDs and stored
meaning are unchanged for preset compatibility.

RGB grading exposes `liftR/G/B` (−0.3…0.3, neutral 0), `gammaR/G/B`
(0.4…2.5, neutral 1), and `gainR/G/B` (0.4…2.5, neutral 1). The fitted transform
maps input black to Lift, input white to Gain, and Gamma controls the midpoint.
`pow`/`log` inputs and curve divisors are clamped so every exposed extreme stays finite.

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

GLX uploads packed `vec4` arrays per frame — `uLightA[i]` (xyz + radius),
`uLightB[i]` (rgb + bleed), `uLightC[i]` (aim + coneIn), `uLightD[i]` (coneOut),
plus `uNumLights`. God-rays still use their own 12-slot unpacked set. Every
`lights.push(...)` in `buildTrackLights` (`js/game/track-lights.js`) must be
exactly 15 values.

`setFrameLights()` re-uploads every frame: it sorts active lamps by
distance to camera (with behind-camera bias) and keeps the nearest CAP —
`LT.lampCull` (def 40) when there is traffic, otherwise 48 (`MAX_LIGHTS`).

**48 is an engine cap, not a WebGL one.** WebGL has no lights API and no
`MAX_LIGHTS`. The real constraint is `MAX_FRAGMENT_UNIFORM_VECTORS` (WebGL2
minimum **224** `vec4` rows; this repo's SwiftShader Chrome measured **4096**,
UBO block **64 KB**). Four packed `vec4` arrays of 48 (`uLightA..D`) cost 192
rows — the same budget the old six vertical arrays used at 32. God-rays stay
at 12 (`GR_MAX_LIGHTS`). Mobile night clamps to 24 for fragment cost, not
uniforms.

### Two invariants, gated by `tests/unit/lamp-fixture-anchor.test.mjs`

Both read **zero** on all 40 circuits, with no baseline and no ALLOW hatch.

**A light that glares needs a fixture under it.** `drawGlow` paints an additive
halo billboard for every record with `glareW > 0`, so any such record must sit on
a registered `track.lampPosts` lens. Fixture-less lights are legitimate — the
gap fill, the density fill, the start-gantry bar — but they must push `glareW 0`
(and a damped `volW`, or the shaft gives them away instead). The gantry bar
shipped at `glareW 0.3` while explicitly not parented to the gantry mesh: three
orbs 8 m over every start line. Jeddah drew a 560-pole LED tunnel that registered
no lights at all, so the whole circuit fell to the synthetic stride walk — 311
halos, none over a pole.

**A fixture needs its pool to reach the road.** The window `(1-(d/r)^4)^2` is
*exactly* 0 past `r`, so a lens further from the tarmac than its own radius
lights nothing whatsoever. `floodColor`'s radii are sized for a 9-13 m verge
lamp ("the pool's far corner sits 21-25 m from the lens"); a 39 m stadium mast
standing 34 m out has a ~52 m throw, so Bahrain's fully-modelled floodlight ring
covered **2 of 135** centreline samples — and the 2 were the start line, lit by
the orbs above. `floodMast` therefore registers its measured throw × 1.5, and
`lampRadius()` reads a **mast** record's radius as a floor over the theme value,
never an override — `lampPost`'s hand-placed luminaires (Monaco's tunnel soffits
at 21-27 m) are a different list and keep their deliberately small radii.

Widening a radius costs no shader slots: the cull uploads the nearest CAP lights
regardless of radius, and the fragment loop range-rejects on squared distance
before the `sqrt`. Measured peak lights actually covering one road point after
the fix: 11 on Bahrain, 13 on Qatar, against a CAP of 24-32.

### Dark-gap fill (`LT.lampGapFill`, def 60 m)

Lights are emitted **from the mast list** (`track.lampPosts`), so a circuit that
suppresses the generic mast pass over a stretch — a `dressingExclusions` rule
of kind `"lamps"` (`"floodlights"` / `"lighting"` are aliases for the same
family), usually because a bespoke structure owns that ground — also deleted
the *light* there. An audit of all 40 circuits found **nine with a
genuinely unlit stretch at night** — worst of all baku (1.2 km, a fifth of the
lap) and redbull (784 m spanning its own start/finish straight), plus madrid,
mexico, silverstone, suzuka, monaco, abudhabi, montreal.

Placing bespoke masts circuit-side used to leave the same hole:
`floodMast()` / `floodMastRing()` drew a fixture but never registered a lamp
post. They now register a lens into `track.lampPosts` by default
(`opts.light: false` opts out for accent-only towers sitting on top of the
generic pass). Gap-fill still covers stretches where both the generic pass
and bespoke masts are absent — keeping the mast suppressed (the circuit's
visual intent) while restoring the pool. Fill lights carry `glareW = 0` and
damped volumetrics — there is no fixture to anchor a lens halo to, so they
read as spill from off-camera architectural lighting.

Set the knob to 0 for the old behaviour. With it at the default every node on
all 40 circuits is within 28 m of a lamp.

---

## `applyRaceSettings` — time-of-day branches

Called on race load and again whenever `setTimeOfDay()` fires.

### `raceTimeOfDay === "default"`
Uses the track file's own palette verbatim. If the track's `night` flag is set
(`def.night`), the scene sun is dimmed to moonlight and track lamps are
activated. Palette luminance is not a second night detector — a `night: false`
circuit stays a day session even if its colours are dark.

### `raceTimeOfDay !== "default"` (explicit time)

**`"night"`**
- Ambient is floored AND capped — stops over-bright palettes from washing out to
  daylight.
- `frame.sunColor` is dimmed to moonlight (the palette may ship a near-overhead
  bright sun for sky glow; this prevents it lighting the road like day).
- `frameSky.sunColor` is left warm so dusk sky tints survive.
- Track lamps activated.

**`"dawn"` / `"dusk"`**
- Rich split-tone skies with a low sun angle.
- Track lamps activated (scene is dark enough).

**`"day"`**
- Driven by `_trackAtmoBias(def)` which returns a value from −clear to +overcast:
  - **Clear circuits**: deep saturated zenith, low raking sun for long shadows
    (avoids the flat near-overhead look), warm-sun-vs-cool-sky chiaroscuro, crisp
    low haze.
  - **Humid/overcast circuits**: paled-out sky, more haze.
- Bloom ≈ 0.60 (threshold 0.82), grade strength ≈ 0.34 (set just before `GLX.present()`).
- Track lamps are suppressed in the render loop (`frame.lights = null`), not
  inside `applyRaceSettings`. `LT.floodDay` (DAYTIME LAMPS) can keep a dim day fill.

---

## Track lamps

Street posts and flood banks are **one system**. There is no second floodlight
pipeline: `buildTrackLights()` in `js/game/track-lights.js` places one point light
per entry in `track.lampPosts` (generic mast pass ~22 m both edges, plus
`floodMast` / `lampPost` registrations). Activated whenever the scene is dark:

- Any explicit night/dusk/dawn time-of-day, on any track.
- Default mode on a track whose `_night` flag is set.

The LIGHTING TUNER keeps one **LAMPS** tab (POOLS + BEHAVIOUR sections) for
every knob that drives this pipeline — street posts and flood banks share the
same controls. Colour is chosen by `floodColor(theme)` and the per-post
`LAMP_KINDS` table (both internal to `js/game/track-lights.js`):

| Theme | Colour |
|---|---|
| `desert` | Warm sodium orange |
| `street_night` | Cool LED white |
| `modern` | Warm-white LED |
| `street_day` | Warm street-lamp amber (Monaco/Madrid) |
| `green` (classic) | Neutral warm white |

**Masts**: `buildProps` emits a mast mesh at every light-bearing post using the
same stride/offset/side — masts are visible day and night, so each light pool
reads as physically cast by a real structure. Street themes use slim posts
keyed off the furniture `fz.lamp` style; open circuits get tall flood banks.

`setFrameLights()` culls the full list to the nearest CAP lamps each frame
(`lampCull` / 48 solo) and uploads the light uniforms. When the sun dominates
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

// Spread the CURRENT (track, time, weather) profile to every other circuit at
// the same time and weather — the tuner's COPY ALL chips, headless.
__apex.lightCopy()              // this profile's own edits, merged over each target
__apex.lightCopy('look')        // every live value: they all end up identical
__apex.lightCopy({ undo })      // put back exactly what a copy replaced
```

---

## See also

- `docs/DEBUG-HOOKS.md` — full `__apex` API reference including `lightState()`
- `docs/SCENERY-API.md` — per-circuit `scenery(api)` callback, barrier/furniture
  definitions that interact with light placement
- `/debug-cameras` skill — framing & camera control in the browser console
- `/webgl-debug` skill — WebGL state inspection, shader uniforms, draw calls
- `/lighting-tuner` skill — live palette and bloom/grade tuning workflow
