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
`"*"` (player's GLOBAL slider edits) → legacy localStorage per-condition.
Slider edits write the global `"*"` profile; ship a look by baking the panel's
COPY VALUES export into `js/game/light-presets.js` (see the **bake-lighting**
skill). Edit `applyRaceSettings` only for STRUCTURAL changes (new branch
logic, per-theme behavior) — not for values a knob already owns.

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

`tools/apex-eval.mjs` and `tools/apex-capture.mjs` launch **Chromium via
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
node tools/apex-capture.mjs cameras monza scratch/captures/apex-capture/lighting-before
# (edit applyRaceSettings)
node tools/apex-capture.mjs cameras monza scratch/captures/apex-capture/lighting-after
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
| "Scene washed out" | `exposure` too high or `ambientGround` too bright | `lightTune({exposureMul, ambientMul})`; night branch caps ambient |
| "Lamps too bright / too dim" | pool blow-out or dark valleys | `lightTune({lampLevel, poolEnergy, bleedMul})` |

## Writing a lightstate contract test

Day/night **light counts and exposure** are asserted in:

```sh
npx playwright test tests/webgl-probes.spec.js   # mobile tier GL errors + render probes
npx playwright test tests/lighting-ab.spec.js    # "night light budget: lamps on at night, off by day"
```

`tests/lighting-tuner-grade.spec.js` is **IMAGE & COLOUR UI grading only** (tonal
range, lift/gamma/gain knobs, persist/reset/export) — it does NOT check
`numLights` or day/night ambient. After any `applyRaceSettings` edit, run
`lighting-ab.spec.js` first for the common regression (accidentally lighting the
night scene like day).
