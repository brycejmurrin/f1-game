/* Apex 26 — JEDDAH circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "jeddah",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Known-wrong corner placement (START-LINES: no usable source). Deliberately untouched.
    startFrac: 0.9625,
    name: "JEDDAH",
    gp: "Saudi Arabian GP",
    country: "Saudi Arabia",
    night: true,
    theme: "street_night",
    street: true,
    barrierGap: 3.4,
    terrainOuter: 28,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kind: "city", s0: 0.05, s1: 0.66, side: 1 },
      { kind: "lamps", s0: 0, s1: 1 },
      { kind: "foliage", s0: 0.05, s1: 0.66, side: 1 },
    ],
    lengthKm: 6.2,
    baseHW: 6,
    pal: { horizon: [0.10, 0.08, 0.16], zenith: [0.05, 0.05, 0.15], sunColor: [0.65, 0.68, 0.82], ambientSky: [0.22, 0.22, 0.32], ambientGround: [0.20, 0.18, 0.24], fogColor: [0.08, 0.08, 0.14], fogDensity: 0.0018, concrete: [0.28, 0.27, 0.26], runoff: [0.25, 0.24, 0.22], grass: [0.2, 0.18, 0.14] },
    segs: [
      { t: 0, l: 700 }, { t: 80, l: 70 }, { t: -75, l: 60 }, { t: 0, l: 120 }, { t: 70, l: 65 }, { t: -70, l: 60 },
      { t: 0, l: 300 }, { t: -90, l: 80 }, { t: 0, l: 600 }, { t: -90, l: 80 }, { t: 65, l: 70 }, { t: -70, l: 70 },
    ],
    bankZones: [
      { frac: 0.1825, angleDeg: 3.0, widthM: 90 },
      { frac: 0.2662, angleDeg: 3.0, widthM: 160 },
      { frac: 0.3188, angleDeg: 3.0, widthM: 160 },
      { frac: 0.4792, angleDeg: 7.0, widthM: 240 },   // banked left onto the north loop
      { frac: 0.5552, angleDeg: 6.0, widthM: 200 },   // banked sweeper
      { frac: 0.6110, angleDeg: 3.0, widthM: 120 },
      { frac: 0.9981, angleDeg: 6.0, widthM: 120 },   // banked final right
    ],
    elevations: [
      { s: 0.16, halfM: 520, rise: 1.5 },
      { s: 0.30, halfM: 480, rise: -0.7 },
      { s: 0.62, halfM: 460, rise: 1.1 },
      { s: 0.84, halfM: 300, rise: -0.3 },
    ],
  }
  );
})();
