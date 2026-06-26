---
name: inspect-scene
description: Capture deterministic screenshots of a track, car, or UI screen using the __apex camera hooks (park/freeze + view/eyeAt/orbit/roadside/cinematic) driven through Playwright headless Chromium. Use to visually verify a scenery/livery/lighting/track change, generate before/after shots, or frame a specific corner. Triggers - "show me the track", "screenshot Monaco at the chicane", "does this look right", "capture the car livery", "before/after of my change".
---

# Inspect / screenshot a scene

The renderer is WebGL2 and runs headless under SwiftShader, so screenshots are
**reproducible**. Frame shots deterministically with the `__apex` camera hooks
rather than driving the car there. Use the helper script in this skill folder.

## Quick use

```sh
node .claude/skills/inspect-scene/shot.mjs <trackId> <frac> [cam] [out.png]
# examples:
node .claude/skills/inspect-scene/shot.mjs monaco 0.18 orbit  scratch/monaco-chicane.png
node .claude/skills/inspect-scene/shot.mjs spa    0.07 eye    scratch/eau-rouge.png
node .claude/skills/inspect-scene/shot.mjs vegas  0.50 park   scratch/vegas-night.png
```
It boots `python3 -m http.server`, waits for `__apex`, freezes the scene, frames
the camera, and writes a PNG. A blank/dark canvas comes out < ~5 KB; a real 3D
frame is tens of KB (the suite's non-blank heuristic).

## Framing hooks (all clear when you switch back to a game `camera()`)

```js
__apex.park(frac, lateral?)          // stationary + frozen for a clean shot
__apex.freeze(true)                  // pause sim, keep rendering
__apex.eyeAt(frac, lat, height)      // driver's-eye: how it reads at the wheel
__apex.orbit(frac, az, el, dist, h)  // orbit a track point — inspect from all sides
__apex.view({ s, side, dist, height, look })   // trackside survey (look in/out/fwd/back)
__apex.cinematic(frac)               // auto outside-of-corner cinematic framing
__apex.carOrbit(idx, az, el, dist)   // orbit any car (livery / car3d checks)
__apex.setTimeOfDay("night"|"dusk"|"day"); __apex.weather("wet")   // lighting/weather variants
__apex.groundY(frac, lat)            // numeric gap finder (terrain vs road) — pairs with eye shots
```

## UI screens

The menu/setup/results screens are DOM, not canvas — for those follow the
`tests/ui-audit.spec.js` pattern (navigate the menus, `page.screenshot` to
`tests/ui-screenshots/`) and use `tests/f1-api-mock.js` so the data hub renders
without network egress. Portrait UI uses `{width:390,height:844}`; in-race shots
must use **landscape** `{width:844,height:390}` to avoid the `#rotate-device`
overlay.

## Notes

- **Port and browser discovery are automatic.** `shot.mjs` uses `freePort()` to
  pick an available port at runtime — no manual port configuration needed. It also
  resolves Chromium from `/opt/pw-browsers/chromium` automatically when present,
  so there is no need to set `PLAYWRIGHT_BROWSERS_PATH` or pass a browser path by
  hand.
- Default output goes under the scratchpad / `scratch/` — don't commit
  throwaway screenshots into the repo. Visual-regression baselines under
  `tests/` are updated only via `npx playwright test --update-snapshots`.
- For before/after: capture with the same `(track, frac, cam)` args on each side
  of the change so only the pixels you care about differ.
