# Atmosphere, grading, shadows (adapted)

<!-- Source: https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills
     Commit: 897aaa0a49f9346f342993e1eb74a30479f82614
     License: MIT -->

Translate Three.js terms to Apex knobs (`js/lighting/`, `lightTune`, `applyRaceSettings`, TLX post).

| Upstream theme | Apex lever |
|---|---|
| Aerial perspective / fog | `fog`, `horizon`, presets in `presets.js` |
| Exposure / tone map | `exposure`, ACES path per backend; night washout → verify `lightState` |
| Shadow bias / cascades | GLX `glx-shadow`; TLX `-shadow.js`; not scenery masts |
| Color grading / bloom | Post stack; shader defects → **renderer-debug** |
| Wet surfaces / rain | `weatherArc`, surface shaders; precipitation visuals → scenery + lighting |

Bake workflow: `scripts/bake.mjs`, `references/bake.md`. Validate with `__apex.lightState()` and one dusk/night screenshot (**playwright-probe**).
