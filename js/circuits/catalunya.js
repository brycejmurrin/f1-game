/* Apex 26 — CIRCUIT DE BARCELONA-CATALUNYA definition (data only). Off-calendar (`classic: true`): the Spanish GP moved to the Madring for 2026, so Catalunya is p… */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "catalunya",
    classic: true,
    reverse: false,
    // The trace opens on the 700 m main straight, and its first vertex IS the
    // start line — measured, not nudged.
    // Start/finish line. Snapped to the real one: coord 0.2 m off centreline; = trace vertex 0.
    // Was 0.03. That already measured straight (mean |k| 0.00036 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.03,
    name: "CATALUNYA",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    lengthKm: 4.7,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 115,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.12 },  // pits + main straight
      { kind: "foliage", s0: 0.42, s1: 0.52 },              // the open infield bowl
    ],
    // Dry Catalan light: hard sun, bleached scrub, dusty ochre runoff.
    pal: {
      zenith:        [0.20, 0.42, 0.76],
      horizon:       [0.80, 0.80, 0.72],
      sun:           [1.0,  0.96, 0.80],
      sunColor:      [1.0,  0.95, 0.78],
      ambientSky:    [0.50, 0.54, 0.60],
      ambientGround: [0.30, 0.27, 0.20],
      fogColor:      [0.76, 0.74, 0.66],
      grass:         [0.30, 0.40, 0.19],
      runoff:        [0.62, 0.48, 0.32],
      sunDir:        [0.40, 0.70, 0.28],
    },
    elevations: [
      { s: 0.18, halfM: 380, rise: 7.0 },    // climb through Renault/Repsol
      { s: 0.44, halfM: 420, rise: 11.0 },   // high ground before Campsa
      { s: 0.62, halfM: 400, rise: -9.0 },   // Campsa drop toward La Caixa
      { s: 0.86, halfM: 360, rise: -6.0 },   // run down to the final chicane
    ],
    hwZones: [
      { s0: 0.290, s1: 0.335, hw: 6.4, ease: 0.012 },  // Seat / Wurth chicane
      { s0: 0.660, s1: 0.705, hw: 6.3, ease: 0.012 },  // La Caixa hairpin
      { s0: 0.905, s1: 0.955, hw: 6.5, ease: 0.012 },  // final chicane complex
    ],
    bankZones: [
      { frac: 0.060, angleDeg: 3.5, widthM: 120 },   // Elf (T1)
      { frac: 0.235, angleDeg: 4.0, widthM: 130 },   // Repsol
      { frac: 0.500, angleDeg: 4.5, widthM: 150 },   // Campsa
      { frac: 0.800, angleDeg: 3.0, widthM: 120 },   // Europcar
    ],
  }
  );
})();
