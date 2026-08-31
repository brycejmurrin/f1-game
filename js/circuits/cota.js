/* Apex 26 — COTA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "cota",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.8 m off centreline; = trace vertex 0.
    // Was 0.5150, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.5150,
    name: "COTA",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 48,
    dressingExclusions: [
      { kind: "foliage", s0: 0.94, s1: 0.16 },          // pits + Big Red sightline
      { kinds: ["foliage"], s0: 0.72, s1: 0.86, side: 1 }, // tower/amphitheater
    ],
    pal: { zenith: [0.28, 0.54, 0.82], horizon: [0.74, 0.68, 0.52], grass: [0.36, 0.44, 0.20], runoff: [0.58, 0.38, 0.24], ambientSky: [0.50, 0.58, 0.66], ambientGround: [0.30, 0.30, 0.26], sunDir: [0.5345224838248488, 0.5550810408950353, 0.6373152691757812], sun: [1.0, 0.88, 0.62], sunColor: [1.0, 0.85, 0.55] },
    segs: [
      { t: 0, l: 220, h: 30 }, { t: -120, l: 110, h: -6 }, { t: 0, l: 80, h: -22 }, { t: 60, l: 60 }, { t: -55, l: 60 }, { t: 60, l: 60 },
      { t: -55, l: 70 }, { t: 50, l: 70 }, { t: -40, l: 80 }, { t: -60, l: 90 }, { t: -120, l: 110 }, { t: 0, l: 460 },
      { t: -150, l: 130 }, { t: 70, l: 70 }, { t: -60, l: 70 }, { t: 80, l: 90 }, { t: 90, l: 160 }, { t: -130, l: 110 },
    ],
    elevations: [
      { s: 0.6233, halfM: 420, rise: 18 },
      { s: 0.0350, halfM: 280, rise: 3 },
      { s: 0.3550, halfM: 240, rise: 2.5 },
    ],
    bankZones: [
      { frac: 0.0000, angleDeg: 5.0, widthM: 100 },   // uphill T1
      { frac: 0.3670, angleDeg: 4.0, widthM: 160 },
      { frac: 0.3852, angleDeg: 4.0, widthM: 170 },
      { frac: 0.5022, angleDeg: 3.0, widthM: 80 },
      { frac: 0.7035, angleDeg: 3.5, widthM: 160 },
      { frac: 0.8161, angleDeg: 4.5, widthM: 200 },   // the long multi-apex sweep
      { frac: 0.8430, angleDeg: 4.0, widthM: 120 },
    ],
  }
  );
})();
