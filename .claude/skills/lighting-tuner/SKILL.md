---
name: lighting-tuner
description: Tune and validate per-time-of-day atmosphere settings in applyRaceSettings (game.js) using live lightState() probes and orbit() screenshots — no guesswork. Use when "night looks washed out", "dawn sun is too high", "floodlights aren't firing on this track", "day scene is flat", or validating a lighting change before committing. Triggers - "lighting", "night looks wrong", "floodlights", "ambient", "sun colour", "time of day", "dawn", "dusk", "applyRaceSettings".
---

# Tune and validate scene lighting via __apex probes

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

```sh
# What does Vegas look like in night vs day mode?
node tools/apex-eval.mjs vegas "a.lightState()"
node tools/apex-eval.mjs monaco "a.lightState()"

# After calling setTimeOfDay live:
node tools/apex-eval.mjs monza "(a.setTimeOfDay('night'), a.lightState())" --raw
```

## Before/after workflow (validate a code change)

```sh
# 1. Capture baseline
node tools/apex-eval.mjs monza "(a.setTimeOfDay('night'), a.lightState())" --raw > /tmp/before.json

# 2. Edit applyRaceSettings in js/game.js
# 3. Bump cache version, reload

# 4. Capture after
node tools/apex-eval.mjs monza "(a.setTimeOfDay('night'), a.lightState())" --raw > /tmp/after.json

# 5. Diff
diff /tmp/before.json /tmp/after.json
```

## Visual validation with orbit()

```sh
# Screenshot the same corner in day vs night to compare visually
node tools/apex-capture.mjs cameras monza scratch/lighting-before
# (edit applyRaceSettings)
node tools/apex-capture.mjs cameras monza scratch/lighting-after
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
| "Night looks like day" | `ambientSky` too bright, `numLights` = 0 | `applyRaceSettings` not flooring night ambient, or track doesn't trigger dark rebuild |
| "Floodlights not firing" | `numLights === 0` on a dark track | `buildTrackLights` guard condition — check `track._night` flag |
| "Floodlight masts invisible" | `floodEmit === 0` | Night emissive not applied in `buildProps` |
| "Dawn sun too high" | `sunY` close to 1.0 | Lower the dawn sun elevation in `applyRaceSettings` |
| "Scene washed out" | `exposure` too high or `ambientGround` too bright | Cap ambient in the night branch |

## Writing a lightstate contract test

```js
// tests/lightstate.spec.js (already created)
// Run with: npx playwright test tests/lightstate.spec.js
```

The spec asserts: day → `numLights === 0`, night → `numLights > 0` with darker
ambient.  After any `applyRaceSettings` edit, run this spec first — it catches
the most common regression (accidentally lighting the night scene like day).
