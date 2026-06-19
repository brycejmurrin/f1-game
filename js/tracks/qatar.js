/* Apex 26 — QATAR circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "qatar",
    name: "QATAR",
    gp: "Qatar GP",
    country: "Qatar",
    night: true,
    theme: "desert",
    lengthKm: 5.4,
    baseHW: 8,
    pal: { horizon: [0.14, 0.1, 0.06], concrete: [0.28, 0.26, 0.24], runoff: [0.24, 0.22, 0.2], grass: [0.2, 0.18, 0.14] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 80, l: 100 }, { t: -70, l: 90 }, { t: 60, l: 90 }, { t: 0, l: 300 },
      { t: -80, l: 100 }, { t: 70, l: 90 }, { t: 0, l: 400 }, { t: -60, l: 90 }, { t: 70, l: 90 }, { t: 0, l: 300 },
    ],
  }
  );
})();
