---
name: lighting-tuner
description: Use when the user says night looks washed out/like day, dawn sun is too high, floodlights/lamps aren't firing, day scene is flat, ambient/exposure/bloom/fog/lighting slider/lightTune/applyRaceSettings issues, or wants to validate Apex 26 lighting.
---

# Tune and validate scene lighting via __apex probes

**Reach for the tuner knobs FIRST.** Nearly every hand-tuned lighting value is a
live `TUNE_DEFS` knob (js/game/lighting.js) read via `LT.<id>` each frame — sun/ambient,
shadows, floodlights, bloom, fog/mist, reflections, car paint, image grade.
Prefer adjusting a knob over editing a literal in `applyRaceSettings`:

```js
__apex.lightTune()                    // current resolved knob values
__apex.lightTune({ lampLevel: 0.4 })  // set knobs live (same as the panel sliders)
```

Knob resolution, lowest→highest precedence: `TUNE_DEFS.def` → shipped
`js/game/light-presets.js` `"*"` → shipped `"track|tod|weather"` → localStorage
`"*"` (legacy global profile) → localStorage **`track|tod|weather`** (current
condition). **Live slider edits write the current condition key** in
`apex26.lightTune` (`LightStore.set` → `profiles[key()]`), **not** global `"*"`.
Ship a look by baking the panel's COPY VALUES export into
`js/game/light-presets.js` (see the **bake-lighting** skill). Edit
`applyRaceSettings` only for STRUCTURAL changes (new branch logic, per-theme
behavior) — not for values a knob already owns.

**Why do my edits survive reload?** localStorage (`apex26.lightTune`) outranks
shipped `LightPresets`, so a baked baseline does not overwrite what you tuned in
the panel. Use **RESET** in the LIGHTING TUNER for the **current** track/tod/weather
to drop back to shipped values. Legacy `"*"` profiles from older saves may still
persist — clear that key in DevTools if a global override keeps winning.

A shipped example of stacking white-balance knobs: `LightPresets["jeddah|dawn|dry"]`
in `js/game/light-presets.js` sets both `sunTemp: -0.35` (warm the low dawn sun)
and `tint: 0.1` (warm the overall grade slightly on top) alongside `sunElev`,
`ambTemp`, and the lamp/mist/star knobs — a good reference for how a real
preset combines the warmth knobs rather than reaching for just one.

`lightState()` returns the full resolved lighting snapshot *after*
`applyRaceSettings` has run.  Compare before/after any change to confirm it
actually affected the scene — don't guess from the CLAUDE.md description.

## lightState() fields → rendering pipeline

```js
__apex.lightState()
// {
//   ambientSky:    [r,g,b]   → uAmbSky  (top-hemisphere ambient)
//   ambientGround: [r,g,b]   → uAmbGround (bottom-hemisphere ambient)
//   sunColor:      [r,g,b]   → directional sun (scene lighting)
//   exposure:      number    → tone-map exposure multiplier
//   numLights:     number    → active point lights (0 = day, >0 = floodlit)
//   sunY:          number    → sin(elevation) — how high the sun is (1=zenith)
//   builtNight:    bool      → meshes built for night (dark road, emissive masts)
//   trackNight:    bool      → track's own night-default flag
//   floodEmit:     number    → floodlight mast emissive intensity
// }
```

## One-off inspection

`tools/apex-eval.mjs` and `tools/capture/apex-capture.mjs` launch **Chromium via
Playwright** — they need a browser install (`npx playwright install chromium`).

```sh
# What does Vegas look like in night vs day mode?
node tools/apex-eval.mjs vegas "a.lightState()"
node tools/apex-eval.mjs monaco "a.lightState()"

# After calling setTimeOfDay live (Monza has night:false — prefer vegas/singapore):
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw
```

## Before/after workflow (validate a code change)

```sh
# 1. Capture baseline (Monza has night:false — use vegas or singapore for night)
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw > artifacts/tmp/before.json

# 2. Edit applyRaceSettings in js/game/atmosphere.js (or a TUNE_DEFS default in js/game/lighting.js)
# 3. Bump cache version, reload

# 4. Capture after
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw > artifacts/tmp/after.json

# 5. Diff
diff artifacts/tmp/before.json artifacts/tmp/after.json
```

## Visual validation with orbit()

```sh
# Screenshot the same corner in day vs night to compare visually
node tools/capture/apex-capture.mjs cameras monza scratch/captures/apex-capture/lighting-before
# (edit applyRaceSettings)
node tools/capture/apex-capture.mjs cameras monza scratch/captures/apex-capture/lighting-after
```

Or via `apex-eval` in a single script:
```js
// In a Playwright page:
__apex.setTimeOfDay("night");
await sleep(1400); // wait for dark rebuild
__apex.orbit(0.15, 45, 20, 60);  // frame turn 1
// screenshot canvas#game
```

## What to check for common complaints

| Symptom | Field to check | Likely fix |
|---|---|---|
| "Night looks like day" | `ambientSky` too bright, `numLights` = 0 | **Also inspect shipped `LightPresets["track\|tod\|weather"]` in `js/game/light-presets.js`** before only live-tuning — a baked preset may be washing the scene out. Then `lightTune({ambientMul})` / night ambient cap in `applyRaceSettings`, or track doesn't trigger dark rebuild |
| "Floodlights not firing" | `numLights === 0` on a dark track | `buildTrackLights` guard — check `track.def.night` (Monza is `false`; use singapore/vegas for night probes) |
| "Floodlight masts invisible" | `floodEmit === 0` | Night emissive not applied in `buildProps`; check `lightTune({floodEmitMul})` |
| "Dawn sun too high" | `sunY` close to 1.0 | `lightTune({sunElev: -N})` (deg offset); structural default lives in `applyRaceSettings` |
| "Scene washed out" / bloom too strong | `exposure` too high, bloom knobs hot | `lightTune({exposureMul, bloomMul, threshOff, bloomKnee})`; try `setTimeOfDay('dusk')` + check shipped `LightPresets` for the condition |
| "Scene washed out (ambient)" | `ambientGround` too bright | `lightTune({ambientMul})`; night branch caps ambient |
| "Lamps too bright / too dim" | pool blow-out or dark valleys | `lightTune({lampLevel, poolEnergy, bleedMul})` |
| "Sun/moonlight too warm or too cold" | `sunColor` skew | `lightTune({sunTemp: ±N})` — white-balance of the direct key light only, unclamped mix, `-2..2` |
| "Shadow/ambient areas too warm or too cold" | `ambientSky`/`ambientGround` skew | `lightTune({ambTemp: ±N})` — hemisphere fill white-balance, independent of `sunTemp` |
| "Floodlights/street lamps the wrong colour" | lamp tint fights the scene | `lightTune({lampTemp: ±N})` — shifts ALL lamps toward sodium/amber (−) or LED/broadcast white (+), layered over each lamp kind's own colour (see `LAMP_KINDS` in `js/game/lighting.js`) |
| "Night skyglow/bloom the wrong hue" | city dome + bloom-adjacent ambient hue | `lightTune({cityGlowWarm: ±N})` — cools toward LED/mercury (−) or warms toward sodium amber (+); 0 = per-theme shipped tint |
| "Fog reads too warm or too cold" | distance-haze tint | `lightTune({fogTint: ±N})` — + warm/amber-dusty, − cool/blue-overcast |
| "Overall image warm/cool cast" | final grade, not the scene lights | `lightTune({tint: ±N})` — IMAGE & COLOUR grade knob, applied after lighting; don't reach for this to fix a lamp or sun colour, which have their own knobs above |

## Writing a lightstate contract test

Day/night **light counts and exposure** are asserted in:

```sh
npx playwright test tests/specs/webgl-probes.spec.js   # mobile tier GL errors + render probes
npx playwright test tests/specs/lighting-ab.spec.js    # "night light budget: lamps on at night, off by day"
```

`tests/specs/lighting-tuner-grade.spec.js` is **IMAGE & COLOUR UI grading only** (tonal
range, lift/gamma/gain knobs, persist/reset/export) — it does NOT check
`numLights` or day/night ambient. After any `applyRaceSettings` edit, run
`lighting-ab.spec.js` first for the common regression (accidentally lighting the
night scene like day).
