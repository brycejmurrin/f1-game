# Garage — where things live

Moved from SKILL.md; the skill links here.

| Area | Path | Contract |
|---|---|---|
| GARAGE UI sheet | `js/garage/setup-sheet.js` | `create(G)` → `openSetup` / `buildSetup`; `#carsetup` DOM |
| 3D bay draw | `js/garage/scene.js` | `init`, `buildStatic`, `draw`, `live` pit board; uses `scene-prims.js`, `scene-equipment.js` |
| Preview camera | `js/garage/setup-camera.js` | `create`, `panelCover`, `presentOpts`, `glareScale` |
| Arrival motion | `js/garage/arrival.js` | Pit-lane entry into the bay (not race `PitLane`); changing the motion → **f1-animation-cameras** |
| Title prebuild | `js/garage/prebuild.js` | `GaragePrebuild.create` — warm room/car; `__apex.garagePrebuild()` |
| Backend pick | `js/render/gfx.js` | `Gfx.create(canvas)` → TLX / GLX / WGX; `game.js` holds `gfx` for race + studio |
| Car mesh facade | `js/car/car3d.js`, `js/car/car-draw.js` | Field + garage `Car3D` build; livery textures via `liverytex.js` |
| Car geometry | `js/car/car-body-geom.js`, `car-mesh.js`, `car-wheels.js`, `car-geometry.js` | the `fit*` / `coverSurfaceY` builders `car3d.js` calls; after an edit run apex-lsp `lsp_outline` + `lsp_diagnostics` on the module (two `function X` in one IIFE: the later silently wins) |
| Finishes | `js/car/car-materials.js` | `FINISH_SURFACE` and material params |
| Livery design | `js/garage/livery-design-editor.js`; `js/car/livery-design.js`, `livery-graphics.js`, `livery-stations.js`, `custom-liveries.js` | the paint editor; graphics, stations, saved custom liveries |
| Setup sheet helpers | `js/garage/setup-presets.js`, `setup-tune.js`, `setup-trials.js`, `setup-experiments.js` | presets, tune, trials, experiments behind `#carsetup` |
| Agent garage shots | `js/agent/apex.js` | `garageCam()`, `garagePrebuild()`, `render({what:"car"})` |

