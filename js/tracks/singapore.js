/* Apex 26 — SINGAPORE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "singapore",
    name: "SINGAPORE",
    gp: "Singapore GP",
    country: "Singapore",
    night: true,
    theme: "street_night",
    lengthKm: 4.9,
    baseHW: 6,
    street: true,
    pal: { horizon: [0.08, 0.05, 0.14] },
    segs: [
      { t: 0, l: 160 }, { t: 60, l: 70 }, { t: -70, l: 70 }, { t: 55, l: 70 }, { t: 0, l: 220 }, { t: 90, l: 70 },
      { t: 0, l: 200 }, { t: 95, l: 70 }, { t: -90, l: 80 }, { t: 80, l: 60 }, { t: -60, l: 70 }, { t: 90, l: 90 },
      { t: 0, l: 180 }, { t: 90, l: 70 }, { t: 90, l: 70 }, { t: -85, l: 60 }, { t: 95, l: 80 },
    ],
  }
  );
})();
