/* Apex 26 — RED BULL RING circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "redbull",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 2.3 m off centreline; = trace vertex 0 (timing line).
    // Was 0.1875, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.1875,
    sceneryCoordinates: "racing",
    name: "RED BULL RING",
    gp: "Austrian GP",
    country: "Austria",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    terrainOuter: 48,
    dressingExclusions: [
      // Preserve clean sightlines to The Wing, the bull plaza and pit gantries.
      { kinds: ["foliage", "lighting"], s0: 0.96, s1: 0.14 },
      // Bespoke stands and forest rims own the Remus amphitheatre.
      { kind: "foliage", s0: 0.18, s1: 0.38, side: 1 },
    ],
    pal: { zenith: [0.22, 0.48, 0.82], horizon: [0.55, 0.72, 0.88], grass: [0.14, 0.44, 0.18], runoff: [0.34, 0.50, 0.26], fogDensity: 0.0016, sunDir: [0.59693248550091, 0.6446870843409829, 0.47754598840072804], sun: [1, 0.96, 0.84], sunColor: [1, 0.96, 0.88] },
    segs: [
      // Amplified T1–T3 climb + post-Remus plunge (fallback if GPS path absent).
      { t: 0, l: 280 }, { t: -90, l: 100, h: 22 }, { t: 90, l: 90, h: 8 }, { t: -100, l: 110, h: 14 }, { t: 80, l: 90, h: 6 }, { t: 0, l: 220, h: -18 },
      { t: -70, l: 80, h: -10 }, { t: 80, l: 90, h: -8 }, { t: 0, l: 480, h: -14 }, { t: 80, l: 100 }, { t: -60, l: 80 }, { t: 80, l: 90 },
    ],
    elevations: [
      { s: 0.3075, halfM: 360, rise: 22 },  // racing 0.12: T1 / Niki Lauda climb
      { s: 0.4075, halfM: 430, rise: 32 },  // racing 0.22: Remus crest / high point
      { s: 0.6075, halfM: 430, rise: -28 }, // racing 0.42: post-Remus / T4 descent
    ],
    bankZones: [
      { frac: 0.1961, angleDeg: 4.0, widthM: 260 },   // T1 climb / Niki Lauda
      { frac: 0.3072, angleDeg: 4.0, widthM: 180 },   // Remus
      { frac: 0.3810, angleDeg: 4.0, widthM: 160 },   // T4 descent
      { frac: 0.4370, angleDeg: 3.0, widthM: 120 },   // T5
      { frac: 0.5574, angleDeg: 3.5, widthM: 110 },
      { frac: 0.6097, angleDeg: 3.5, widthM: 90 },
    ],
  }
  );
})();
