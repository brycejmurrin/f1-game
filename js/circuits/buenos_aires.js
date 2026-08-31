/* Apex 26 — AUTÓDROMO OSCAR Y JUAN GÁLVEZ (BUENOS AIRES) definition (data only).
   Retired circuit (`classic: true`): last Argentine GP 1998.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "buenos_aires",
    classic: true,
    // Upstream ar-1952 already runs clockwise, matching the racing direction.
    reverse: false,
    startFrac: 0.0,
    name: "BUENOS AIRES",
    gp: "Argentine GP",
    country: "Argentina",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 115,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },
      { kind: "foliage", s0: 0.38, s1: 0.48 },
    ],
    pal: {
      zenith:        [0.26, 0.46, 0.74],
      horizon:       [0.80, 0.80, 0.74],
      sun:           [1.0,  0.96, 0.82],
      sunColor:      [1.0,  0.95, 0.80],
      ambientSky:    [0.52, 0.55, 0.60],
      ambientGround: [0.28, 0.29, 0.22],
      fogColor:      [0.78, 0.78, 0.74],
      grass:         [0.24, 0.46, 0.21],
      sunDir:        [0.40, 0.72, 0.30],
    },
    elevations: [
      { s: 0.30, halfM: 340, rise: 2.2 },
      { s: 0.66, halfM: 320, rise: -2.0 },
    ],
    hwZones: [
      { s0: 0.185, s1: 0.230, hw: 6.3, ease: 0.012 },
      { s0: 0.500, s1: 0.545, hw: 6.2, ease: 0.012 },
      { s0: 0.830, s1: 0.875, hw: 6.4, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.380, angleDeg: 5.0, widthM: 240 },
      { frac: 0.070, angleDeg: 3.0, widthM: 110 },
    ],
  }
  );
})();
