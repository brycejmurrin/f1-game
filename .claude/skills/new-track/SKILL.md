---
name: new-track
description: Author a new circuit or edit an existing track's geometry/metadata in js/tracks/. Covers the track-definition schema (segs, palette, theme, bridges, elevations), registering the file, the headless verify-track build guard, and screenshot/test validation. Use for "add a track", "edit the Monza layout", "fix a circuit's corners", "change a track's palette/theme".
---

# Author or edit a track

Each circuit is a self-contained IIFE in `js/tracks/<id>.js` that pushes a plain
data object onto the global `window.TrackDefs` list. The engine (`js/tracks.js`)
reads `TrackDefs`, builds a Catmull-Rom spline from the segments (or an OSM trace
in `js/circuits.js` if one exists for that id), and extrudes the road, terrain,
and prop meshes. **Track files load before `js/tracks.js`** in `index.html`.

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
    segs: [
      { t: 0,   l: 200 },
      { t: 90,  l: 150, h: -3 },
      // ... must close the loop (engine distributes residual + Laplacian-smooths)
    ],

    bridges:   [{ s: 0.5, halfM: 12, rise: 6 }],   // figure-8 overpass (terrain stays flat under it)
    elevations:[{ s: 0.3, halfM: 40, rise: 8 }],   // real terrain bump (terrain follows)

    scenery: function (api) { /* see the scenery-dress skill */ }
  });
})();
```

Segment sign convention: **+t turns right, −t turns left**; lengths are in metres
before the internal ~1.45× arcade scale. Coordinates are +Y up, arc position `s`
in metres (0 → `track.total`), lateral `x` in metres (+ = right of centreline).

## Workflow

1. **Create / edit** `js/tracks/<id>.js` with the schema above. Copy a similar
   existing track (`js/tracks/spa.js` for a green/forest road course,
   `js/tracks/monaco.js` for a street circuit, `js/tracks/monza.js` for a parkland
   layout) and adapt it — don't start from a blank file.
2. **Register it** (new tracks only): add `<script src="js/tracks/<id>.js?v=N"></script>`
   to `index.html` in the track block (before `js/tracks.js`), and add the id to
   the circuit list / calendar where tracks are enumerated. Verify with
   `__apex.tracks()` that the id appears.
3. **Headless build guard** — the fast pre-push check that needs no browser:
   ```sh
   node tools/verify-track.cjs <id>
   ```
   Success prints `OK <id>: props X verts (road Y, terrain Z)`. A non-zero exit
   means the spline/road/terrain build or the `scenery(api)` callback **threw** —
   which in the running game would strand the player on the menu. Fix before
   pushing. Common causes: a missing destructure (`out` not pulled from `api`), a
   node index out of range, or bad track data.
4. **Bump the cache version** (use the `bump-cache` skill) — you edited
   `index.html` and/or a JS file.
5. **Visual check** — load and screenshot it (use the `inspect-scene` skill):
   ```js
   __apex.race("<id>"); __apex.park(0.1);          // stationary at 10% lap
   __apex.orbit(0.1, 45, 15, 40);                  // inspect from all sides
   __apex.trackProfile();                          // [{frac,y,k,hw,slope}] elevation/curvature sanity
   ```
6. **Tests**:
   ```sh
   node tools/verify-track.cjs <id>
   npm run test:circuit      # walls + autopilot + elevation across circuits
   npm run test:barriers     # barrier geometry (tracks-walls.spec.js)
   ```
   The `terrain-over-road.spec.js` audit (part of the full suite) catches terrain
   triangles rendering above the racing line — re-run it if you changed elevation
   or a street/terrain flag.

## Gotchas

- **The loop must close.** The engine distributes any residual position/elevation
  around the lap and applies mild Laplacian smoothing, but wildly unclosed
  `segs` produce kinks. Keep cumulative turn near a multiple of 360°.
- **OSM trace wins over `segs`.** If `js/circuits.js` has a path for this id, your
  `segs` are ignored for the centreline (still useful as a fallback). Use
  `reverse`/`startFrac` to orient a trace, not `segs` rewrites.
- **`street: true` removes the terrain ribbon** — barriers must line the edge or
  the road floats over the floor slab.
- For the `scenery(api)` body (trees, buildings, barriers, mountains), use the
  dedicated **scenery-dress** skill.
