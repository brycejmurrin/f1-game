/* Apex 26 — MIAMI circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "miami",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.7 m off centreline; = trace vertex 0.
    // Was 0.2325, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.2325,
    name: "MIAMI",
    gp: "Miami GP",
    country: "USA",
    night: false,
    theme: "modern",
    lengthKm: 5.4,
    baseHW: 7,
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 90,
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.94, s1: 0.08 },
      { kinds: ["city", "foliage"], s0: 0.26, s1: 0.38, side: 1 },
      { kinds: ["city", "foliage"], s0: 0.60, s1: 0.72 },
    ],
    pal: { zenith: [0.22, 0.5, 0.88], horizon: [0.80, 0.86, 0.90], grass: [0.20, 0.42, 0.18], runoff: [0.12, 0.72, 0.78], fogDensity: 0.0014, sunDir: [0.3131803839972462, 0.7933903061263571, 0.521967306662077], sun: [1, 0.96, 0.82], sunColor: [1, 0.94, 0.8] },
    segs: [
      { t: 0, l: 300 }, { t: 60, l: 80 }, { t: -65, l: 70 }, { t: 0, l: 200 }, { t: -80, l: 90 }, { t: 90, l: 100 },
      { t: -70, l: 80 }, { t: 0, l: 400 }, { t: 80, l: 90 }, { t: -80, l: 90 }, { t: 0, l: 240 },
    ],
    elevations: [{ s: 0.8925, halfM: 220, rise: 3.5 }],
    bankZones: [
      { frac: 0.0775, angleDeg: 3.5, widthM: 240 },
      { frac: 0.3785, angleDeg: 3.0, widthM: 130 },
      { frac: 0.6788, angleDeg: 3.5, widthM: 200 },
      { frac: 0.7496, angleDeg: 3.0, widthM: 180 },
      { frac: 0.8808, angleDeg: 3.0, widthM: 240 },
    ],
  }
  );
})();
