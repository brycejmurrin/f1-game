/* Apex 26 — AUTÓDROMO INTERNACIONAL DO ALGARVE (PORTIMÃO) definition (data only).
   Retired circuit (`classic: true`): hosted the Portuguese GP in 2020 and 2021.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "portimao",
    classic: true,
    // Upstream pt-2008 already runs clockwise, matching the racing direction.
    reverse: false,
    // The pit straight opens the trace, and its first vertex is the line.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches the real T1.
    // Was 0.96, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.96,
    name: "PORTIMAO",
    gp: "Portuguese GP",
    country: "Portugal",
    night: false,
    theme: "green",
    lengthKm: 4.7,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 125,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },
      { kind: "foliage", s0: 0.30, s1: 0.42 },
    ],
    // Algarve light: dry, bright, faintly dusty, with red-earth soil.
    pal: {
      zenith:        [0.22, 0.44, 0.78],
      horizon:       [0.82, 0.78, 0.68],
      sun:           [1.0,  0.96, 0.80],
      sunColor:      [1.0,  0.95, 0.78],
      ambientSky:    [0.52, 0.54, 0.58],
      ambientGround: [0.34, 0.27, 0.20],
      fogColor:      [0.78, 0.74, 0.64],
      grass:         [0.30, 0.40, 0.20],
      runoff:        [0.66, 0.44, 0.30],   // Algarve red earth
      sunDir:        [0.38, 0.72, 0.28],
    },
    elevations: [
      { s: 0.045, halfM: 260, rise: -14.0 },  // the drop into Turn 1
      { s: 0.20, halfM: 300, rise: 11.0 },    // climb to the Turn 3 crest
      { s: 0.36, halfM: 340, rise: -13.0 },   // plunge through the middle sector
      { s: 0.56, halfM: 300, rise: 10.0 },    // back up the hill
      { s: 0.78, halfM: 320, rise: -9.0 },    // drop toward the final complex
      { s: 0.93, halfM: 300, rise: 12.0 },    // climb back to the pit straight
    ],
    hwZones: [
      { s0: 0.140, s1: 0.185, hw: 6.3, ease: 0.012 },
      { s0: 0.470, s1: 0.515, hw: 6.2, ease: 0.012 },
      { s0: 0.820, s1: 0.870, hw: 6.4, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.050, angleDeg: 4.0, widthM: 110 },
      { frac: 0.300, angleDeg: 3.5, widthM: 120 },
      { frac: 0.640, angleDeg: 4.5, widthM: 130 },
      { frac: 0.900, angleDeg: 3.5, widthM: 110 },
    ],
  }
  );
})();
