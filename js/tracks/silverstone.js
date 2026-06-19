/* Apex 26 — SILVERSTONE circuit definition (data only).
   Registered on the global TrackDefs list; consumed by the js/tracks.js engine
   (palette resolved there from `night`, geometry from js/circuits.js or `segs`). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "silverstone",
    name: "SILVERSTONE",
    gp: "British GP",
    country: "UK",
    night: false,
    theme: "green",
    lengthKm: 5.9,
    baseHW: 8,
    pal: { zenith: [0.3, 0.42, 0.62], horizon: [0.66, 0.72, 0.78], grass: [0.2, 0.46, 0.18], fogDensity: 0.0016, sunDir: [0.42010419876354255, 0.5521369469463703, 0.7201786264517872], sun: [0.88, 0.91, 1], sunColor: [0.84, 0.88, 0.96] },
    segs: [
      { t: 0, l: 260 }, { t: 60, l: 120 }, { t: -50, l: 90 }, { t: 80, l: 80 }, { t: -150, l: 160 }, { t: 0, l: 120 },
      { t: -70, l: 90 }, { t: 120, l: 150 }, { t: 40, l: 100 }, { t: 0, l: 160 }, { t: 70, l: 130 }, { t: -55, l: 70 },
      { t: 60, l: 70 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: 0, l: 300 }, { t: 75, l: 110 }, { t: -40, l: 90 },
      { t: 95, l: 90 }, { t: 60, l: 90 },
    ],
    elevations: [{ s: 0.62, halfM: 360, rise: 9 }],
  }
  );
})();
