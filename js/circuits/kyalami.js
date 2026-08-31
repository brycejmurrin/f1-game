/* Apex 26 — KYALAMI GRAND PRIX CIRCUIT definition (data only).
   Retired circuit (`classic: true`): last South African GP 1993.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "kyalami",
    classic: true,
    reverse: true,
    startFrac: 0.01,
    name: "KYALAMI",
    gp: "South African GP",
    country: "South Africa",
    night: false,
    theme: "green",
    lengthKm: 4.5,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },
      { kind: "foliage", s0: 0.36, s1: 0.48 },
    ],
    pal: {
      zenith:        [0.14, 0.36, 0.76],
      horizon:       [0.76, 0.76, 0.70],
      sun:           [1.0,  0.97, 0.86],
      sunColor:      [1.0,  0.96, 0.84],
      ambientSky:    [0.48, 0.52, 0.60],
      ambientGround: [0.34, 0.30, 0.20],
      fogColor:      [0.74, 0.74, 0.68],
      fogDensity:    0.0022,   // thin high-altitude air — long clear sightlines
      grass:         [0.44, 0.42, 0.22],   // straw-gold highveld veld
      runoff:        [0.60, 0.46, 0.32],
      sunDir:        [0.30, 0.82, 0.24],
    },
    elevations: [
      { s: 0.16, halfM: 300, rise: -10.0 },  // drop away from Crowthorne
      { s: 0.36, halfM: 340, rise: 13.0 },   // the long climb
      { s: 0.58, halfM: 300, rise: 8.0 },    // up to the high point
      { s: 0.80, halfM: 340, rise: -14.0 },  // the plunge back down
    ],
    hwZones: [
      { s0: 0.230, s1: 0.275, hw: 6.3, ease: 0.012 },
      { s0: 0.540, s1: 0.585, hw: 6.2, ease: 0.012 },
      { s0: 0.860, s1: 0.905, hw: 6.3, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.075, angleDeg: 4.0, widthM: 120 },   // Crowthorne
      { frac: 0.400, angleDeg: 3.5, widthM: 130 },
      { frac: 0.700, angleDeg: 4.5, widthM: 140 },
    ],
  }
  );
})();
