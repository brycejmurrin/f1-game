/* Apex 26 — ZANDVOORT circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "zandvoort",
    name: "ZANDVOORT",
    gp: "Dutch GP",
    country: "Netherlands",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    // Hugenholtz + Arie Luyendyk: the two steeply banked corners get a raised
    // outer edge (the engine banks the highest-curvature corners).
    banked: true,
    pal: { zenith: [0.3, 0.44, 0.62], horizon: [0.72, 0.72, 0.68], grass: [0.42, 0.44, 0.24], runoff: [0.62, 0.54, 0.36], fog: [0.72, 0.72, 0.68], fogDensity: 0.0018, sunDir: [0.5597170785495562, 0.6492718111174852, 0.5149397122655918], sun: [1, 0.92, 0.76], sunColor: [1, 0.9, 0.74] },
    segs: [
      { t: 0, l: 260 }, { t: 75, l: 120, b: 0.16 }, { t: -50, l: 90 }, { t: 130, l: 150, b: 0.3 }, { t: 0, l: 180, h: 8 }, { t: 40, l: 110, h: -8 },
      { t: 60, l: 100 }, { t: -50, l: 90, h: 4 }, { t: 70, l: 90 }, { t: -60, l: 90 }, { t: 90, l: 90 }, { t: -50, l: 90 },
      { t: 50, l: 90 }, { t: 160, l: 160, b: 0.31, w: 8 },
    ],
    elevations: [{ s: 0.56, halfM: 300, rise: 12 }],
  }
  );
})();
