/* Apex 26 — SUZUKA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "suzuka",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.3 m off centreline, 1 node before vertex 0.
    // Was 0.6125. That already measured straight (mean |k| 0.00330 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.9942,
    sceneryStartFrac: 0.6125,
    sceneryCoordinates: "racing",
    name: "SUZUKA",
    gp: "Japanese GP",
    country: "Japan",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    sunAzimBias: -0.14,   // Pacific-coast morning race slot — sun still east of the crossover
    baseHW: 7,
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0.19, s1: 0.26 },
      { kinds: ["foliage", "lighting"], s0: 0.79, s1: 0.85 },
    ],
    pal: { zenith: [0.35, 0.50, 0.70], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2], sunDir: [0.8846517369293829, 0.44232586846469146, 0.14744195615489716], sun: [1, 0.90, 0.65], sunColor: [1, 0.82, 0.55] },
    segs: [
      { t: 0, l: 440, h: -6 }, { t: 50, l: 120 }, { t: -35, l: 100, h: 6 }, { t: 45, l: 110, h: 6 }, { t: -30, l: 100, h: 4 }, { t: 55, l: 120 },
      { t: 60, l: 110 }, { t: 80, l: 120, h: -4 }, { t: 70, l: 120, h: -6 }, { t: 0, l: 300 }, { t: 45, l: 120, h: 6 }, { t: -20, l: 90 },
      { t: 40, l: 140 },
    ],
    // Elevations and bridges are authored in source-trace space. These source
    // fractions map through startFrac=0.9942 to racing s≈0.818, 0.068 and 0.436
    // (the crossover bridge).
    // Keeping that contract explicit prevents the crossover lift from landing on
    // the Esses while its scenery remains at the real figure-8 crossing.
    // The bridge peak sits exactly on the measured self-crossing (lower road
    // racing s≈0.226, upper s≈0.817). The lower road there is already lifted to
    // y≈5.4 by the Esses elevation, so rise must clear it: 13.5 − 5.4 ≈ 8.1 m of
    // road-to-road daylight — the crossover deck (6.5 m underside + 1.5 m deck)
    // tucks exactly beneath the upper ribbon instead of clipping through it.
    elevations: [{ s: 0.8125, halfM: 300, rise: 11 }, { s: 0.0625, halfM: 260, rise: -5 }],
    bridges: [{ s: 0.4298, halfM: 160, rise: 13.5 }],
    hwZones: [
      { s0: 0.8710, s1: 0.9671, hw: 6.1, ease: 0.012 },  // arc 0.300-0.348 the Esses
    ],
    bankZones: [
      { frac: 0.0622, angleDeg: 4.0, widthM: 260 },   // T1/T2
      { frac: 0.3306, angleDeg: 3.5, widthM: 220 },   // Dunlop / Degner approach
      { frac: 0.5194, angleDeg: 3.5, widthM: 150 },
      { frac: 0.6549, angleDeg: 3.5, widthM: 170 },
      { frac: 0.8015, angleDeg: 4.0, widthM: 80 },    // Spoon
      { frac: 0.8562, angleDeg: 7.0, widthM: 100 },   // 130R
      { frac: 0.9281, angleDeg: 4.0, widthM: 240 },   // final corner
    ],
  }
  );
})();
