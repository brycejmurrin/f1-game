/* Apex 26 — MIAMI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "miami",
    name: "MIAMI",
    gp: "Miami GP",
    country: "USA",
    night: false,
    theme: "modern",
    lengthKm: 5.4,
    baseHW: 7,
    pal: { zenith: [0.22, 0.5, 0.88], horizon: [0.74, 0.8, 0.86], grass: [0.28, 0.5, 0.2], runoff: [0.56, 0.48, 0.34], fogDensity: 0.001, sunDir: [0.3131803839972462, 0.7933903061263571, 0.521967306662077], sun: [1, 0.96, 0.82], sunColor: [1, 0.94, 0.8] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 80 }, { t: 65, l: 70 }, { t: 0, l: 200 }, { t: 80, l: 90 }, { t: -90, l: 100 },
      { t: 70, l: 80 }, { t: 0, l: 400 }, { t: -80, l: 90 }, { t: 80, l: 90 }, { t: 0, l: 240 },
    ],
  }
  );
})();
