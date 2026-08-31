/* Apex 26 — BAHRAIN circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "bahrain",
    reverse: false,  // driving direction flipped (manual override of the GPS-trace auto-audit)
    // Bounded only (START-LINES: Not located — OSM pit way is a weak proxy). Keep until a better source.
    startFrac: 0.2250,
    name: "BAHRAIN",
    gp: "Bahrain GP",
    country: "Bahrain",
    night: true,
    theme: "desert",
    sceneryTheme: "desert",
    lengthKm: 5.4,
    sunAzimBias: -0.36,   // low desert-latitude sun sits east of overhead at race time (late-day GP)
    baseHW: 7,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0, s1: 1 },
    ],
    pal: { horizon: [0.20, 0.10, 0.05], zenith: [0.06, 0.05, 0.16], sunColor: [0.80, 0.62, 0.40], ambientSky: [0.30, 0.22, 0.16], ambientGround: [0.28, 0.18, 0.10], fogColor: [0.16, 0.10, 0.06], fogDensity: 0.0028, sunDir: [0.5, 0.14, 0.4], concrete: [0.27, 0.26, 0.25], runoff: [0.24, 0.23, 0.22], grass: [0.19, 0.17, 0.14] },
    segs: [
      { t: 0, l: 520 }, { t: 90, l: 100 }, { t: -40, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 240 }, { t: 80, l: 100 },
      { t: -30, l: 80 }, { t: 70, l: 100 }, { t: 0, l: 300 }, { t: 60, l: 90 }, { t: 0, l: 120 }, { t: 60, l: 110 },
    ],
    elevations: [{ s: 0.645, halfM: 260, rise: -3 }, { s: 0.725, halfM: 180, rise: 2 }],
    bankZones: [
      { frac: 0.0475, angleDeg: 3.0, widthM: 120 },   // T1
      { frac: 0.1166, angleDeg: 3.0, widthM: 100 },   // T4
      { frac: 0.3373, angleDeg: 4.0, widthM: 220 },   // T5-T7 sweep
      { frac: 0.4064, angleDeg: 3.5, widthM: 190 },
      { frac: 0.6077, angleDeg: 3.0, widthM: 130 },   // T10
      { frac: 0.9799, angleDeg: 3.0, widthM: 100 },   // final right
    ],
  }
  );
})();
