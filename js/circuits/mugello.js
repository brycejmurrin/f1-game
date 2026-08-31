/* Apex 26 — AUTODROMO INTERNAZIONALE DEL MUGELLO definition (data only).
   Classic circuit (`classic: true`): hosted a single F1 race, the 2020 Tuscan GP.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mugello",
    classic: true,
    // Upstream it-1914 already runs clockwise (San Donato at T1 is a right).
    reverse: false,
    // The trace opens on the 682 m main straight — Mugello's longest — and its
    // first vertex is the line itself.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches San Donato.
    // Was 0.05, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.05,
    name: "MUGELLO",
    gp: "Tuscan GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.2,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },
      { kind: "foliage", s0: 0.36, s1: 0.46 },
    ],
    // Tuscan hill light: warm, golden, slightly hazy; cypress-dark greens.
    pal: {
      zenith:        [0.24, 0.44, 0.74],
      horizon:       [0.80, 0.76, 0.64],
      sun:           [1.0,  0.94, 0.74],
      sunColor:      [1.0,  0.93, 0.72],
      ambientSky:    [0.48, 0.51, 0.56],
      ambientGround: [0.30, 0.28, 0.20],
      fogColor:      [0.76, 0.72, 0.62],
      grass:         [0.24, 0.42, 0.19],
      sunDir:        [0.44, 0.64, 0.32],
    },
    elevations: [
      { s: 0.16, halfM: 340, rise: 10.0 },   // climb after San Donato
      { s: 0.34, halfM: 380, rise: -11.0 },  // drop to Casanova-Savelli
      { s: 0.52, halfM: 340, rise: 9.0 },    // up through the Arrabbiate
      { s: 0.74, halfM: 360, rise: -8.0 },   // down to Bucine
      { s: 0.92, halfM: 300, rise: 6.0 },    // rise onto the main straight
    ],
    hwZones: [
      { s0: 0.290, s1: 0.335, hw: 6.3, ease: 0.012 },  // Casanova-Savelli
      { s0: 0.620, s1: 0.660, hw: 6.4, ease: 0.012 },  // Correntaio
      { s0: 0.860, s1: 0.900, hw: 6.4, ease: 0.012 },  // Bucine
    ],
    bankZones: [
      { frac: 0.070, angleDeg: 4.0, widthM: 130 },   // San Donato
      { frac: 0.470, angleDeg: 5.0, widthM: 150 },   // Arrabbiata 1
      { frac: 0.520, angleDeg: 5.0, widthM: 140 },   // Arrabbiata 2
      { frac: 0.880, angleDeg: 4.5, widthM: 140 },   // Bucine
    ],
  }
  );
})();
