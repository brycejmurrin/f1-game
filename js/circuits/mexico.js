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

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.3, 0.62],
    turns: [0.2571, 0.2776, 0.2891, 0.4531, 0.4701, 0.5066, 0.5836, 0.6076, 0.6276, 0.6721, 0.6926, 0.8261, 0.8681, 0.8821, 0.9101, 0.9346, 0.9496],
    barrier: { a: [0.05, 0.55, 0.26], b: [0.95, 0.95, 0.96], c: [0.90, 0.12, 0.14], night: [0.09, 0.20, 0.11], tyre: [0.05, 0.55, 0.26] },  // flag green/white/red
    furniture: { tree: "broad", fol: [0.32, 0.44, 0.18], lamp: "post",  lc: [1.0, 0.86, 0.55] },
    kit: { marshal: "hut",       rail: "armco",       fence: "chainlink",  tyre: "tecpro",  board: "led",       gantry: "portal",     camera: "scaffold",  hoarding: "led" },
    standSet: ["navy", "concrete", "steel"],  // Foro Sol blue buckets
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["pink", "green", "orange", "gold", "cyan"], bias: 0.34, fh: [12, 34], bh: [28, 64],
                 kinds: ["setback", "slab", "podium", "cylinder", "tiered", "chevron", "cross", "ziggurat", "drum"], neonKinds: ["clad", "screen"], tone: { n: [0.16, 0.15, 0.16], d: [0.58, 0.56, 0.53] },
                 dayPal: ["terra", "ochre", "cream", "coral", "sand", "brick", "tan"] },
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 4307, pts: [[485.1,390.6],[126.7,340.8],[10.5,325.6],[-111.9,314.6],[-170.9,307.2],[-323.2,285.7],[-588.5,246.3],[-643.2,235.3],[-652.6,231.6],[-657.5,227.4],[-660,220.6],[-660.6,214.4],[-650.7,148.7],[-651.9,142.9],[-655.1,137.7],[-683,122.5],[-691.1,118.3],[-695.4,111.5],[-695.4,105.2],[-689.8,64.2],[-681.1,27.5],[-667.5,-8.2],[-651.9,-40.2],[-530.1,-246.9],[-384.1,-476.3],[-374.7,-492],[-373.5,-501.4],[-375.4,-509.3],[-379.8,-515.1],[-423.2,-541.8],[-427.5,-546.1],[-428.2,-552.8],[-425.1,-558.6],[-417.7,-565.4],[-336.2,-626.9],[-328.1,-630.5],[-321.3,-631.6],[-315.1,-629.4],[-300.2,-620],[-297.7,-613.7],[-297.7,-601.2],[-334.9,-310.4],[-334.4,-301.5],[-330.6,-293.1],[-325.1,-286.2],[-316.4,-280],[-272.9,-253.2],[-257.3,-239],[-248,-229.6],[-238.7,-211.8],[-228.7,-185.5],[-218.8,-169.8],[-207.6,-158.8],[-195.2,-150.9],[-178.4,-143.5],[-44.1,-123],[-29.2,-118.4],[-19.9,-110.5],[-15.5,-105.2],[-11.9,-97.9],[5.6,-43.9],[11.1,-33.3],[19.8,-23.4],[41.6,-10.3],[141,43.3],[169.7,55.3],[211.3,65.3],[544.4,113.6],[551.2,116.2],[554.9,120.4],[558.1,127.2],[558.7,136.1],[564.3,221.7],[571.1,280.9],[573.6,287.7],[578.5,292.5],[585.4,295.6],[594.1,294.6],[603.4,286.2],[615.3,268.4],[622.1,263.1],[630.2,260],[639.4,260.5],[650,265.2],[662.4,271],[674.3,274.7],[730.8,280.9],[740.1,284.1],[744.5,287.7],[748.2,294.6],[748.8,301.4],[745.2,317.7],[737.1,339.2],[726.5,357.1],[710.9,378.6],[692.9,393.3],[669.9,404.8],[648.8,410.5],[628.3,411.1],[598.5,407.4]] },
  }
  );
})();
