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

js/mat4.js        → M4, V3     matrix/vector math          (no deps)
js/glx.js         → GLX        WebGL2 renderer             (M4)
js/gltf.js        → GLTF       .glb → {pos,nrm,col,idx}    (no deps; output feeds GLX.createMesh)
js/teams.js       → Teams      2026 grid data              (no deps)
js/circuits.js    → CircuitPaths  real OSM centrelines     (no deps; data only)
js/tracks/*.js    → TrackDefs  24 circuit definitions      (registers onto global TrackDefs list)
js/tracks.js      → Tracks     spline engine + mesh builder (TrackDefs, CircuitPaths, GLX)
js/trackmaps.js   → TrackMaps  2D outlines for track picker (Tracks)
js/car3d.js       → Car3D      procedural car geometry     (GLX mesh format, Teams colours)
js/input.js       → Input      keyboard/gamepad/touch/tilt (no deps)
js/audio.js       → GameAudio  WebAudio synth              (no deps)
js/api.js         → F1API      Jolpica + OpenF1 clients    (no deps; localStorage cache)
js/data.js        → DataHub    data-hub DOM overlay        (F1API, Teams)
js/parts.js       → Parts      upgrade catalog             (no deps)
js/ghost.js       → Ghost      TT ghost-lap data layer     (no deps; localStorage)
js/game.js        → (none)     main loop; sets window.__apex (everything above)
```

## Dependency graph

```
mat4 ──► glx ──────────────┐
gltf ──────────────────────┤
teams ──► car3d ───────────┤
circuits ─► tracks ◄─ tracks/*.js (TrackDefs)
              │  └─► trackmaps ───┤
input ─────────────────────┤
audio ─────────────────────┤
api ──► data (DataHub) ────┤
parts ─────────────────────┤
ghost ─────────────────────┴──► game.js ──► window.__apex
```

Key edges:
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
