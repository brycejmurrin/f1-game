/* Apex 26 — MONTREAL circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "montreal",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.1 m off centreline, 2 nodes past vertex 0.
    // Was 0.9150. That already measured straight (mean |k| 0.00003 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.0198,
    sceneryStartFrac: 0.9150,
    name: "MONTREAL",
    gp: "Canadian GP",
    country: "Canada",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      // Bespoke parkland below owns Montreal's foliage; avoid a duplicate shared row.
      { kind: "foliage", s0: 0, s1: 1 },
      // Foldbacks need a furniture-free envelope on both sides.
      { kinds: ["lighting"], s0: 0.19, s1: 0.23 },
      { kinds: ["lighting"], s0: 0.69, s1: 0.73 },
    ],
    pal: { zenith: [0.30, 0.50, 0.82], horizon: [0.74, 0.80, 0.86], grass: [0.24, 0.50, 0.20], runoff: [0.18, 0.38, 0.16], fogDensity: 0.0014, sunDir: [0.5134360308102702, 0.6067880364121376, 0.6067880364121376], sun: [1, 0.92, 0.78], sunColor: [1, 0.9, 0.76] },
    bankZones: [
      { frac: 0.2171, angleDeg: 3.0, widthM: 120 },
      { frac: 0.3698, angleDeg: 3.0, widthM: 120 },
      { frac: 0.4443, angleDeg: 3.0, widthM: 110 },
      { frac: 0.6136, angleDeg: 3.0, widthM: 90 },
      { frac: 0.7599, angleDeg: 3.0, widthM: 80 },    // the hairpin
    ],
    elevations: [
      { s: 0.52, halfM: 220, rise: 1.25 },
      { s: 0.115, halfM: 300, rise: 2.2 },
      { s: 0.755, halfM: 260, rise: -1.0 },
    ],
    flatTerrain: true,
    terrainOuter: 70,

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.3, 0.62],
    turns: [0.0603, 0.0768, 0.1698, 0.1808, 0.2288, 0.2883, 0.3038, 0.3113, 0.4633, 0.4728, 0.4793, 0.6178, 0.6488, 0.8983],
    furniture: { tree: "fir",   fol: [0.20, 0.42, 0.23], lamp: "none" },  // lush island maple/conifer
    kit: { marshal: "hut",       rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    standSet: ["alu", "steel", "teal"],  // teal is the park's own colour (COL.basinTeal)
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 4370, pts: [[-250.2,-288.8],[-273.8,-398.4],[-291.4,-479.3],[-301.1,-539],[-302.4,-588.4],[-287.2,-720.6],[-290,-736.4],[-300.6,-746.3],[-339.9,-763.7],[-347.7,-769.5],[-351.4,-780.9],[-350,-792.5],[-344.5,-804.1],[-333.9,-813],[-320.5,-818.2],[-302.9,-818.2],[-283.6,-814],[-237.4,-801],[-205.9,-790.4],[-176,-774.1],[-147.3,-755.2],[-81.3,-698.6],[-42,-661.8],[-34.6,-650.4],[-32.8,-640.9],[-33.3,-631.4],[-40.1,-610.4],[-42.5,-597.4],[-41.1,-586.8],[-36.5,-577.9],[38.8,-486],[52.2,-474.6],[77.6,-456.7],[92.8,-444.1],[109.4,-422],[118.7,-398.4],[125.2,-374.3],[127.4,-354.9],[127,-211.6],[127,-199.6],[132,-190.2],[141.3,-182.8],[157.5,-179.1],[179.2,-184.4],[191.7,-185.9],[206.9,-181.7],[219.8,-173.4],[229,-164.4],[237.4,-153.4],[242.4,-143.4],[249.4,-123.5],[255.4,-98.9],[262.3,-68.4],[263.2,-42.7],[272,67],[271.1,126.3],[269.7,174.1],[265.5,226.5],[260,267.9],[254.5,300.5],[215.7,456.8],[209.2,471.1],[199.9,476.8],[190.3,478.9],[176,480],[164.9,483.7],[154.2,489.9],[142.7,502],[133.9,516.2],[126,535.5],[87.7,691.4],[72.5,775.9],[67.4,835.2],[65.1,896.1],[65.6,916],[67.9,937],[96.1,1075.5],[97,1083.9],[96.1,1091.2],[89.6,1098.6],[77.1,1100.7],[69.2,1098],[63.7,1091.8],[61.9,1086.6],[58.6,1055.6],[54,1008.3],[52.2,992.6],[46.2,975.2],[25.9,933.8],[7.8,897.1],[-83.1,662],[-93.7,631.6],[-228.6,-13.8],[-234.1,-40.5],[-232.8,-49.5],[-226.8,-56.4],[-216.1,-60.5],[-209.2,-67.4],[-206.4,-75.2],[-206.9,-85.2],[-231.4,-197]] },
  }
  );
})();
