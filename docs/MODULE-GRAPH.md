# Module graph & script load order

No build step, no ES modules. Every file is a `"use strict"` IIFE that assigns
exactly one global; `index.html` loads them with `<script src="js/x.js?v=N">`
tags in **dependency order**. A file may *reference* a later-loaded global inside
its functions (they run after all scripts parse), but must not *call* one at
module-eval time. `js/game.js` loads last and does all boot-time invocation.

## Load order (index.html)

```
css/style.css                  all game styles
css/data.css                   data-hub overlay styles

js/mat4.js          → M4, V3     matrix/vector math        (no deps)
js/glx-shaders.js   → GLXShaders GLSL shader-source strings (no deps; consumed by glx.js)
js/glx.js           → GLX        WebGL2 renderer           (M4, GLXShaders)
js/gltf.js          → GLTF       .glb → {pos,nrm,col,idx}  (no deps; output feeds GLX.createMesh)
js/teams.js         → Teams      2026 grid data            (no deps)
js/circuits.js      → CircuitPaths  real OSM centrelines   (no deps; data only)
js/tracks/*.js      → TrackDefs  24 circuit definitions    (registers onto global TrackDefs list)
js/tracks-spline.js → TracksKit  spline engine             (creates the shared TracksKit namespace)
js/tracks-mesh.js   → (TracksKit) mesh builders            (extends TracksKit)
js/tracks-scenery.js→ (TracksKit) procedural scenery       (extends TracksKit; see SCENERY-API.md)
js/tracks.js        → Tracks     public engine API         (TracksKit, TrackDefs, CircuitPaths, GLX)
js/trackmaps.js     → TrackMaps  2D outlines for track picker (Tracks)
js/car3d.js         → Car3D      procedural car geometry   (GLX mesh format, Teams colours)
js/input.js         → Input      keyboard/gamepad/touch/tilt (no deps)
js/audio.js         → GameAudio  WebAudio synth            (no deps)
js/api.js           → F1API      Jolpica + OpenF1 clients  (no deps; localStorage cache)
js/data.js          → DataHub    data-hub DOM overlay      (F1API, Teams)
js/parts.js         → Parts      upgrade catalog           (no deps)
js/ghost.js         → Ghost      TT ghost-lap data layer   (no deps; localStorage)
js/game-config.js   → AXC        config constants + physics knobs (no deps)
js/game-state.js    → AX         shared mutable state bag  (AXC)
js/game-weather.js  → AXWeather  applyRaceSettings + rain  (AXC, AX; .init(deps))
js/game-track.js    → AXTrack    loadTrack + field setup   (AXC, AX; .init(deps))
js/game-ui.js       → AXUi       menu/panel/slider wiring  (AXC, AX, AXTrack; .init(deps))
js/game-hud.js      → AXHud      race HUD + minimap        (AXC, AX; .init(deps))
js/game.js          → (none)     main loop; sets window.__apex (everything above)
```

## The `tracks-*` and `game-*` splits

`glx.js`, `tracks.js` and `game.js` were each split into several files. Two
conventions:

- **`TracksKit`** — an internal namespace (not on `window`) that
  `tracks-spline.js` creates and `tracks-mesh.js` / `tracks-scenery.js` extend;
  `tracks.js` reads it to expose the public `Tracks` global. Load the four in
  order.
- **`AXC` / `AX`** — plain namespaces (`window.AXC`, `window.AX`) holding config
  constants and shared mutable state; every `game-*` file reads them directly.
  **`AXWeather` / `AXTrack` / `AXUi` / `AXHud`** are IIFEs that expose an
  `.init(deps)`; `game.js` calls each once at boot, passing its DOM cache and
  the closures those subsystems need (they never reach back into game.js's
  scope directly). `game.js` still owns *all* boot-time invocation.

## Dependency graph

```
mat4 ──► glx ◄─ glx-shaders ┐
gltf ──────────────────────┤
teams ──► car3d ───────────┤
circuits ─► tracks ◄─ tracks/*.js (TrackDefs)
   tracks-spline ─► tracks-mesh ─► tracks-scenery ─► tracks (TracksKit chain)
              │  └─► trackmaps ───┤
input ─────────────────────┤
audio ─────────────────────┤
api ──► data (DataHub) ────┤
parts ─────────────────────┤
ghost ─────────────────────┤
game-config (AXC) ─► game-state (AX) ─► game-weather/track/ui/hud (AX*)
                                          └──► game.js ──► window.__apex
```

Key edges:
- **glx.js ← glx-shaders.js**: `glx.js` destructures `GLXShaders` at eval time,
  so the shader file must load first.
- **TracksKit chain**: `tracks-spline.js` → `tracks-mesh.js` →
  `tracks-scenery.js` → `tracks.js`, in that order — each extends the shared
  `TracksKit` namespace the previous one created.
- **game-* ← AXC/AX**: `game-config.js` (`AXC`) then `game-state.js` (`AX`) must
  load before every other `game-*` file and `game.js` (they destructure both).
- **tracks.js ← TrackDefs**: every `js/tracks/*.js` must load *before* tracks.js
  (each registers its def; tracks.js builds `Tracks.LIST` from them at eval time).
- **tracks.js → GLX**: `Tracks.build()` uploads meshes via `GLX.createMesh` /
  `GLX.createChunkedMesh` (guarded by `typeof GLX !== "undefined"` for the
  headless `tools/verify-track.cjs` path, which runs tracks.js without a GL context).
- **game.js → everything**: the only module that calls other modules at boot.
  It assigns **no global of its own** — its public surface is `window.__apex`
  (the debug/test API documented in `docs/DEBUG-HOOKS.md`).
- **DataHub is an island**: DOM overlay + F1API only; the game never depends on it.

## Rules when adding a file

1. Add the `<script>` tag in dependency position (before the first file that
   references your global at eval time; game.js stays last).
2. Use the same `?v=N` as every other tag, and bump N (see CLAUDE.md cache-busting).
3. One IIFE, one global, `"use strict"`, no `import`/`export`.
4. No DOM or localStorage access at module top level (api.js documents this
   convention) — do it lazily inside functions so headless tools can load the file.
