/* Apex 26 — INTERCITY ISTANBUL PARK circuit definition (data only).
   Retired circuit (`classic: true`): last Turkish GP 2021.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "istanbul",
    classic: true,
    reverse: false,
    // The trace's first vertex is the start line, on the pit straight ahead of
    // the Turn 1 plunge.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured LEFT, matches the real T1.
    // Was 0.98, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.98,
    name: "ISTANBUL",
    gp: "Turkish GP",
    country: "Turkey",
    night: false,
    theme: "green",
    lengthKm: 5.3,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },  // pits
      { kind: "foliage", s0: 0.34, s1: 0.46 },              // the Turn 8 amphitheatre
    ],
    // Dry Thracian hillside: hazy warm sun, parched grass, pale limestone dust.
    pal: {
      zenith:        [0.24, 0.44, 0.74],
      horizon:       [0.80, 0.78, 0.70],
      sun:           [1.0,  0.95, 0.78],
      sunColor:      [1.0,  0.94, 0.76],
      ambientSky:    [0.50, 0.53, 0.58],
      ambientGround: [0.30, 0.28, 0.21],
      fogColor:      [0.76, 0.74, 0.66],
      grass:         [0.31, 0.39, 0.20],
      runoff:        [0.64, 0.58, 0.44],
      sunDir:        [0.46, 0.66, 0.30],
    },
    elevations: [
      { s: 0.055, halfM: 300, rise: -12.0 },  // the Turn 1 downhill plunge
      { s: 0.28, halfM: 380, rise: -7.0 },    // valley floor before Turn 8
      { s: 0.48, halfM: 340, rise: 8.0 },     // climb out of Turn 8
      { s: 0.72, halfM: 400, rise: 9.0 },     // long rise back toward the pits
    ],
    hwZones: [
      { s0: 0.135, s1: 0.180, hw: 6.4, ease: 0.012 },  // Turn 3-4 complex
      { s0: 0.590, s1: 0.640, hw: 6.4, ease: 0.012 },  // Turn 9-10
      { s0: 0.880, s1: 0.930, hw: 6.3, ease: 0.012 },  // Turn 13-14
    ],
    // Turn 8 is the famous one: a long, banked, quadruple-apex left taken flat.
    bankZones: [
      { frac: 0.050, angleDeg: 4.0, widthM: 130 },   // Turn 1
      { frac: 0.400, angleDeg: 7.0, widthM: 300 },   // Turn 8 — the big one
      { frac: 0.760, angleDeg: 3.5, widthM: 130 },   // Turn 12
    ],
  }
  );
})();
