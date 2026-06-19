/* Apex 26 — RED BULL RING circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "redbull",
    name: "RED BULL RING",
    gp: "Austrian GP",
    country: "Austria",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    pal: { zenith: [0.26, 0.46, 0.8], horizon: [0.66, 0.76, 0.86], grass: [0.22, 0.52, 0.18], runoff: [0.42, 0.38, 0.3], fogDensity: 0.0012, sunDir: [0.59693248550091, 0.6446870843409829, 0.47754598840072804], sun: [1, 0.94, 0.82], sunColor: [1, 0.92, 0.8] },
    segs: [
      { t: 0, l: 280 }, { t: -90, l: 100, h: 12 }, { t: 90, l: 90 }, { t: -100, l: 110, h: 8 }, { t: 80, l: 90 }, { t: 0, l: 220, h: -10 },
      { t: -70, l: 80 }, { t: 80, l: 90 }, { t: 0, l: 480, h: -10 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: 80, l: 90 },
    ],
  }
  );
})();
