# Lighting & sky reference

Three sections: the light-record / shader / time-of-day **reference**, the
hand-tuned **knobs** and how to A/B them, and the per-track **presets**. The
183 tuner sliders are generated separately into
[`LIGHTING-TUNER-SLIDERS.md`](LIGHTING-TUNER-SLIDERS.md).

`js/render/glx/glx.js` owns the shaders and light upload; `js/lighting/atmosphere.js`
(`applyRaceSettings`), `js/lighting/track-lights.js` (`buildTrackLights`) and
`js/lighting/frame-lights.js` (`setFrameLights`, `appendCarTailLights`) drive the
per-frame state; `js/lighting/knobs.js` is the `TUNE_DEFS` / `LT` registry
and `js/lighting/lighting.js` (`LightTune`) the façade over the three.

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
`lights.push(...)` in `buildTrackLights` (`js/lighting/track-lights.js`) must be
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
pipeline: `buildTrackLights()` in `js/lighting/track-lights.js` places one point light
per entry in `track.lampPosts` (generic mast pass ~22 m both edges, plus
`floodMast` / `lampPost` registrations). Activated whenever the scene is dark:

- Any explicit night/dusk/dawn time-of-day, on any track.
- Default mode on a track whose `_night` flag is set.

The LIGHTING TUNER keeps one **LAMPS** tab (POOLS + BEHAVIOUR sections) for
every knob that drives this pipeline — street posts and flood banks share the
same controls. Colour is chosen by `floodColor(theme)` and the per-post
`LAMP_KINDS` table (both internal to `js/lighting/track-lights.js`):

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
- `/playwright-probe` skill (`references/cameras.md`) — framing & camera control in the browser console
- `/webgl-debug` skill — WebGL state inspection, shader uniforms, draw calls
- `/lighting-tuner` skill — live palette and bloom/grade tuning workflow

## Hand-tuned lighting constants (knobs)

Every hand-tuned lighting constant, what it *physically* does, and the metric
that must move when you change it. The machine-readable version of this table
lives in `tools/lighting/ab-lighting.mjs` (`KNOBS`) — each entry pins the EXACT source
string, an alternate value, a canonical scene, and an expected metric
direction.

```sh
node tools/lighting/ab-lighting.mjs list          # the catalog (marks which knobs are value-sweepable)
node tools/lighting/ab-lighting.mjs run all       # render A/B for every knob → scratch/captures/ab-lighting/
node tools/lighting/ab-lighting.mjs run lampFog.base pcss.penScale
npm test -- tests/specs/lighting-ab.spec.js     # fast invariants + catalog integrity (or test-bg.mjs gfx)
```

### Dialling a value in (the tuning loop)

```sh
node tools/lighting/ab-lighting.mjs sweep lamp.radius 24 30 40   # render candidates → labelled strip + metrics
node tools/lighting/ab-lighting.mjs try lamp.bleed "<full replacement string>"   # structural knobs
node tools/lighting/ab-lighting.mjs apply lamp.radius 40         # adopt the winner
```

`sweep` works on any knob whose `find`/`b` differ by exactly one number (the
`list` output marks these `sweepable=<current>`); it renders the scene once
per candidate and writes a side-by-side strip plus the watched metric for
each. Structural knobs take `try` with a full replacement string instead.

`apply` is the write step, and it does three things atomically: swaps the
value into the real source file (only if the find-string is still unique),
self-syncs this catalog (the applied value becomes the new `find`, the old
value becomes the new `b`, edits confined to that knob's own entry — so the
catalog-integrity test stays green and the knob now A/Bs the reverse), and
bumps the `?v=` cache version in index.html. After applying: re-render the
knob to confirm, `npm test -- tests/specs/lighting-ab.spec.js`, commit.

The harness serves the repo through an in-memory server and swaps the knob's
source string for variant B — the working tree is never modified, and the same
mechanism works for GLSL shader constants and JS driver constants alike.
Per-lamp flicker is frozen during renders so night A/Bs isolate the knob. Each
run writes `<knob>-AB.jpg` side-by-sides plus `results.json` with per-region
metrics (`mean`, `p10`, `p90`, `contrast`, `bloomPct`, `edgeE`).

A knob PASSES when swapping A→B produces a **visible change**: either a
whole-frame colour delta above the noise floor (per-channel, so a luma-neutral
hue shift still counts), OR a >3% move in its watched region metric (for knobs
whose footprint is small/localized — lamp halos, the fog band, a subtle
penumbra). The harness exits non-zero if any gated knob produces no visible
change — "this constant does nothing anymore" is a caught regression.

A handful of knobs are marked **`subtle`**: their effect is real but too small,
localized, or chromatically neutral for a robust automated whole-frame gate
(the lens-halo scale, the city-glow *hue* tint, the PCSS penumbra-growth rate).
These are still rendered, measured, and composited every run for human review —
they just don't fail the exit code. The `-AB.jpg` side-by-side is the judge.

`tests/specs/lighting-ab.spec.js` additionally fails if any catalog `find` string no
longer matches its file exactly once, so retuning a constant forces the
catalog to follow.

### Lamp geometry & energy (js/lighting/track-lights.js `buildTrackLights`)

| Knob | What it changes | Watch |
|---|---|---|
| `lamp.poolEnergy` — `0.55 / max(hAim/al, 0.35)` | Master lamp-pool energy scale (the 0.55) plus the raking-incidence clamp floor (0.35 — normalises pool luminance for shallow-angle beams; only engages on low masts). | road mean ↓ |
| `lamp.aimPoint` — `hw*0.5` | Where the beam lands: 0.5 = centre of the near lane (pool sits under the fixture — the "lamps emit downward" look); 0 = centreline (pool drifts inboard). | pool position, energy ~stable |
| `lamp.radius` — floodColor radii 28-36 | The windowing envelope `(1-(d/r)^4)^2`. Too small and the pool's far corner (21-25 m from the lens) silently dies. | road p90 ↓ when shrunk |
| `lamp.sodiumCone` (and every KIND `cIn/cOut`) | Hot-core size vs soft skirt. Wider inner cone = flatter pool = the "ambient wash" failure mode; the pool/valley rhythm lives here. | road contrast ↓ when widened |
| `lamp.bleed` — KIND `blB/blV` (0.06-0.16) | Out-of-beam light floor. Lifts the valleys between pools; too high erases the scallop rhythm, too low reads pitch black between masts. | road p10 |
| `lamp.glareW` — per-kind field 14 | drawGlow lens-halo strength AND size per lamp kind (0 = fixture-less lights get no halo — edge washers). | frame p90 |
| KIND `volW` — field 13 | Per-kind volumetric beam presence in GODRAY (flood banks 1.0 → tails 0.25). | beam-region mean at night-fog |

### Glowing fog & volumetrics

| Knob | What it changes | Watch |
|---|---|---|
| `lampFog.base` — `0.45 + 0.6*groundMist`, cap 0.9 | How strongly lamps tint the fog itself (the glowing-fog amount). Clear night ≈0.55, fog night ≈0.80, day 0. | fogwall mean |
| lampFog sun gate — `(0.55-sunLum)/0.30` | Cuts lamp-fog glow when the sun is bright (dawn/dusk mist already carries the sun tint; both together blew out). | dusk fog delta ≈ 0 |
| `lampFog.softClip` — `lf/(1+maxCh*0.7)` | Reinhard shoulder that stops a lamp cluster pushing the fog wall past the night bloom threshold (0.93) into white wash. | fogwall bloomPct |
| `lampFog.mistShare` — `lampFogC * 1.5` | Ground-mist share of the glow vs the air-fog share (mist hugs the road where the lamps aim). | near mean |
| `vol.lampRange` — `td < 200` | How far along each ray lamps volumetrically in-scatter (was 110 — distant lamps had no glow). | fogwall mean |
| `vol.beamHeight` — `exp(-Δy*0.07)` | Beam height falloff. Bigger constant = beams hug the road; smaller = tall light cones. | sky mean |
| `vol.lampStrength` — `0.05 + 0.65*mist`, cap 0.70 | Master beam strength, mist-swelled; the 0.05 base is the clear-night hint. | fogwall mean |
| GODRAY `N = 16` | March resolution: banding vs cost (half-res pass; was 32→22→16 — jitter + blur hide the coarser step). | banding by eye |

### Ambient

| Knob | What it changes | Watch |
|---|---|---|
| `amb.bounceK` — `att * 0.04` | Per-lamp bounce fill: pool light bounced onto walls/kerbs/car flanks, outside the beam cone. The local-colour ("sodium verge") term. Budget: night frame mean lift < 10%. | wallL mean |
| `amb.nightCap` — capSky/capGnd bands | Night ambient ceiling: neon cities get a higher warm band than open circuits. B (old near-black) makes the foreground unreadable — that's the point of the test. | near p10 |
| `amb.cityGlowHue` — `0.82 + 0.28*cg/max` | Ambient hued toward the circuit's sky-glow (magenta canyons / amber towns); near energy-neutral. | colour cast, mean ~stable |

### Reflections

| Knob | What it changes | Watch |
|---|---|---|
| `ssr.dryFloors` — TUNE_DEFS `ssrDryNight` (def 0.08) / `ssrDryDay` (def 0.07) | Scene-mirror amount on DRY roads (night lamp sheen / day faint tower-and-sky mirror), now two LIGHTING TUNER sliders. Wet uses the wetness ramp directly. | road structure |
| `ssr.sheenFade` — `min(gateSrc / 0.20, 1.0)` | Below 0.2 the darker-mirror substitution fades quadratically — faint reflections read as sheen, not dark towers replacing sunlit tarmac. | day road mean stability |
| `ssr.roadMask` — `smoothstep(0.25, 0.55, upDot)` | Which surfaces count as "road" for SSR; the 0.25 edge keeps banked corners (Zandvoort) reflective. | banked road mean |

### Shadows

| Knob | What it changes | Watch |
|---|---|---|
| `pcss.penScale` — `(z-zb) * 80` | How fast penumbra grows with receiver-blocker gap (80 ≈ 3.2 m gap → full softness). | road edgeE ↓ when raised |
| `pcss.radiusRange` — `mix(1.5, 6.0, pen)` | Contact crispness → max softness range. B (24,24) = PCSS off, a dramatic uniform blur (4x the old max) for a visible before/after. | road edgeE |
| `shadow.box` — ortho ±`LT.shadowRange` (def 80, fallback 80), snap sBox/4 | Texel density vs guaranteed coverage radius. Doubling the box halves density. | shadow edge sharpness |
| `shadow.biasClamp` — `(0.0005, 0.004)` | Acne (too low) vs peter-panning/detached shadows (too high). | road mean ↑ when over-biased |

### Surface detail (LIT_FS `uDetail` blocks)

| Knob | What it changes | Watch |
|---|---|---|
| `detail.reliefStrength` — `uDetail*0.4*mnFade` | Micro-normal relief strength: two-octave asphalt/verge bumpiness (fades 25→95 m and with wetness). B flattens it. | near edgeE |
| `detail.crackStrength` — `crack*0.30` (+ zone gate 0.40-0.70) | Crack line darkness and which stretches are cracked. Auto-fades to ~24% on wet roads (`min(uDetail*4,1)` with wet detail 0.06). | near p10 |
| `detail.patch` — `pm*0.05` albedo + `±0.08` roughness | Repair-patch visibility: fresh asphalt darker AND glossier than the weathered surround. | near mean |

### Night energy budget (the four-knob set that decides "how dark is night")

| Knob | What it changes | Watch |
|---|---|---|
| `night.glowAmp` — `glow * 2.3` | Emissive HDR push for windows/lenses/neon. This one constant is ~half the night frame energy; 3.4 was the historical too-bright look. | frame bloomPct |
| `night.floodEmit` — `0.78` | Prop emissive ramp after dark (how lit the lit geometry is). | frame mean |
| `night.exposure` — street 0.86 / other 0.90 | The master dark-stays-dark knob (ACES input scale). | frame mean |
| `night.bloomThresh` — `0.97` (+ bloom 0.48 neon-city / 0.55 open) | What counts as "bright enough to halo". Lowering it blooms the mid-tones — instant fog-of-glow. | frame bloomPct |

### Reading the metrics

- `mean` — plain region luminance; the workhorse.
- `p10` / `p90` — valley floor / pool peak; their ratio (`contrast`) is the
  pool-vs-valley scallop rhythm that makes light read as *cast by fixtures*.
- `bloomPct` — % of pixels near-white; the wash/blow-out tripwire.
- `edgeE` — mean horizontal gradient (edge energy); shadow-edge sharpness and
  fine-detail presence.

When you retune a value: run its knob, eyeball the `-AB.jpg`, keep the JSON.
When you *rename or restructure* code around a value: `npm test -- tests/specs/lighting-ab.spec.js` tells
you which catalog entries to update.

## Per-track lighting presets

Goal: ship a hand-considered lighting-tuner preset for **every track × time-of-day ×
weather**, baked into `js/lighting/presets.js`. This doc is the shared brief: the
per-track subagents read it, and it tracks which tracks are done.

---

### How a preset resolves (later wins)

```
TUNE_DEFS default  →  file "*"  →  file "track|tod|wx"  →  player localStorage
```

- `js/lighting/knobs.js` `TUNE_DEFS` holds each knob's factory **default**.
- `js/lighting/presets.js` `window.LightPresets` holds the shipped overrides:
  - `"*"` — a **global baseline** applied to every condition (currently `carGloss: 0.35` near-matte paint, plus the shipped broadcast HDR grade: blacks/shadows/midtones/highlights/whites/toe/shoulder and small gainR/gainB trims).
  - `"track|tod|wx"` — a per-condition override that wins over `"*"`.
- A player's live tuner edits always win over the file; RESET falls back to the file.

**Key format:** `trackId|timeOfDay|weather`
- `timeOfDay` ∈ `dawn | day | dusk | night`  (the session "default" resolves to the track's own day/night)
- `weather` ∈ `dry | wet | rain | fog | overcast`
- So up to **20 combos per track**. Only list the knobs that should differ from the
  default/baseline for that combo — sparse is good (3–10 knobs each is typical).
  Omit a combo entirely if the default already looks right there.

---

### Global baseline (`"*"`)

| knob | value | why |
|---|---|---|
| `carGloss` | 0.35 | near-matte paint across the board (one notch above the slider min) |

Don't re-specify a `"*"` value in a per-condition preset unless you're deliberately overriding it.

---

### What each condition should feel like (intent)

- **day / dry** — clean daylight, natural contrast. A little `shadowTintAmt` (cool shadows)
  reads as a crisp sunny day. Desert tracks lean warm (`tint`+, `sunTemp`−); temperate/green
  tracks stay neutral-to-cool.
- **dawn** — low warm sun just up: `sunTemp`− (warm), `grMul`↑ (god-rays), `mistDensity`↑
  (ground mist), softer key. Pink/gold mood.
- **dusk** — golden hour: warm `sunTemp`−, `grMul`↑, floods just switching on. Richer, warmer than dawn.
- **night** — genuinely dark; the **lights do the work**. Street/city tracks: `cityGlowMul`↑,
  `glowAmp`↑, `floodEmitMul`↑, `starBright` low (city washes stars). Open/desert tracks: rely on
  floods (`lampLevel`, `poolEnergy`), keep ambient low, `starBright`↑ for a clear desert sky.
- **wet** — mirror-road: `ssrWetMul`↑, `wetDark`↑ (darker tarmac), cooler `tint`−, a touch more cloud.
- **rain** — wet + weather: keep `ssrWetMul` up, `fogDensityMul`↑ (lower visibility), `lightning`
  (storms), cooler and flatter. `rainCount` for storm density.
- **fog** — `fogDensityMul`↑↑, `mistDensity`↑, desaturate (`saturation`−), reduced reach, cooler/greyer.
- **overcast** — flat soft light: `keyMul`− (weaker sun), `ambientMul`↑ (soft fill), `cloudCover`+,
  low shadow contrast (`shadowStr`−), slight desaturation, cool-neutral `tint`.

#### Theme cheatsheet
- `desert` (bahrain, abudhabi, qatar) — warm/amber, dusty warm `fogTint`+, high hard sun by day, floodlit at night, clear starry skies.
- `street_night` (baku, jeddah, singapore, vegas) — neon city; big `cityGlowMul`/`glowAmp` at night, warm-cool neon mix, reflective streets when wet.
- `street_day` (monaco) — Mediterranean harbour warmth, bright day, glamorous.
- `modern` (miami, madrid, mexico, shanghai) — city skyline backdrop, moderate, some neon at night.
- `green` (spa, silverstone, monza, suzuka, imola, interlagos, montreal, cota, hungaroring, redbull, zandvoort, albert_park) — natural parkland; cooler, lush; several are weather-prone (spa, zandvoort, interlagos) so wet/overcast matter more.

---

### Knob reference (id · range · default · effect)

_(from `TUNE_DEFS` in `js/lighting/knobs.js`. Focus on the per-condition-relevant ones; leave the rest at default.)_

_This list is auto-generated from `TUNE_DEFS` (ranges + defaults are exact). Some
knobs (e.g. `ssaoRadius`, `mistShare`, `carClearcoat`, `wetness`, `blackLift`,
`chromAb`, `grain`, `sharpen`, `speedBlur`) are repair/stylistic and rarely need a
per-condition preset — focus on the ones the intent notes above call out._

#### SUN & MOON
- `keyMul` [0..4] def 1 — direct sun/moon intensity (diffuse + speculars + shadows)
- `sunTemp` [-2..2] def 0 — key white-balance (sun by day, moonlight at night); − warm, + cool
- `sunElev` [-60..60] def 0 — sun/moon height offset (deg); − lower = longer shadows + god-rays
- `sunAzim` [-180..180] def 0 — rotates the key-light compass direction
- `moonBright` [0..3] def 1 — moon disc/halo + soft blue fill (night)
- `grMul` [0..4] def 1 — volumetric sun-shaft / god-ray strength (dawn/dusk)
- `sunShaftMul` [0..4] def 1 — screen-space crepuscular rays from the sun disc (separate post pass from `grMul`)

#### AMBIENT & BOUNCE
- `ambientMul` [0..4] def 1 — hemisphere fill (shadow/unlit + night readability floor)
- `ambTemp` [-2..2] def 0 — fill white-balance; − warm bounce, + cool sky
- `ambBalance` [-2..2] def 0 — tip fill toward ground(−) or sky(+)
- `nightAmbLift` [0..4] def 1 — scales the moody-night ambient floor/cap band ("how dark is night" master)
- `bounceK` [0..0.3] def 0.04 — lamp bounce onto walls/kerbs/car flanks

#### SHADOWS
- `shadowStr` [0..2] def 1.15 — shadow darkness; lower lifts toward ambient, >1 crushes
- `shadowRange` [16..160] def 80 — sun shadow box half-size (m)
- `pcssPen` [5..500] def 80 — how fast shadows soften with caster distance
- `shadowBias` [0..0.01] def 0.001 — depth offset (acne vs peter-pan)
- `shadowTintAmt` [0..1.5] def 0 — cool-blue tint on shadowed areas (sunny-day look)
- `carShadow` [0..1] def 1 — real sun-projected car shadows (per-frame car-only map; desktop WebGL2 tier)
- `aoStr` [0..3] def 1 — SSAO crease/contact darkening
- `ssaoRadius` [0.1..4.1] def 0.6 — world-space reach of AO sampling
- `contactStr` [0..3] def 1 — grounding shadow under car/props

#### LAMPS
- `lampLevel` [0.02..1.5] def 0.26 — lamp brightness ceiling (street posts + flood banks)
- `floodDay` [0..1.5] def 0 — light lamps during DAY sessions (0 = off; lit-stadium look under a blue sky)
- `poolEnergy` [0.05..2] def 0.55 — per-lamp pool luminance
- `lampRadiusMul` [0.3..3] def 1 — pool reach
- `bleedMul` [0..5] def 1 — out-of-beam floor (lifts valleys)
- `glareStr` [0..1.5] def 0.12 — lens-halo strength
- `lampTemp` [-2..2] def 0 — lamp white-balance; − sodium/amber, + LED/white
- `lampFlicker` [0..0.6] def 0.1 — aging-lamp pulse
- `beamCone` [0.4..2.2] def 1 — lamp cone width

#### NIGHT GLOW & BLOOM
- `floodEmitMul` [0..3] def 1 — lit buildings/windows/signage brightness
- `glowAmp` [0.2..6] def 2.3 — HDR push for windows/neon/lenses
- `cityGlowMul` [0..5] def 1 — light-pollution dome on the horizon
- `cityGlowWarm` [-2..2] def 0 — skyglow dome white-balance + warm hue cast into night ambient
- `bloomMul` [0..4] def 1 — halo strength around bright sources
- `bloomSpread` [0.3..4] def 1 — halo width
- `threshOff` [-0.5..0.2] def 0 — bloom threshold offset (lower = mid-tones glow)
- `bloomKnee` [0..1] def 0.5 — how much bloom is suppressed over bright pixels (0 = milky, 1 = crisp)

#### ATMOSPHERE
- `fogDensityMul` [0..5] def 1 — haze depth / distance fade
- `fogHeight` [0..0.2] def 0.018 — fog altitude falloff
- `fogTint` [-2..2] def 0 — haze white-balance; + warm/dusty, − cool/overcast
- `mistDensity` [0..4] def 1 — low ground mist (dawn/humid/fog)
- `mistHeight` [0.04..1.2] def 0.30 — ground-mist band height
- `lampFogBase` [0..1.5] def 0.45 — lamp tint on distant fog (clear night)
- `lampFogHaze` [0..2.5] def 0.6 — extra lamp-fog as haze/rain thickens
- `mistShare` [0..6] def 1.5 — ground-mist vs air-fog share of the lamp glow
- `fogClip` [0..2.5] def 0.7 — soft shoulder stopping lamp clusters whiting out the fog
- `lampVolBase` [0..0.8] def 0.05 — volumetric beam strength (clear)
- `lampVolHaze` [0..2.5] def 0.65 — beam swell in haze/rain
- `lampVolCap` [0..1.5] def 0.70 — beam ceiling

#### ROAD & REFLECTIONS
- `ssrWetMul` [0..2.5] def 1 — wet-road mirror strength
- `ssrDryNight` [0..1] def 0.08 — dry tarmac lamp/neon sheen (night)
- `ssrDryDay` [0..0.6] def 0.07 — dry tarmac sky/tower sheen (day)
- `roadRough` [0.05..1.2] def 1 — dry tarmac roughness (lower = glossier)
- `surfDetail` [0..3.5] def 1 — road/terrain grain relief
- `ssrThick` [0.02..5] def 0.20 — SSR depth tolerance
- `wetDark` [0..2] def 1 — how much darker wet asphalt reads

#### CAR
- `carReflect` [0..2.5] def 0.05 — world mirror on bodywork
- `carEnvCube` [0..1] def 0.3 desktop / 0 mobile — live cubemap probe (ON by default on desktop; mobile stays OFF for GPU cost)
- `carGloss` [0..1.6] def 1 — paint gloss (**`"*"` baseline 0.35 matte — leave alone unless a track needs different**)
- `carSpecular` [0..3.5] def 1 — specular highlight brightness
- `carClearcoat` [0..3.5] def 0.05 — lacquer coat catching crisp glints
- `carMetal` [0..5] def 1 — how metallic the paint reads
- `carGlow` [0..5] def 1 — night/wet livery self-glow
- `tailLightMul` [0..5] def 1 — trailing red glow on nearby cars

#### SKY & WEATHER
- `cloudCover` [-1..1] def 0 — cloud amount offset (+ more)
- `cloudSpeed` [0..8] def 1 — cloud drift speed
- `starBright` [0..4] def 1 — night star intensity
- `wetness` [-0.05..1] def -0.05 — road wetness override (AUTO = follow weather)
- `rainCount` [20..1400] def 360 — rain streak density
- `rainStreak` [0.2..4] def 1 — rain streak length
- `rainWind` [-2..2] def 0.18 — rain slant
- `lightning` [0..6] def 1 — storm strike rate
- `weatherSunMute` [0..2] def 1 — how much bad weather dims the sun (0 = never, >1 = deeper murk)

#### IMAGE & COLOUR
- `exposureMul` [0.1..3] def 1 — master brightness (pre-tonemap)
- `contrast` [0.5..3] def 1.12 — midtone gamma
- `saturation` [0..3] def 1 — colour intensity
- `vibrance` [0..1.5] def 0.20 — selective saturation on dull pixels
- `tint` [-2..2] def 0 — warm(+)/cool(−) white balance
- `gradeStr` [0..4] def 1 — cinematic split-tone amount
- `shadowHue` [-180..180] def 0 — split-tone shadow hue rotation
- `hiHue` [-180..180] def 0 — split-tone highlight hue rotation
- `vignette` [0..1] def 0.80 — corner darkening (lower = stronger)
- `vignetteSoft` [0.1..0.92] def 0.35 — vignette reach/inner edge (lower = broader, higher = thin corner ring)
- `blackLift` [0..0.2] def 0.005 — raised black floor (matte film base)
- `whitePoint` [0.4..4] def 1 — highlight roll-off knee
- `chromAb` [0..5] def 0 — lens colour-fringing (RGB split)
- `grain` [0..0.3] def 0 — film grain
- `flareMul` [0..3.5] def 1 — sun/lamp flare strength
- `sharpen` [0..2] def 0 — post-FXAA crispness
- `speedBlur` [0..2] def 0 — radial speed blur

**Rules of thumb:** stay within each range; keep edits tasteful (small offsets read better
than extremes); never re-state a knob at its default; respect the `"*"` matte-paint baseline.

---

### Progress

Status: ⬜ todo · 🟨 proposed (agent) · ✅ baked into `light-presets.js`

All 40 circuits now have a full `tod × weather` grid (800 condition keys plus `"*"`).

Full-grid **mcp-probe `look-survey`** (chase + `park` + `snapCam`). Contact
sheets land in [`docs/look-survey/`](look-survey/README.md) as each circuit
hits all 20 looks (`python3 tools/lighting/look-survey-sheet.py --ready`). First visual
pass was 4 looks × 40 circuits; the remaining 16 per track are still shooting.
Cross-cutting from the frames:
- Desert/street **nights** often flood/neon-hot with dusk-orange horizons —
  lamps, bloom, exposure, city glow pulled so lights own a darker sky.
- Weather-prone and many parkland **day|dry** looks had drifted toward
  overcast — sun/key lifted so rain/overcast keep the murk.
- Dawn on night-default tracks was often stadium-lit (`sunElev` too low);
  sun lifted and floods dimmed.
- Auto luma/`lightState` hints caught hot night p90 bloom and hot dusk on
  the remaining day-default circuits; hand-reviewed the first wave of
  night-defaults + weather greens + Monaco/Monza/Suzuka/Miami/Albert Park.
`"*"` unchanged. Jeddah night-dry at frac 0.35 reads as dark neon canyon
(intentional); Baku re-shot at frac 0.28.

| Track | id | theme | default | status |
|---|---|---|---|---|
| Abu Dhabi | `abudhabi` | desert | night | ✅ |
| Albert Park | `albert_park` | green | day | ✅ |
| Bahrain | `bahrain` | desert | night | ✅ |
| Baku | `baku` | street_night | night | ✅ |
| COTA | `cota` | green | day | ✅ |
| Hungaroring | `hungaroring` | green | day | ✅ |
| Imola | `imola` | green | day | ✅ |
| Interlagos | `interlagos` | green | day | ✅ |
| Jeddah | `jeddah` | street_night | night | ✅ |
| Madrid | `madrid` | modern | day | ✅ |
| Mexico City | `mexico` | modern | day | ✅ |
| Miami | `miami` | modern | day | ✅ |
| Monaco | `monaco` | street_day | day | ✅ |
| Montreal | `montreal` | green | day | ✅ |
| Monza | `monza` | green | day | ✅ |
| Qatar | `qatar` | desert | night | ✅ |
| Red Bull Ring | `redbull` | green | day | ✅ |
| Shanghai | `shanghai` | modern | day | ✅ |
| Silverstone | `silverstone` | green | day | ✅ |
| Singapore | `singapore` | street_night | night | ✅ |
| Spa | `spa` | green | day | ✅ |
| Suzuka | `suzuka` | green | day | ✅ |
| Las Vegas | `vegas` | street_night | night | ✅ |
| Zandvoort | `zandvoort` | green | day | ✅ |
| Buenos Aires | `buenos_aires` | green | day | ✅ |
| Catalunya | `catalunya` | modern | day | ✅ |
| Estoril | `estoril` | modern | day | ✅ |
| Hockenheim | `hockenheim` | green | day | ✅ |
| Indianapolis | `indianapolis` | modern | day | ✅ |
| Istanbul | `istanbul` | green | day | ✅ |
| Jacarepaguá | `jacarepagua` | modern | day | ✅ |
| Kyalami | `kyalami` | green | day | ✅ |
| Magny-Cours | `magny_cours` | green | day | ✅ |
| Mugello | `mugello` | green | day | ✅ |
| Nürburgring | `nurburgring` | green | day | ✅ |
| Paul Ricard | `paul_ricard` | modern | day | ✅ |
| Portimão | `portimao` | green | day | ✅ |
| Sepang | `sepang` | green | day | ✅ |
| Sochi | `sochi` | modern | day | ✅ |
| Watkins Glen | `watkins_glen` | green | day | ✅ |

---

### Per-track proposal file

Subagents never write `js/lighting/presets.js` (a partial bake wipes every
other key). Each track writes one JSON file, then the parent merges:

```
artifacts/lighting/proposals/<id>.json
node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs
```

```json
{
  "track": "sepang",
  "theme": "green",
  "nightDefault": false,
  "notes": "equatorial haze; monsoon rain should read thick",
  "combos": {
    "day|dry": { "fogDensityMul": 1.35, "tint": 0.12, "shadowTintAmt": 0.08 },
    "night|rain": { "lampLevel": 0.34, "ssrWetMul": 1.3, "fogDensityMul": 1.7 }
  }
}
```

`combos` keys are `tod|wx`. Values are sparse knob maps. Merge snaps against
live `TUNE_DEFS` in `js/lighting/knobs.js` (ranges/steps there win over the
table in this doc) and refuses unknown ids, out-of-range, or off-grid values.
Do not re-state a knob at its `TUNE_DEFS.def`, and do not re-state a `"*"`
baseline (`carGloss` 0.35, the shipped HDR grade) unless this condition must
override it.

### Workflow

1. One subagent per track proposes presets for all meaningful `tod × wx` combos (this doc = its brief; it also reads `js/circuits/<id>.js` for palette/locale).
2. Each subagent writes `artifacts/lighting/proposals/<id>.json` only.
3. Parent merges with `merge-proposals.mjs`, flips the row to ✅, then
   `node tools/gen/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs`) after the last js edit.

#### Tuning one condition for the whole grid

The per-track pass above is the fine work. When the thing being decided is what a
CONDITION should feel like — "dusk in the wet" everywhere, not Bahrain in
particular — the tuner's **COPY ALL** row does the fan-out: it writes the
condition on screen to every other circuit at the same time-of-day and weather
(`LightStore.copyToTracks`, `__apex.lightCopy()`).

| chip | what lands on the other tracks | use it for |
|---|---|---|
| `MY EDITS` | only the knobs tuned on this condition, merged over each target's own | a change of INTENT for that condition — every circuit keeps its own character underneath |
| `FULL LOOK` | every live value, overriding each target's shipped per-condition preset | levelling a condition you want identical everywhere, or re-basing it before per-track work |

Then `COPY VALUES` and bake as usual. The export is `window.LightEdits` — the
LOCAL profiles only, current condition first — so a spread condition arrives as
one `"track|tod|wx"` entry per circuit and `merge-proposals.mjs` folds them into
`light-presets.js` without touching anything else. Note that a `FULL LOOK`
spread writes every live knob on 39 circuits, so the export after one is the
largest a delta gets; `MY EDITS` stays small. Both chips arm on the first click
and fire on the second, and `UNDO` reverts the whole fan-out while the panel is
open.

**`FULL LOOK` is the destructive one.** It writes a local profile that outranks
the shipped preset for every knob on 39 circuits, which is exactly what makes the
grid uniform — and exactly what erases the per-track character this doc's intent
notes describe. Reach for `MY EDITS` unless the uniformity IS the goal.
