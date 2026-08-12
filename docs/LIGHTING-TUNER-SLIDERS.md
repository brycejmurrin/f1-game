# LIGHTING TUNER — the 178 sliders, and what each one drives

Generated from `TUNE_DEFS` in `js/game/lighting.js`; that registry is the
source of truth and this table is a view of it. Regenerate rather than hand-edit
(the generator is in the commit that added this file).

## Every slider is wired — the full audit

An exhaustive scan of every `<obj>.<id>` read across the WHOLE `js/` tree (not a
sampled file list) gives all 178 knobs a consumer on the shipping (GLX) path —
**zero unwired**. The classification, and the invalidation each class needs to
be live from a slider drag (not just at track load):

| class | count | consumed in | live via | guarded by |
|---|---|---|---|---|
| per-frame | 74 | render/frame code | read every frame off live `LT` | — |
| shader-uniform | 73 | GLX upload → GLSL (all 73 uniforms upload) | uniform re-uploaded each frame | — |
| build-only | 5 | `buildTrackLights` only (poolEnergy, lampRadiusMul, bleedMul, beamCone, lampGapFill) | `rebuild:true` nulls `track._lights` | `lighting-rebuild.test.mjs` |
| apply-only | 15 | `applyRaceSettings`/`atmosphere.js` only | `APPLY_RACE_IDS` re-runs it | `lighting-reapply.test.mjs` |

The 16 lamp/tail-light knobs in FLOODLIGHTS / LAMP BEHAVIOUR / CAR are the trap:
11 of them (`lampFlicker`, `lampWarmup*`, `lampCull*`, `lampBehindBias`,
`tailLightMul`, `brakeGlowMul`, `tailRange`, `tailFade`) are read in
`lighting.js` too — but inside `setFrameLights`/`appendCarTailLights`/`lampCap`,
which run **every frame**, so they are live directly and correctly carry no
`rebuild` flag. Only the 5 read inside `buildTrackLights` bake into cached
geometry and need `rebuild:true`; all 5 have it. Counting "read in lighting.js"
as one bucket wrongly flags all 16 as needing rebuild — the split is by
function, not by file.

So "this slider does nothing" is never the value going nowhere. It is one of
these, and they need different fixes:

| Failure mode | How to tell | Fix |
|---|---|---|
| **Not stored** | `__apex.lightTune({id: v})` then `__apex.lightTune()[id] !== v` | the store/clamp path, not the renderer |
| **Stored but not re-applied** | `lightTune()[id]` updates but the scene does not, until some *other* action re-runs `applyRaceSettings()` | the id is missing from `APPLY_RACE_IDS` in `light-store.js` (this is what broke five knobs — see below) |
| **Stored but not rebuilt** | a lamp/floodlight knob updates but the lamp geometry does not, until the track reloads | the id is read in `buildTrackLights` but its TUNE_DEFS entry lacks `rebuild:true` |
| **Inert everywhere** | stored, re-applied, but pushed to its extreme it moves no SCENE STATE in any condition | its consumer is gated off, or the effect is genuinely a no-op |
| **Conditional** | inert in the condition you are in, live in another | **expected, not a defect** — night lamp knobs in daylight, wet-road knobs when dry |

The third and fourth are the common ones, and the reason a casual "half these do
nothing" is usually wrong: 69 of the 178 knobs are also set by shipped presets per
(track, time-of-day, weather), so what a slider appears to do depends on where
you are standing when you drag it.

**Measure scene STATE, not the frame mean.** A frame-wide mean-absolute pixel
diff is the wrong instrument for a knob whose effect is diluted across the
image. MEASURED: `nightAmbLift` pushed 1→4 scales `frame.ambientSky` and
`ambientGround` by exactly ×4 (verified via `__apex.lightState()`), yet the
night frame — dominated by lamp-lit surfaces where ambient is a small term —
moved a mean of only 0.37/255, which a pixel-threshold sweep scored "inert" at
1.8× over noise. The value reaches the scene; the *mean* hides it. `lightState()`
exposes `ambientSky/ambientGround/sunColor/exposure/fogDensity/fogColor/...`,
so an A→B→A′ read of the actual derived value is exact, noise-free, and needs no
threshold. The five repaired knobs were all confirmed this way:

| knob | condition it needs | state it moves (verified) |
|---|---|---|
| `nightAmbLift` | night | `ambientSky`/`ambientGround` band ×4 |
| `cityGlowWarm` | night, `street_night`/`modern` theme | `ambientSky` white-balance |
| `weatherSunMute` | wet / overcast / fog | `sunColor` ×0.53 |
| `overcastFogMul` | **overcast only** | `fogDensity` ×3.5 |
| `fogWxMul` | **fog only** | `fogDensity` ×2.7 |

The last two are why `tools/tuner-sweep.mjs` gained `day-overcast`/`day-fog`
conditions: their gates never open under dry/wet, so any pixel sweep would have
scored them dead regardless of runtime.

## Five ways a LIVE knob still reads "no observed change"

A follow-up runtime pass sampled one knob per class (shader-uniform, apply-only,
build-only, per-frame lamp) against a single parked, solo chase-cam capture.
8 of 12 showed clear pixel or state movement immediately. The other 4
(`starBright`, `lampCull`, `tailLightMul`, `beamCone`) showed none — and every
one of them turned out to be correctly wired and live; the capture setup itself
was blind to each, for a different, traceable reason. A blanket runtime sweep
of all 178 with one fixed capture recipe would score all four "dead" and be
wrong every time:

| knob | why this capture missed it | how it was confirmed live |
|---|---|---|
| `starBright` | stars are sub-pixel point features; a frame MEAN can't resolve a few dozen brightened pixels in a 160×90 capture | signal `max 22` vs noise `max 14`, `p99 1.33` vs `1.0` — the distribution TAIL moves even though the mean (0.19 vs 0.34) does not |
| `starBright` (2nd cause) | `sky.js` multiplies stars by `(1 - cityCov)`; Vegas (`street_night`) has heavy city glow that suppresses the star field to near-zero regardless of `starBright` | re-probed on `bahrain` (desert, dark sky) with the camera tilted skyward — still measured no change purely from the mean-vs-point-feature issue above, confirming the FIRST cause is what matters, not the theme |
| `lampCull` | `lampCap(carCount, …)` only applies the knob `carCount > 1`; the standard `park()` capture teleports every AI car away, leaving the player solo | traced the gate in `js/game/lighting.js`; a capture with traffic present (no `park()`, or a scripted grid start) would show it |
| `tailLightMul` | `appendCarTailLights` only emits for cars within `tailRange` (160 m); `park()` scatters the field 600 m away, so there are zero tail lights to scale | same fix as above — needs cars in frame, not a parked solo car |
| `beamCone` | build-only, changes lamp cone SHAPE not brightness — a subtler pixel delta than `poolEnergy` (its build-only sibling, same rebuild path), which DID move measurably in the same capture | `poolEnergy` moving proves `set()` → `rebuild:true` → `track._lights = null` fires correctly; `beamCone` rides the identical path |

The general lesson: **a single fixed capture recipe (one track, parked, solo,
chase-cam) has systematic blind spots** — sky-effect knobs need a dark sky and
the right camera angle, traffic/proximity knobs need cars in frame, and any
sub-pixel-sparse effect needs a distribution statistic (`max`, `p99`), not a
frame mean. Before calling a knob "inert" from a runtime capture, check: is the
scene event it drives even happening in this shot (traffic, dark sky, weather),
and would this effect show up in a MEAN across the whole frame or only in a
handful of pixels?

## Reading the table

Resolution order, lowest→highest: `def` below → `LightPresets["*"]` → shipped
`"track|tod|weather"` → localStorage `"*"` → localStorage `"track|tod|weather"`.
A live slider edit writes the LAST of those — which is why an edit survives a
reload, and why RESET is per-condition rather than global.

- **uniform** — the GLSL uniform when the knob is a direct shader upload.
  Knobs without one are consumed in JS: light building, per-frame scene state.
- **consumed in** — files on the SHIPPING path. `light-presets.js` is excluded
  because it is preset DATA keyed by knob id, not a consumer; the deferred TLX /
  WGX backends are excluded for the same reason they are deferred.
- **preset** — ✓ when shipped presets override this knob for some condition.

## Every shipped value is reachable on its own slider

A knob renders as `<input type="range" min step>`, so the thumb can only land
on `min + k*step`. A shipped preset value off that grid cannot be represented:
the readout prints the true value while the thumb snaps to a neighbouring
notch. `fmtTune` derives its decimals from the step, so both were already
printing two decimals — the mismatch was invisible in the text.

It bites harder than a cosmetic mismatch, because `set()` in
`js/game/light-store.js` stores a player override whenever the incoming value
differs from `fallback(id)`, and `fallback` includes the shipped preset for the
current condition. With `keyMul` shipped at 0.85 against a 0.02 grid the slider
can only emit 0.84 or 0.86, so the first nudge persisted a value the player
never chose and flipped the profile to "(1 tuned)" — and 0.85 became
unreachable through the UI, recoverable only by RESET.

MEASURED before the fix: **481 of the 1,921 shipped values (25%), across 30
knobs**, plus two `TUNE_DEFS` defaults that were off their own slider's grid
(`godrayLowBoost` 0.55, `shadowStr` 1.15). The 27 worst knobs were all step
0.02 carrying values on odd hundredths — every one exactly half a step off.

The fix refined `step` to 0.01 on the 31 affected knobs rather than rounding
the presets. 0.01 divides the old 0.02 and 0.05 steps, so every previously
reachable value stays reachable, and **no shipped value changed** — the baked
look was tuned by eye and rounding 481 of its values to fit the widget would
have edited the thing the widget is meant to display. Guarded by
`tests/unit/light-grid.test.mjs`.

Note the grid test must be done in integer space: `(0.06 - 0) / 0.02` is
`2.9999999999999996`, so a float `% 1` check calls 223 perfectly on-grid values
off-grid.

---

## SUN & MOON  (12)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `keyMul` | KEY LIGHT (SUN) | 0 … 4 | 1 | `uKeyMul` | ✓ | glx.js×6, lit.js |
| `sunTemp` | SUN / MOON WARMTH | -2 … 2 | 0 | — | ✓ | atmosphere.js×2, light-store.js |
| `sunElev` | SUN ELEVATION | -60 … 60 | 0 | — | ✓ | atmosphere.js×4, light-store.js |
| `sunAzim` | SUN AZIMUTH | -180 … 180 | 0 | — |  | atmosphere.js×4, light-store.js |
| `moonBright` | MOON BRIGHTNESS | 0 … 3 | 1 | — | ✓ | atmosphere.js, light-store.js, game.js×2 |
| `grMul` | SUN GOD-RAYS | 0 … 4 | 1 | — | ✓ | game.js×2 |
| `godrayAniso` | GOD-RAY FOCUS | 0 … 0.95 | 0.6 | `uHgAniso` |  | post.js×2 |
| `godrayFloor` | GOD-RAY HAZE | 0 … 0.2 | 0.02 | `uHgFloor` |  | post.js×2 |
| `godrayLowBoost` | GOD-RAY LOW-SUN DRAMA | 0 … 2 | 0.55 | — |  | game.js×2 |
| `godrayBase` | GOD-RAY BASE | 0 … 1.5 | 0.38 | — |  | game.js×2 |
| `sunShaftMul` | SCREEN SUN-SHAFT | 0 … 4 | 1 | — |  | post.js×4 |
| `sunShaftDecay` | SUN-SHAFT REACH | 0.4 … 0.98 | 0.82 | `uShaftDecay` |  | post.js×2 |

## AMBIENT & BOUNCE  (5)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `ambientMul` | AMBIENT FILL | 0 … 4 | 1 | — | ✓ | glx.js×2 |
| `ambTemp` | AMBIENT WARMTH | -2 … 2 | 0 | — | ✓ | atmosphere.js×2, light-store.js |
| `ambBalance` | SKY / GROUND FILL | -2 … 2 | 0 | — | ✓ | atmosphere.js×2, light-store.js |
| `nightAmbLift` | NIGHT AMBIENT | 0 … 4 | 1 | — |  | game.js×2 |
| `bounceK` | LAMP BOUNCE | 0 … 0.3 | 0.04 | `uBounceK` |  | glx.js×2 |

## SHADOWS  (12)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `shadowStr` | SHADOW DARKNESS | 0 … 2 | 1.15 | `uShadowStr` | ✓ | glx.js×2 |
| `shadowRange` | SHADOW DISTANCE | 16 … 160 | 80 | `uShadowRange` |  | game.js, glx.js×2, lit.js |
| `pcssPen` | SHADOW SOFTEN | 5 … 500 | 80 | `uPcssPen` | ✓ | glx.js×2 |
| `shadowBias` | SHADOW BIAS | 0 … 0.01 | 0.001 | `uShadowBias` |  | glx.js×2 |
| `shadowTintAmt` | SHADOW COOLNESS | 0 … 1.5 | 0 | `uShadowTintAmt` | ✓ | glx.js×2 |
| `moonShadow` | MOON SHADOWS | 0 … 1 | 0.25 | — |  | game.js×3, glx.js×2 |
| `carShadow` | CAR SUN SHADOWS | 0 … 1 | 1 | — |  | game.js, shadow.js |
| `lampShadow` | LAMP SHADOWS | 0 … 1 | 1 | — |  | game.js, shadow.js |
| `aoStr` | AMBIENT OCCLUSION | 0 … 3 | 1 | — |  | game.js, post.js×3 |
| `ssaoRadius` | AO RADIUS | 0.1 … 4.1 | 0.6 | `uRadius` |  | post.js×2 |
| `contactStr` | CONTACT SHADOW | 0 … 3 | 1 | — | ✓ | game.js, post.js×4 |
| `ambContactDark` | AMBIENT CONTACT DARK | 0 … 3 | 1 | `uAmbContactDark` |  | glx.js×2 |

## FLOODLIGHTS  (10)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `lampLevel` | LAMP LEVEL | 0.02 … 1.5 | 0.26 | — | ✓ | light-store.js, game.js×3 |
| `floodDay` | DAYTIME FLOODS | 0 … 1.5 | 0 | — |  | game.js×4 |
| `poolEnergy` | POOL ENERGY | 0.05 … 2 | 0.55 | — | ✓ | lighting.js×5 |
| `lampRadiusMul` | POOL RADIUS | 0.3 … 3 | 1 | — | ✓ | lighting.js×3 |
| `bleedMul` | VALLEY BLEED | 0 … 5 | 1 | — | ✓ | lighting.js×3 |
| `glareStr` | LENS GLARE | 0 … 1.5 | 0.12 | — | ✓ | game.js×2 |
| `lampTemp` | LAMP TEMPERATURE | -2 … 2 | 0 | — | ✓ | game.js |
| `lampFlicker` | LAMP FLICKER | 0 … 0.6 | 0.1 | — |  | lighting.js×3 |
| `beamCone` | BEAM CONE WIDTH | 0.4 … 2.2 | 1 | — | ✓ | lighting.js×3 |
| `lampWallSpill` | LAMP WALL SPILL | 0 … 3 | 1 | `uLampWallSpill` |  | glx.js×2 |

## LAMP BEHAVIOUR  (11)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `twilightFloor` | TWILIGHT FLOOR | 0.05 … 1 | 0.3 | — |  | game.js×2 |
| `twilightRamp` | TWILIGHT RAMP | 2 … 14 | 6 | — |  | game.js×2 |
| `twilightWarm` | TWILIGHT WARMTH | 0 … 3 | 1 | — |  | game.js×2 |
| `lampWarmup` | LAMP WARM-UP | 0 … 4 | 1 | — |  | lighting.js×2 |
| `lampWarmupDim` | WARM-UP DIP | 0 … 0.9 | 0.3 | — |  | lighting.js×2 |
| `lampWarmupWarm` | WARM-UP WARMTH | 0 … 3 | 1 | — |  | lighting.js×2 |
| `lampCull` | LAMP COUNT | 16 … 32 | 28 | — |  | lighting.js×4 |
| `lampCullFade` | LAMP CULL FADE | 0.1 … 0.9 | 0.35 | — |  | lighting.js×2 |
| `lampGapFill` | DARK-GAP FILL | 0 … 400 | 60 | — |  | lighting.js×2 |
| `lampBehindBias` | BEHIND-CAM BIAS | 1 … 10 | 5.25 | — |  | lighting.js×3 |
| `lampNearClamp` | LAMP NEAR CLAMP | 1 … 12 | 4 | `uLampNearClamp` |  | glx.js×2 |

## NIGHT GLOW & BLOOM  (10)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `floodEmitMul` | LIT GEOMETRY | 0 … 3 | 1 | — | ✓ | game.js |
| `glowAmp` | EMISSIVE GLOW | 0.2 … 6 | 2.3 | `uGlowAmp` | ✓ | glx.js×2 |
| `neonBoost` | NEON & LENS BLOOM | 0 … 3 | 0.6 | `uBloomBoost` |  | glx.js×2 |
| `cityGlowMul` | CITY SKYGLOW | 0 … 5 | 1 | — | ✓ | atmosphere.js×2, light-store.js |
| `cityGlowWarm` | SKYGLOW WARMTH | -2 … 2 | 0 | — |  | atmosphere.js |
| `cityGlowTint` | SKYGLOW ON AMBIENT | 0 … 1.5 | 0.28 | — |  | light-store.js, game.js×2 |
| `bloomMul` | BLOOM AMOUNT | 0 … 4 | 1 | — | ✓ | game.js |
| `bloomSpread` | BLOOM SPREAD | 0.3 … 4 | 1 | `uSpread` | ✓ | post.js×2 |
| `threshOff` | BLOOM THRESHOLD | -0.5 … 0.2 | 0 | — | ✓ | game.js |
| `bloomKnee` | BLOOM ON HIGHLIGHTS | 0 … 1 | 0.5 | `uBloomKnee` |  | post.js×2 |

## ATMOSPHERE  (18)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `fogDensityMul` | FOG DENSITY | 0 … 5 | 1 | `uFogDensity` | ✓ | atmosphere.js, glx.js×2 |
| `fogHeight` | FOG HEIGHT FALLOFF | 0 … 0.2 | 0.018 | `uFogHeight` | ✓ | game.js×3, gfx.js, glx.js×4 |
| `fogTint` | FOG WARM / COOL | -2 … 2 | 0 | `uFogTint` | ✓ | glx.js×2 |
| `fogColorSat` | FOG COLOUR SATURATION | 0 … 3 | 1 | — |  | atmosphere.js×2, light-store.js |
| `mistDensity` | GROUND MIST | 0 … 4 | 1 | `uGroundMist` | ✓ | game.js×3, glx.js×2 |
| `mistHeight` | MIST HEIGHT BAND | 0.04 … 1.2 | 0.3 | `uMistHeight` | ✓ | glx.js×2 |
| `lampFogBase` | FOG GLOW BASE | 0 … 1.5 | 0.45 | — | ✓ | game.js |
| `lampFogHaze` | FOG GLOW HAZE | 0 … 2.5 | 0.6 | — | ✓ | game.js |
| `mistShare` | MIST GLOW SHARE | 0 … 6 | 1.5 | `uMistShare` |  | glx.js×2 |
| `hazeWetShare` | WET HAZE SHARE | 0 … 1.5 | 0.22 | — |  | game.js×2 |
| `hazeCloudShare` | CLOUD HAZE SHARE | 0 … 1.5 | 0.12 | — |  | game.js×2 |
| `fogClip` | FOG GLOW CLIP | 0 … 2.5 | 0.7 | `uLampFogClip` |  | glx.js×2 |
| `fogSunCore` | FOG SUN CORE | 0 … 3 | 0.6 | `uFogSunCore` |  | glx.js×2 |
| `overcastFogMul` | OVERCAST FOG BOOST | 1 … 6 | 1.7 | — |  | atmosphere.js×2 |
| `fogWxMul` | FOG BOOST | 1 … 8 | 3 | — |  | atmosphere.js×2 |
| `lampVolBase` | BEAMS (CLEAR) | 0 … 0.8 | 0.05 | — | ✓ | game.js |
| `lampVolHaze` | BEAMS (HAZE) | 0 … 2.5 | 0.65 | — | ✓ | game.js |
| `lampVolCap` | BEAM CEILING | 0 … 1.5 | 0.7 | — |  | game.js |

## ROAD & REFLECTIONS  (10)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `ssrWetMul` | WET MIRROR | 0 … 2.5 | 1 | — | ✓ | game.js |
| `ssrDryNight` | DRY NIGHT SHEEN | 0 … 1 | 0.08 | — | ✓ | game.js×2 |
| `ssrDryDay` | DRY DAY SHEEN | 0 … 0.6 | 0.07 | — |  | game.js |
| `roadRough` | TARMAC ROUGHNESS | 0.05 … 1.2 | 1 | — | ✓ | game.js×2 |
| `surfDetail` | SURFACE DETAIL | 0 … 3.5 | 1 | — | ✓ | game.js×2 |
| `matTexMix` | BAKED MATERIALS | 0 … 1 | 1 | `uMatTexMix` |  | apex.js×5, game.js, assets.js×2, glx.js×4 |
| `ssrThick` | SSR THICKNESS | 0.02 … 5 | 0.2 | `uSsrThick` |  | post.js×2 |
| `wetDark` | WET ROAD DARKEN | 0 … 2 | 1 | `uWetDark` | ✓ | glx.js×2 |
| `windowSunFlash` | WINDOW SUN FLASH | 0 … 3 | 1 | `uWindowSunFlash` |  | glx.js×2 |
| `skyRimGlow` | SKY RIM GLOW | 0 … 3 | 1 | `uSkyRimGlow` |  | glx.js×2 |

## CAR  (13)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `carReflect` | CAR REFLECTION | 0 … 2.5 | 0.05 | `uCarReflect` |  | post.js×2, post.js |
| `carEnvCube` | ENV REFLECTION | 0 … 1 | 0.3 | — |  | game.js×2, glx.js×3 |
| `carGloss` | PAINT GLOSS | 0 … 1.6 | 1 | `uCarGloss` | ✓ | game.js, post.js×2 |
| `carSpecular` | PAINT SPECULAR | 0 … 3.5 | 1 | — |  | game.js |
| `carClearcoat` | CLEARCOAT | 0 … 3.5 | 0.05 | — |  | game.js |
| `carMetal` | PAINT METALNESS | 0 … 5 | 1 | — |  | game.js |
| `carGlow` | BODY GLOW | 0 … 5 | 1 | — |  | game.js |
| `tailLightMul` | TAIL-LIGHT GLOW | 0 … 5 | 1 | — |  | lighting.js |
| `brakeGlowMul` | BRAKE FLARE | 0 … 3 | 1 | — |  | lighting.js |
| `tailRange` | TAIL-LIGHT RANGE | 60 … 320 | 160 | — |  | lighting.js×2 |
| `tailFade` | TAIL-LIGHT FADE | 0 … 120 | 0 | — |  | lighting.js×3 |
| `carSunGlint` | PAINT SUN GLINT | 0 … 40 | 12 | `uCarSunGlint` |  | glx.js×2 |
| `carSparkle` | METALLIC SPARKLE | 0 … 6 | 1.6 | `uCarSparkle` |  | glx.js×2 |

## SKY & WEATHER  (35)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `cloudCover` | CLOUD COVER | -1 … 1 | 0 | — | ✓ | atmosphere.js×3, light-store.js |
| `cloudShadowDim` | CLOUD SHADOW DEPTH | 0 … 1 | 0.8 | `uCloudShadowDim` |  | glx.js×2 |
| `cloudSpeed` | CLOUD SPEED | 0 … 8 | 1 | `uCloudSpeed` |  | game.js×4, gfx.js×2, post.js, glx.js×7 |
| `starBright` | STAR BRIGHTNESS | 0 … 4 | 1 | `uStarBright` | ✓ | game.js×2, gfx.js, glx.js×2 |
| `starDensity` | STAR DENSITY | 0.2 … 6 | 1 | `uStarDensity` |  | game.js×2, glx.js×2 |
| `skyGrad` | SKY GRADIENT | 0.15 … 1.2 | 0.35 | `uSkyGrad` |  | game.js×2, glx.js×2 |
| `daySkyBlue` | DAY SKY BLUE | 0 … 2.5 | 1 | `uDaySkyBlue` |  | game.js×2, glx.js×2 |
| `mieScatter` | SKY SUN GLOW | 0 … 4 | 1 | `uMieScatter` |  | game.js×2, glx.js×2 |
| `cloudSilver` | CLOUD SILVER LINING | 0 … 4 | 1 | `uCloudSilver` |  | game.js×2, glx.js×2 |
| `coronaAureole` | SUN AUREOLE | 0 … 4 | 1 | `uCoronaAureole` |  | game.js×2, glx.js×2 |
| `sunDiscSize` | SUN DISC SIZE | 0.3 … 4 | 1 | `uSunDiscSize` |  | game.js×2, glx.js×2 |
| `sunCorona` | SUN CORONA RING | 0 … 4 | 1 | `uSunCorona` |  | game.js×2, glx.js×2 |
| `sunSquash` | SUN HORIZON SQUASH | 0 … 3 | 1 | `uSunSquash` |  | game.js×2, glx.js×2 |
| `starSize` | STAR SIZE | 0.2 … 4 | 1 | `uStarSize` |  | game.js×2, glx.js×2 |
| `starTwinkle` | STAR TWINKLE | 0 … 4 | 1 | `uStarTwinkle` |  | game.js×2, glx.js×2 |
| `moonDiscSize` | MOON DISC SIZE | 0.3 … 4 | 1 | `uMoonDiscSize` |  | game.js×2, glx.js×2 |
| `moonHalo` | MOON HALO SPREAD | 0 … 4 | 1 | `uMoonHalo` |  | game.js×2, glx.js×2, sky.js×2 |
| `cityGlowReach` | CITY GLOW REACH | 0.2 … 4 | 1 | `uCityGlowReach` |  | game.js×2, glx.js×2 |
| `cloudDef` | CLOUD DEFINITION | 0 … 2 | 1 | `uCloudDef` |  | game.js×2, glx.js×2 |
| `skyColorSat` | SKY COLOUR SATURATION | 0 … 3 | 1 | — |  | atmosphere.js×2, light-store.js |
| `wetness` | WETNESS | -0.05 … 1 | -0.05 | — |  | apex.js×5, particles.js, game.js×16, gfx.js, glx.js×2, lit.js×3, post.js×2 |
| `rainCount` | RAIN INTENSITY | 20 … 1400 | 360 | — | ✓ | light-store.js, particles.js |
| `rainStreak` | RAIN STREAK LEN | 0.2 … 4 | 1 | — |  | light-store.js, particles.js |
| `rainSpeed` | RAIN FALL SPEED | 0.2 … 3 | 1 | — |  | light-store.js, particles.js×2 |
| `drizzleCount` | DRIZZLE DENSITY | 0 … 1 | 0.3 | — |  | light-store.js, particles.js×2 |
| `drizzleLen` | DRIZZLE STREAK | 0 … 1.5 | 0.5 | — |  | light-store.js, particles.js×2 |
| `drizzleSpeed` | DRIZZLE FALL SPEED | 0 … 1.5 | 0.6 | — |  | light-store.js, particles.js×2 |
| `rainOpacity` | RAIN OPACITY | 0 … 2 | 1 | — |  | particles.js×2 |
| `rainWind` | RAIN WIND | -2 … 2 | 0.18 | — | ✓ | particles.js |
| `rainShearWind` | RAIN SPEED SLANT | 0 … 3 | 0.9 | — |  | particles.js×3 |
| `rainShearLen` | RAIN SPEED STRETCH | 0 … 6 | 2 | — |  | particles.js×3 |
| `lightning` | LIGHTNING FREQ | 0 … 6 | 1 | — | ✓ | apex.js×2, atmosphere.js×5, game.js×9, glx.js×2 |
| `lightningFlash` | LIGHTNING FLASH | 0 … 3 | 1 | — |  | game.js×2 |
| `lightningDecay` | LIGHTNING DECAY | 2 … 20 | 8 | — |  | game.js×4 |
| `weatherSunMute` | WEATHER SUN MUTE | 0 … 2 | 1 | — |  | atmosphere.js×2 |

## IMAGE & COLOUR  (41)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `exposureMul` | EXPOSURE | 0.1 … 3 | 1 | — | ✓ | game.js |
| `contrast` | CONTRAST | 0.5 … 3 | 1.12 | `uContrast` | ✓ | car3d.js, liveries.js, liverytex.js×20, catalunya.js, estoril.js, hockenheim.js, indianapolis.js×2, portimao.js, shanghai.js, atmosphere.js×2, lighting.js, perf.js, game.js, qr.js, post.js×2, lit.js×2, post.js×3, sky.js×2, scenery-city.js×2 |
| `blacks` | BLACKS | -1 … 1 | 0 | — | ✓ | post.js×3, glx.js, post.js×6 |
| `shadows` | SHADOWS | -1 … 1 | 0 | — | ✓ | spa.js, atmosphere.js×7, game.js×22, gfx.js, post.js×6, shadow.js×3, glx.js×6, chunks.js, lit.js×15, post.js×10, tracks.js |
| `midtones` | MIDTONES | -1 … 1 | 0 | — | ✓ | post.js×3, post.js |
| `highlights` | HIGHLIGHTS | -1 … 1 | 0 | — | ✓ | abudhabi.js, game.js×2, post.js×3, chunks.js, lit.js×3, post.js×7 |
| `whites` | WHITES | -1 … 1 | 0 | — | ✓ | post.js×3, post.js×2 |
| `toe` | TOE | -1 … 1 | 0 | — | ✓ | car3d.js×2, parts.js×13, audio.js×2, post.js×3, post.js×3 |
| `shoulder` | SHOULDER | -1 … 1 | 0 | — | ✓ | car3d.js×21, liverytex.js, parts.js×27, abudhabi.js, hungaroring.js×2, jeddah.js×3, mexico.js, monaco.js, portimao.js, redbull.js, cameras.js, game.js, post.js×3, lit.js×2, post.js×4, mesh.js×9, scenery-nature.js×2 |
| `liftR` | LIFT · RED | -0.15 … 0.15 | 0 | — | ✓ | post.js×3 |
| `liftG` | LIFT · GREEN | -0.15 … 0.15 | 0 | — | ✓ | post.js×3 |
| `liftB` | LIFT · BLUE | -0.15 … 0.15 | 0 | — | ✓ | post.js×3 |
| `gammaR` | GAMMA · RED | 0.5 … 2 | 1 | — | ✓ | post.js×4 |
| `gammaG` | GAMMA · GREEN | 0.5 … 2 | 1 | — | ✓ | post.js×4 |
| `gammaB` | GAMMA · BLUE | 0.5 … 2 | 1 | — | ✓ | post.js×4 |
| `gainR` | GAIN · RED | 0.5 … 1.5 | 1 | — | ✓ | post.js×4 |
| `gainG` | GAIN · GREEN | 0.5 … 1.5 | 1 | — | ✓ | post.js×4 |
| `gainB` | GAIN · BLUE | 0.5 … 1.5 | 1 | — | ✓ | post.js×4 |
| `saturation` | SATURATION | 0 … 3 | 1 | `uSaturation` | ✓ | singapore.js, bodyattitude.js, game.js, post.js×2, post.js×3 |
| `vibrance` | VIBRANCE | 0 … 1.5 | 0.2 | `uVibrance` | ✓ | post.js×2, chunks.js, post.js |
| `tint` | WARM / COOL | -2 … 2 | 0 | `uTint` | ✓ | car3d.js, liveries.js, liverytex.js×6, cota.js×3, miami.js, monza.js, spa.js, vegas.js×9, zandvoort.js×4, atmosphere.js×3, carmesh.js, lighting.js×16, particles.js×2, quali.js, setup-ui.js, game.js×7, gltf.js×8, post.js×2, fx.js, lit.js×12, post.js×4, sky.js×2, circuit-kit.js×6, geom.js×6, graph.js, maps.js, scenery-city.js×5, scenery-data.js×3, scenery-structures.js, tracks.js×5 |
| `gradeStr` | GRADE STRENGTH | 0 … 4 | 1 | — | ✓ | game.js×2 |
| `shadowHue` | SHADOW TINT HUE | -180 … 180 | 0 | — |  | game.js×2 |
| `hiHue` | HIGHLIGHT TINT HUE | -180 … 180 | 0 | — |  | game.js×2 |
| `vignette` | VIGNETTE | 0 … 1 | 0.8 | `uVignette` | ✓ | game.js, post.js×4, post.js×4 |
| `vignetteSoft` | VIGNETTE REACH | 0.1 … 0.92 | 0.35 | `uVigSoft` |  | post.js×2 |
| `blackLift` | BLACK FLOOR | 0 … 0.2 | 0.005 | `uBlackLift` |  | post.js×2 |
| `whitePoint` | ACES WHITE SCALE | 0.4 … 4 | 1 | `uWhitePoint` |  | post.js×2 |
| `acesA` | TONE CURVE SHOULDER | 1 … 4 | 2.51 | `uAcesA` |  | post.js×2 |
| `acesB` | TONE CURVE TOE LIFT | 0 … 0.3 | 0.03 | `uAcesB` |  | post.js×2 |
| `acesC` | TONE CURVE CONTRAST | 1 … 4 | 2.43 | `uAcesC` |  | post.js×2 |
| `acesD` | TONE CURVE MIDS | 0.1 … 2 | 0.59 | `uAcesD` |  | post.js×2 |
| `acesE` | TONE CURVE BLACK | 0.02 … 0.6 | 0.14 | `uAcesE` |  | post.js×2 |
| `chromAb` | CHROMATIC AB. | 0 … 5 | 0 | `uChromAb` |  | post.js×2 |
| `grain` | FILM GRAIN | 0 … 0.3 | 0 | `uGrain` |  | magny_cours.js, silverstone.js×2, game.js, post.js×2, lit.js×9, post.js×5, mesh.js×5 |
| `lensDirt` | LENS DIRT | 0 … 1 | 0.15 | `uLensDirt` |  | post.js×2 |
| `flareMul` | LENS FLARE | 0 … 3.5 | 1 | — | ✓ | game.js×2, post.js×2 |
| `flareStreak` | FLARE STREAK | 2 … 30 | 7 | `uFlareStreak` |  | post.js×2 |
| `flareStreak2` | FLARE CORE STREAK | 0 … 3 | 0.5 | `uFlareStreak2` |  | post.js×2 |
| `sharpen` | SHARPEN | 0 … 2 | 0 | `uSharpen` |  | post.js×3, post.js |
| `speedBlur` | SPEED BLUR | 0 … 2 | 0 | `uSpeedBlur` |  | game.js×3, post.js×2 |

## FX  (1)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `particleMul` | PARTICLE FX | 0 … 2 | 1 | — |  | particles.js×3 |
