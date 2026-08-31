/* Apex 26 — ALBERT PARK circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "albert_park",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 2.5 m off centreline; = trace vertex 0.
    // Was 0.0925, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.0925,
    name: "ALBERT PARK",
    gp: "Australian GP",
    country: "Australia",
    night: false,
    theme: "green",
    sceneryTheme: "park",
    lengthKm: 5.3,
    baseHW: 7,
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 120,
    dressingExclusions: [
      { kind: "foliage", s0: 0, s1: 1 },
    ],
    pal: { zenith: [0.22, 0.44, 0.82], horizon: [0.76, 0.79, 0.82], grass: [0.28, 0.50, 0.24], runoff: [0.48, 0.42, 0.32], fogDensity: 0.0012, sunDir: [0.6666666666666667, 0.6666666666666667, 0.33333333333333337], sun: [1, 0.95, 0.8], sunColor: [1, 0.93, 0.78] },
    segs: [
      { t: 0, l: 300 }, { t: 50, l: 100 }, { t: -50, l: 90 }, { t: 65, l: 80 }, { t: 0, l: 200 }, { t: 80, l: 90 },
      { t: -90, l: 100 }, { t: 60, l: 90 }, { t: 0, l: 260 }, { t: 80, l: 90 }, { t: 0, l: 200 }, { t: 70, l: 80 },
    ],
    bankZones: [
      { frac: 0.1125, angleDeg: 3.0, widthM: 90 },    // T1
      { frac: 0.1810, angleDeg: 3.0, widthM: 90 },    // T3
      { frac: 0.3186, angleDeg: 2.5, widthM: 200 },   // the long lakeside right
      { frac: 0.5300, angleDeg: 3.5, widthM: 130 },   // fast left past the lake
      { frac: 0.7331, angleDeg: 3.0, widthM: 110 },   // T10
      { frac: 0.9741, angleDeg: 3.0, widthM: 90 },    // last corner
    ],
    elevations: [{ s: 0.2125, halfM: 340, rise: 0.6 }, { s: 0.6425, halfM: 300, rise: -0.4 }],
  }
  );
})();
