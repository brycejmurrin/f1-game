/* Apex 26 — BAKU circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "baku",
    name: "BAKU",
    gp: "Azerbaijan GP",
    country: "Azerbaijan",
    night: true,
    theme: "street_night",
    lengthKm: 6,
    baseHW: 6,
    pal: { horizon: [0.06, 0.08, 0.14] },
    segs: [
      { t: 0, l: 200 }, { t: 90, l: 80 }, { t: -80, l: 70 }, { t: 0, l: 800 }, { t: 90, l: 80 }, { t: 0, l: 400 },
      { t: -70, l: 70 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 }, { t: 0, l: 600 }, { t: -80, l: 80 },
    ],
  }
  );
})();
