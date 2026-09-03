/* Apex 26 — AUTODROMO INTERNAZIONALE DEL MUGELLO definition (data only).
   Classic circuit (`classic: true`): hosted a single F1 race, the 2020 Tuscan GP.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mugello",
    classic: true,
    // Upstream it-1914 already runs clockwise (San Donato at T1 is a right).
    reverse: false,
    // The trace opens on the 682 m main straight — Mugello's longest — and its
    // first vertex is the line itself.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches San Donato.
    // Was 0.05, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.05,
    name: "MUGELLO",
    gp: "Tuscan GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.2,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },
      { kind: "foliage", s0: 0.36, s1: 0.46 },
    ],
    // Tuscan hill light: warm, golden, slightly hazy; cypress-dark greens.
    pal: {
      zenith:        [0.24, 0.44, 0.74],
      horizon:       [0.80, 0.76, 0.64],
      sun:           [1.0,  0.94, 0.74],
      sunColor:      [1.0,  0.93, 0.72],
      ambientSky:    [0.48, 0.51, 0.56],
      ambientGround: [0.30, 0.28, 0.20],
      fogColor:      [0.76, 0.72, 0.62],
      grass:         [0.24, 0.42, 0.19],
      sunDir:        [0.44, 0.64, 0.32],
    },
    elevations: [
      { s: 0.16, halfM: 340, rise: 10.0 },   // climb after San Donato
      { s: 0.34, halfM: 380, rise: -11.0 },  // drop to Casanova-Savelli
      { s: 0.52, halfM: 340, rise: 9.0 },    // up through the Arrabbiate
      { s: 0.74, halfM: 360, rise: -8.0 },   // down to Bucine
      { s: 0.92, halfM: 300, rise: 6.0 },    // rise onto the main straight
    ],
    hwZones: [
      { s0: 0.290, s1: 0.335, hw: 6.3, ease: 0.012 },  // Casanova-Savelli
      { s0: 0.620, s1: 0.660, hw: 6.4, ease: 0.012 },  // Correntaio
      { s0: 0.860, s1: 0.900, hw: 6.4, ease: 0.012 },  // Bucine
    ],
    bankZones: [
      { frac: 0.070, angleDeg: 4.0, widthM: 130 },   // San Donato
      { frac: 0.470, angleDeg: 5.0, widthM: 150 },   // Arrabbiata 1
      { frac: 0.520, angleDeg: 5.0, widthM: 140 },   // Arrabbiata 2
      { frac: 0.880, angleDeg: 4.5, widthM: 140 },   // Bucine
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.1447, 0.1557, 0.1967, 0.2187, 0.2277, 0.3002, 0.3187, 0.3857, 0.5927, 0.6162, 0.6982, 0.7137, 0.7552, 0.7732, 0.8572],
    furniture: { tree: "cypress", fol: [0.20, 0.44, 0.20], lamp: "none" },  // Tuscan broadleaf behind the cypress ranks
    kit: { marshal: "cabin",     rail: "armco",       fence: "leaning",   tyre: "stack",   board: "arched",    gantry: "box",        camera: "lattice",   hoarding: "panel" },
    standSet: ["crimson", "terracotta", "concrete"],  // Ferrari red over Tuscan clay
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    // Autodromo Internazionale del Mugello — Scarperia e San Piero. Upstream it-1914, stated 5245 m, projected 5249 m, trace winding CCW.
    path: { len: 5249, pts: [[4.6,20.5],[-29.7,96.6],[-61.2,161.8],[-125.2,270.9],[-176.8,360.8],[-221.3,461.6],[-282.4,617.9],[-291.8,633.4],[-301.4,642.3],[-312.1,649.7],[-332.9,653.1],[-350.5,649.9],[-364.8,641.3],[-375.3,628.5],[-382.9,613.5],[-383.6,583.6],[-379,551.9],[-362.8,463.9],[-362.2,452.7],[-364.7,442.9],[-370.5,431.4],[-379.7,422.2],[-404.2,407.5],[-444.6,381],[-453.7,368.4],[-458.7,352.7],[-460.5,339.4],[-459.8,325.6],[-454.7,310],[-445,293.2],[-267.2,22.5],[-263.5,12.1],[-262.2,2.4],[-262.7,-6.1],[-264.5,-14.7],[-270,-29.2],[-288.5,-68.5],[-292.1,-81.7],[-292.1,-93],[-290.2,-104.8],[-286.2,-115.7],[-281.3,-124.5],[-267.7,-143.1],[-98.7,-349.5],[-91.1,-356.3],[-81.3,-363.1],[-71.3,-367.3],[-62.9,-369.7],[-53.3,-370.2],[36.7,-369.5],[48.3,-371.5],[68.2,-379],[83.2,-388.7],[94.7,-398.8],[104.3,-411.9],[113.5,-427.9],[119.8,-443.6],[160.5,-559.4],[166.5,-576.6],[173.9,-593.4],[185.5,-611],[195.9,-623.4],[211,-635.6],[225.2,-644.5],[244.6,-650.5],[263.3,-653.1],[282.4,-652.2],[308,-646.5],[320,-643.6],[333.3,-638.5],[412.3,-597],[426,-588.4],[440,-573.6],[448.9,-559.9],[456.9,-543],[460.5,-522.3],[460.5,-507.1],[457.5,-478.2],[409,-226.1],[405.9,-216.7],[398.6,-204],[388,-195.9],[377.3,-190.2],[359.9,-187.5],[300.4,-187],[288.7,-184.7],[278,-180.1],[267.6,-172.2],[254.8,-157],[247.8,-138.2],[163.2,158.1],[158.1,172.3],[147.9,187.9],[136,199.5],[123.8,206.7],[109.2,210.4],[94.6,210.3],[77,206.1],[60.1,195.3],[48.4,181.5],[42.8,167.4],[39.6,147.8],[42.1,130.2],[50.5,108.5],[74.6,71.5],[127.8,6],[132.1,-3.7],[135.4,-14.7],[136.6,-28.6],[136.7,-92.1],[139.3,-102.4],[150.5,-121.2],[382.5,-433.5],[387.1,-444.9],[393.4,-459.8],[395.4,-471.8],[395.1,-495.5],[391.1,-509.1],[380.8,-527.2],[367.5,-539.7],[346.4,-550.8],[330.6,-552.8],[307.1,-550.5],[286.3,-542.7],[267.6,-529.7],[248.3,-510.3],[228.6,-480.2],[159.2,-326.4]] },
  }
  );
})();
