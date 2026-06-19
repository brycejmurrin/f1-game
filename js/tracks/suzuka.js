/* Apex 26 — SUZUKA circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "suzuka",
    name: "SUZUKA",
    gp: "Japanese GP",
    country: "Japan",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    baseHW: 7,
    pal: { zenith: [0.28, 0.46, 0.72], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2], sunDir: [0.8846517369293829, 0.44232586846469146, 0.14744195615489716], sun: [1, 0.84, 0.58], sunColor: [1, 0.82, 0.55] },
    segs: [
      { t: 0, l: 440, h: -6 }, { t: 50, l: 120 }, { t: -35, l: 100, h: 6 }, { t: 45, l: 110, h: 6 }, { t: -30, l: 100, h: 4 }, { t: 55, l: 120 },
      { t: 60, l: 110 }, { t: 80, l: 120, h: -4 }, { t: 70, l: 120, h: -6 }, { t: 0, l: 300 }, { t: 45, l: 120, h: 6 }, { t: -20, l: 90 },
      { t: 40, l: 140 },
    ],
    bridges: [{ s: 0.811, halfM: 150, rise: 7 }],
  }
  );
})();
