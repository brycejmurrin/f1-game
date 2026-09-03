---
name: new-track
description: Use when the user asks to add a track/circuit, edit Monza/Spa/etc. layout, change circuit geometry/metadata/palette/theme/bridges/elevation, or register a new circuit in js/circuits/. Corner/terrain diagnosis → agent-view; picture-driven accuracy → survey-track; scenery(api) props → scenery-dress.
---

# Author or edit a track

Each circuit is a self-contained IIFE in `js/circuits/<id>.js` that pushes a plain
data object onto the global `window.TrackDefs` list — **the def is the single home
of everything about that circuit**: its real centreline (`path`), curated markings
(`sectors`/`turns`), dressing rows (`barrier`, `furniture`, `kit`, `standSet`,
`cityStyle`) and its scenery callback. The engine (`js/track/tracks.js`) reads
`TrackDefs`, builds a Catmull-Rom spline from `path` (a def without one is a build
error naming the circuit — there is no hand-authored fallback), and extrudes the
road, terrain, and prop meshes. **Track files load before `js/track/tracks.js`** in
`index.html`.

## Track-definition schema

```js
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push({
    id: "newtrack",          // unique; matches filename and __apex.race("newtrack")
    name: "NEW TRACK",        // display name
    gp: "Grand Prix Name",
    country: "Country",
    night: false,             // default lighting (true = night-default circuit)
    classic: false,           // true = retired/off-calendar; appended after the 24 season rounds
    theme: "green",           // green | desert | street_day | street_night | modern
    lengthKm: 5.5,            // approx lap length (display + scenery density)
    baseHW: 7.5,              // default half-width in metres

    // optional:
    reverse: false,           // flip lap direction (when the bundled OSM trace runs the wrong way)
    startFrac: 0.28,          // rotate the start line to a fraction of the lap
    street: true,             // continuous-barrier street circuit (no terrain ribbon)
    banked: false,            // auto-banking profile on tight corners (Zandvoort)
    pal: { /* zenith, horizon, sun, sunDir, grass, asphalt, line, kerbA, kerbB, fog, ambientSky, ambientGround ... */ },

    // GEOMETRY — REQUIRED. The real centreline: [x,z] metres, recentred, one lap,
    // open loop. `node tools/import-circuit-path.mjs <id>:<featureId>` emits this
    // line from the bacinger/f1-circuits OSM trace; paste it here.
    path: { len: 5431, pts: [[-150.5,-809.2],[36.7,-842.1], /* … */] },

    // MARKINGS — RACING-LAP fractions (post startFrac/reverse), never fmap'd.
    sectors: [0.32, 0.66],         // S1/S2 ends; omit → thirds
    turns: [0.0455, 0.0755 /* … */], // curated apexes in lap order; index 0 = Turn 1

    // DRESSING — the per-circuit rows the engine used to keep in id-keyed tables.
    // Every field is optional; absent → FURN_DEF / KIT_DEF / THEME_DEF / STAND_SET_DEF[theme].
    furniture: { tree: "broad", fol: [0.26, 0.42, 0.20], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["steel", "darkSteel", "concrete"],
    // barrier: { a, b, c, night, tyre }   — armco livery (street/night circuits)
    // cityStyle: { neon: [NC names], dayPal: [DC names], bias, fh, bh, kinds, neonKinds, tone }

    bridges:   [{ s: 0.5, halfM: 12, rise: 6 }],   // figure-8 overpass (terrain stays flat under it)
    elevations:[{ s: 0.3, halfM: 40, rise: 8 }],   // real terrain bump (terrain follows)

    scenery: function (api) { /* see the scenery-dress skill */ }
  });
})();
```

Coordinates are +Y up, arc position `s` in metres (0 → `track.total`), lateral
`x` in metres (+ = right of centreline). Orient a trace with `reverse` /
`startFrac`, never by editing `path.pts`; narrow a section with `hwZones`.


---

## Load on demand

- Add/edit workflow and the measured gotchas → [references/workflow.md](references/workflow.md).
