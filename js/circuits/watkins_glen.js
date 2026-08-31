/* Apex 26 — WATKINS GLEN INTERNATIONAL circuit definition (data only).
   Retired circuit (`classic: true`): last United States GP 1980.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "watkins_glen",
    classic: true,
    // Upstream us-1956 already runs clockwise, matching the racing direction.
    reverse: false,
    startFrac: 0.0,
    name: "WATKINS GLEN",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "green",
    lengthKm: 5.4,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },
      { kind: "foliage", s0: 0.24, s1: 0.34 },
    ],
    pal: {
      zenith:        [0.28, 0.46, 0.72],
      horizon:       [0.76, 0.74, 0.66],
      sun:           [1.0,  0.94, 0.78],
      sunColor:      [1.0,  0.93, 0.76],
      ambientSky:    [0.48, 0.52, 0.56],
      ambientGround: [0.28, 0.26, 0.19],
      fogColor:      [0.72, 0.72, 0.68],
      grass:         [0.20, 0.42, 0.19],
      sunDir:        [0.46, 0.58, 0.36],
    },
    elevations: [
      { s: 0.11, halfM: 320, rise: 9.0 },    // climb out of Turn 1
      { s: 0.30, halfM: 380, rise: -12.0 },  // down through the Esses
      { s: 0.52, halfM: 340, rise: -8.0 },   // into the Boot
      { s: 0.70, halfM: 360, rise: 13.0 },   // the climb back out
      { s: 0.90, halfM: 300, rise: -5.0 },   // drop to the front straight
    ],
    hwZones: [
      { s0: 0.070, s1: 0.115, hw: 6.3, ease: 0.012 },  // Turn 1 / the 90
      { s0: 0.430, s1: 0.480, hw: 6.2, ease: 0.012 },  // the Boot entry
      { s0: 0.880, s1: 0.925, hw: 6.4, ease: 0.012 },  // the Anvil
    ],
    bankZones: [
      { frac: 0.240, angleDeg: 4.5, widthM: 150 },   // the Esses
      { frac: 0.620, angleDeg: 3.5, widthM: 130 },   // Toe of the Boot
      { frac: 0.900, angleDeg: 4.0, widthM: 130 },   // the Anvil
    ],
  }
  );
})();
