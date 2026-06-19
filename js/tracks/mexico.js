/* Apex 26 — MEXICO CITY circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mexico",
    name: "MEXICO CITY",
    gp: "Mexican GP",
    country: "Mexico",
    night: false,
    theme: "modern",
    lengthKm: 4.3,
    baseHW: 8,
    pal: { zenith: [0.24, 0.48, 0.88], horizon: [0.74, 0.78, 0.82], grass: [0.28, 0.42, 0.18], runoff: [0.52, 0.38, 0.24], fogDensity: 0.001, sunDir: [0.24111167647565865, 0.8639835073711102, 0.44203807353870755], sun: [1, 0.98, 0.88], sunColor: [1, 0.96, 0.86] },
    segs: [
      { t: 0, l: 300 }, { t: -90, l: 100 }, { t: 80, l: 90 }, { t: 0, l: 250 }, { t: 90, l: 100 }, { t: 0, l: 500 },
      { t: -60, l: 80 }, { t: 60, l: 70 }, { t: 0, l: 200 }, { t: 90, l: 100 }, { t: -130, l: 120 },
    ],
  }
  );
})();
