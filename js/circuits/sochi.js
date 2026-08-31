/* Apex 26 — SOCHI AUTODROM circuit definition (data only).
   Retired circuit (`classic: true`): last Russian GP 2021.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "sochi",
    classic: true,
    // Upstream ru-2014 already runs clockwise, matching the racing direction.
    reverse: false,
    startFrac: 0.0,
    name: "SOCHI",
    gp: "Russian GP",
    country: "Russia",
    night: false,
    theme: "modern",
    lengthKm: 5.8,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 100,
    dressingExclusions: [
      // Sochi runs through the Olympic Park — paved plaza, not vegetation.
      { kinds: ["foliage"], s0: 0.90, s1: 0.30 },
      { kind: "foliage", s0: 0.42, s1: 0.58 },
      { kind: "city", s0: 0.86, s1: 0.34 },
    ],
    // Black Sea coast: soft humid light, hazy horizon, subtropical green.
    pal: {
      zenith:        [0.26, 0.46, 0.76],
      horizon:       [0.80, 0.82, 0.80],
      sun:           [1.0,  0.96, 0.84],
      sunColor:      [1.0,  0.95, 0.82],
      ambientSky:    [0.52, 0.56, 0.60],
      ambientGround: [0.28, 0.29, 0.24],
      fogColor:      [0.78, 0.80, 0.80],
      fogDensity:    0.0030,
      grass:         [0.22, 0.42, 0.20],
      sunDir:        [0.44, 0.66, 0.32],
    },
    elevations: [
      { s: 0.34, halfM: 420, rise: 3.5 },
      { s: 0.68, halfM: 400, rise: -3.0 },
    ],
    hwZones: [
      { s0: 0.230, s1: 0.275, hw: 6.3, ease: 0.012 },  // Turn 5-6
      { s0: 0.520, s1: 0.565, hw: 6.2, ease: 0.012 },  // Turn 13-14
      { s0: 0.790, s1: 0.835, hw: 6.4, ease: 0.012 },  // Turn 16-17
    ],
    bankZones: [
      { frac: 0.085, angleDeg: 5.0, widthM: 260 },
      { frac: 0.430, angleDeg: 3.0, widthM: 120 },
      { frac: 0.900, angleDeg: 3.5, widthM: 120 },
    ],
  }
  );
})();
