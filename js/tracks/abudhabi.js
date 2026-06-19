/* Apex 26 — ABU DHABI circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "abudhabi",
    name: "ABU DHABI",
    gp: "Abu Dhabi GP",
    country: "UAE",
    night: true,
    theme: "desert",
    lengthKm: 5.3,
    baseHW: 8,
    pal: { horizon: [0.12, 0.08, 0.06], concrete: [0.26, 0.25, 0.24], runoff: [0.22, 0.21, 0.2], grass: [0.18, 0.16, 0.12] },
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 70, l: 80 }, { t: 0, l: 400 }, { t: 90, l: 100 }, { t: 0, l: 200 },
      { t: 60, l: 90 }, { t: 0, l: 300 }, { t: -80, l: 100 }, { t: 60, l: 80 }, { t: 90, l: 100 }, { t: -60, l: 80 },
    ],
  }
  );
})();
