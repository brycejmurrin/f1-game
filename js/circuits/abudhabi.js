/* Apex 26 — ABU DHABI circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "abudhabi",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.2 m off centreline; = trace vertex 0.
    // Was 0.0750, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.0750,
    name: "ABU DHABI",
    gp: "Abu Dhabi GP",
    country: "UAE",
    night: true,
    theme: "desert",
    lengthKm: 5.3,
    baseHW: 8,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.50, s1: 0.76 },
      { kinds: ["city", "foliage"], s0: 0.76, s1: 0.92 },
      { kinds: ["foliage", "lighting"], s0: 0.44, s1: 0.50 },
      { kinds: ["city", "foliage"], s0: 0.14, s1: 0.23, side: 1 },
      { kinds: ["city", "foliage"], s0: 0.97, s1: 0.08, side: 1 },
      { kind: "lamps", s0: 0.855, s1: 0.895 },
    ],
    pal: { horizon: [0.32, 0.16, 0.08], zenith: [0.10, 0.06, 0.24], sunColor: [0.90, 0.68, 0.38], ambientSky: [0.36, 0.28, 0.24], ambientGround: [0.32, 0.20, 0.12], fogColor: [0.22, 0.12, 0.06], fogDensity: 0.0020, sunDir: [0.55, 0.15, 0.32], concrete: [0.28, 0.27, 0.26], runoff: [0.24, 0.23, 0.22], grass: [0.20, 0.18, 0.14] },
    bankZones: [
      { frac: 0.0425, angleDeg: 3.0, widthM: 180 },   // T1 opening right
      { frac: 0.1509, angleDeg: 3.0, widthM: 120 },   // T2 left
      { frac: 0.5777, angleDeg: 5.0, widthM: 240 },   // the banked long left
      { frac: 0.7453, angleDeg: 3.0, widthM: 110 },   // hotel-section left
      { frac: 0.8446, angleDeg: 3.0, widthM: 100 },   // marina right
      { frac: 0.9500, angleDeg: 2.5, widthM: 90 },    // final left onto the straight
    ],
    elevations: [
      { s: 0.230, halfM: 460, rise: 3.5 },
      { s: 0.635, halfM: 700, rise: 7.5 },
      { s: 0.945, halfM: 300, rise: -1.5 },
    ],
    segs: [
      { t: 0, l: 300 }, { t: 60, l: 90 }, { t: -70, l: 80 }, { t: 0, l: 400 }, { t: -90, l: 100 }, { t: 0, l: 200 },
      { t: -60, l: 90 }, { t: 0, l: 300 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: -90, l: 100 }, { t: 60, l: 80 },
    ],
  }
  );
})();
