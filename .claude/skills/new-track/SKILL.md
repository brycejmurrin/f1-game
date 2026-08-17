---
name: new-track
description: Use when the user asks to add a track/circuit, edit Monza/Spa/etc. layout, change circuit geometry/metadata/palette/theme/bridges/elevation, or register a new circuit in js/circuits/. Corner/terrain diagnosis → debug-tracks; picture-driven accuracy → survey-track; scenery(api) props → scenery-dress.
---

# Author or edit a track

Each circuit is a self-contained IIFE in `js/circuits/<id>.js` that pushes a plain
data object onto the global `window.TrackDefs` list. The engine (`js/track/tracks.js`)
reads `TrackDefs`, builds a Catmull-Rom spline from the segments (or an OSM trace
in `js/track/geo-paths.js` if one exists for that id), and extrudes the road, terrain,
and prop meshes. **Track files load before `js/track/tracks.js`** in `index.html`.

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

    // GEOMETRY — used only when no OSM trace exists for this id (trace wins).
    // t = turn degrees (+right, -left); l = length metres; h = elevation delta;
    // b = bank radians; w = half-width override.
    // Minimal closed loop (200×100 m rectangle — cumulative turn ≈ 360°):
    segs: [
      { t: 0,   l: 200 },
      { t: 90,  l: 100 },
      { t: 0,   l: 200 },
      { t: 90,  l: 100 },
    ],
    // Real circuits are longer — copy spa.js / monza.js and adapt:
    // segs: [
    //   { t: 0,   l: 200 },
    //   { t: 90,  l: 150, h: -3 },
    //   // ... must close the loop (engine distributes residual + Laplacian-smooths)
    // ],

    bridges:   [{ s: 0.5, halfM: 12, rise: 6 }],   // figure-8 overpass (terrain stays flat under it)
    elevations:[{ s: 0.3, halfM: 40, rise: 8 }],   // real terrain bump (terrain follows)

    scenery: function (api) { /* see the scenery-dress skill */ }
  });
})();
```

Segment sign convention: **+t turns right, −t turns left**; lengths are in metres
before the internal ~1.45× arcade scale. Coordinates are +Y up, arc position `s`
in metres (0 → `track.total`), lateral `x` in metres (+ = right of centreline).


---

## Load on demand

- Add/edit workflow and the measured gotchas → [references/workflow.md](references/workflow.md).
