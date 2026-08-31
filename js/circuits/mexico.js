/* Apex 26 — MEXICO CITY circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mexico",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.6 m off centreline; = trace vertex 0.
    // Was 0.6350. That already measured straight (mean |k| 0.00211 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.6350,
    name: "MEXICO CITY",
    gp: "Mexican GP",
    country: "Mexico",
    night: false,
    theme: "modern",
    lengthKm: 4.3,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kind: "city", s0: 0.02, s1: 0.14 },
      { kind: "city", s0: 0.60, s1: 0.94 },
      { kinds: ["foliage", "lighting"], s0: 0.70, s1: 0.89 },
    ],
    pal: { zenith: [0.56, 0.72, 0.92], horizon: [0.68, 0.72, 0.78], grass: [0.34, 0.52, 0.26], runoff: [0.52, 0.38, 0.24], fog: [0.70, 0.74, 0.80], fogDensity: 0.0022, sunDir: [0.24111167647565865, 0.8639835073711102, 0.44203807353870755], sun: [1, 0.98, 0.88], sunColor: [1, 0.96, 0.86] },
    segs: [
      { t: 0, l: 300 }, { t: -90, l: 100 }, { t: 80, l: 90 }, { t: 0, l: 250 }, { t: 90, l: 100 }, { t: 0, l: 500 },
      { t: -60, l: 80 }, { t: 60, l: 70 }, { t: 0, l: 200 }, { t: 90, l: 100 }, { t: -130, l: 120 },
    ],
    bankZones: [
      { frac: 0.1866, angleDeg: 3.5, widthM: 200 },   // the long right after the esses
      { frac: 0.7808, angleDeg: 3.0, widthM: 80 },
      { frac: 0.8834, angleDeg: 3.0, widthM: 90 },    // Foro Sol stadium section
      { frac: 0.9039, angleDeg: 3.0, widthM: 100 },
      { frac: 0.9692, angleDeg: 6.0, widthM: 120 },   // Peraltada
      { frac: 0.0075, angleDeg: 5.0, widthM: 140 },   // Peraltada exit onto the straight
    ],
    // Source-coordinate undulations. Hermanos Rodríguez sits on a drained lakebed
    // and is gentle, but not flat: it climbs through the esses, crests before the
    // stadium and drops through Foro Sol.
    // (The old ±7 m pair remapped across start/finish and invented a 12 m hill;
    // these are authored in SOURCE space so that cannot happen.)
    //
    // MEASURED off the built spline, 240 samples: 6.64 m end to end, peaking at
    // 2.83 % grade on the flank of the s = 0.245 rise, with 6 samples over 2 %.
    // This said "under 2 % anywhere" — a figure nobody computed, which
    // tests/specs/terrain-over-road.spec.js then pinned verbatim in `f9bbf479` and
    // sat red on. The geometry is unchanged and correct; only the claim was
    // wrong. Re-measure if these three rows change, rather than adjusting the
    // sentence to taste.
    elevations: [
      { s: 0.855, halfM: 420, rise: 5.0 },
      { s: 0.245, halfM: 380, rise: 3.0 },
      { s: 0.520, halfM: 280, rise: -1.6 },
    ],
  }
  );
})();
