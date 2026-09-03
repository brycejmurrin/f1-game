# Lighting symptoms, A/B capture, contract tests

Load this when a look complaint has a named field, or when validating a
`applyRaceSettings` / knob edit.

## lightState() fields → pipeline

```js
__apex.lightState()
// {
//   ambientSky:    [r,g,b]   → uAmbSky
//   ambientGround: [r,g,b]   → uAmbGround
//   sunColor:      [r,g,b]   → directional sun
//   exposure:      number    → tone-map multiplier
//   numLights:     number    → point lights (0 = day, >0 = floodlit)
//   sunY:          number    → sin(elevation); 1 = zenith
//   builtNight:    bool      → meshes built for night
//   trackNight:    bool      → track's own night-default flag
//   floodEmit:     number    → mast emissive intensity
// }
```

`tools/apex-eval.mjs` and `tools/capture/apex-capture.mjs` launch Chromium via
Playwright — they need a browser install. Do not run them while a Playwright
group is already in flight.

```sh
node tools/apex-eval.mjs vegas "a.lightState()"
node tools/apex-eval.mjs monaco "a.lightState()"
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw
```

Monza has `night:false` — prefer vegas/singapore for night probes.

## Before/after a code change

```sh
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw > artifacts/tmp/before.json
# edit applyRaceSettings (js/lighting/atmosphere.js) or a TUNE_DEFS default
# bump-cache last, then:
node tools/apex-eval.mjs vegas "(a.setTimeOfDay('night'), a.lightState())" --raw > artifacts/tmp/after.json
diff artifacts/tmp/before.json artifacts/tmp/after.json
```

Visual same-corner A/B:

```sh
node tools/capture/apex-capture.mjs cameras monza scratch/captures/apex-capture/lighting-before
node tools/capture/apex-capture.mjs cameras monza scratch/captures/apex-capture/lighting-after
```

Or in a Playwright page: `setTimeOfDay("night")`, wait ~1400 ms for the dark
rebuild, `orbit(0.15, 45, 20, 60)`, then screenshot `canvas#game`.

## Symptom → field → knob

| Symptom | Field | Likely fix |
|---|---|---|
| Night looks like day | `ambientSky` too bright, `numLights` = 0 | Inspect shipped `LightPresets["track\|tod\|weather"]` first; then `lightTune({ambientMul})` / night ambient cap. Track may not trigger a dark rebuild |
| Floodlights not firing | `numLights === 0` on a dark track | `buildTrackLights` guard — `track.def.night` (Monza is `false`) |
| Floodlight masts invisible | `floodEmit === 0` | Night emissive in `buildProps`; `lightTune({floodEmitMul})` |
| Dawn sun too high | `sunY` close to 1.0 | `lightTune({sunElev: -N})`; structural default in `applyRaceSettings` |
| Washed out / bloom too strong | `exposure` / bloom knobs hot | `lightTune({exposureMul, bloomMul, threshOff, bloomKnee})`; check shipped presets |
| Ambient wash | `ambientGround` too bright | `lightTune({ambientMul})`; night branch caps ambient |
| Lamps too bright / dim | pool blow-out or dark valleys | `lightTune({lampLevel, poolEnergy, bleedMul})` |
| Sun/moon too warm/cold | `sunColor` skew | `lightTune({sunTemp: ±N})` — key light only, `-2..2` |
| Shadow/ambient too warm/cold | hemisphere skew | `lightTune({ambTemp: ±N})` — independent of `sunTemp` |
| Lamps the wrong colour | lamp tint fights the scene | `lightTune({lampTemp: ±N})` over `LAMP_KINDS` |
| Night skyglow wrong hue | city dome + bloom-adjacent ambient | `lightTune({cityGlowWarm: ±N})`; 0 = per-theme tint |
| Fog too warm/cold | distance-haze tint | `lightTune({fogTint: ±N})` |
| Overall image cast | final grade, not scene lights | `lightTune({tint: ±N})` — do not use this to fix a lamp or sun |

A shipped stacking example: `LightPresets["jeddah|dawn|dry"]` in
`js/lighting/presets.js` sets `sunTemp`, `tint`, `sunElev`, `ambTemp`, and
the lamp/mist/star knobs together.

## Contract tests

Day/night **light counts and exposure**:

```sh
node tools/test-bg.mjs gfx      # lighting-ab + tuner-grade + webgl-probes + tlx
npm test -- tests/specs/lighting-ab.spec.js   # lighting-ab only
```

`tests/specs/lighting-tuner-grade.spec.js` is **IMAGE & COLOUR UI grading
only** — it does not check `numLights` or day/night ambient. After any
`applyRaceSettings` edit, run `npm test -- tests/specs/lighting-ab.spec.js` first (accidentally lighting the
night scene like day).
