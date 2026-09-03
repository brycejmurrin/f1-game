/* Apex 26 — IMOLA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 6.3 m off centreline; = trace vertex 0 (timing line).
    // Was 0.4950, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.4950,
    sceneryCoordinates: "racing",
    name: "IMOLA",
    gp: "Emilia Romagna GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 4.9,
    baseHW: 7,
    terrainOuter: 120,
    dressingExclusions: [
      // Bespoke parkland and selective lamps below own the full circuit.
      { kinds: ["foliage", "lighting"], s0: 0, s1: 1 },
    ],
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.80, 0.72, 0.56], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    elevations: [
      { s: 0.835, halfM: 380, rise: 14 },
      { s: 0.975, halfM: 260, rise: -10 },
      { s: 0.135, halfM: 360, rise: 16 },
      { s: 0.295, halfM: 320, rise: -14 },
    ],
    bankZones: [
      { frac: 0.1905, angleDeg: 3.0, widthM: 60 },    // Villeneuve/Tosa link
      { frac: 0.3440, angleDeg: 4.0, widthM: 90 },    // Piratella
      { frac: 0.3703, angleDeg: 3.5, widthM: 90 },    // Acque Minerali
      { frac: 0.7874, angleDeg: 4.0, widthM: 70 },    // Rivazza 1
      { frac: 0.8456, angleDeg: 4.0, widthM: 110 },   // Rivazza 2
      { frac: 0.9737, angleDeg: 3.0, widthM: 120 },   // final sweep to the line
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.32, 0.66],
    turns: [0.1529, 0.1639, 0.1844, 0.1919, 0.2804, 0.2969, 0.3549, 0.3624, 0.4834, 0.5139, 0.5204, 0.5674, 0.5904, 0.5999, 0.6984, 0.8169, 0.8529, 0.8799, 0.9459],
    furniture: { tree: "cypress", fol: [0.24, 0.41, 0.21], lamp: "none" },  // columnar spires
    kit: { marshal: "cabin",     rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "arched",    gantry: "box",        camera: "lattice",   hoarding: "panel" },
    standSet: ["crimson", "sandstone", "concrete"],  // Ferrari red over Imola's stone-and-terracotta town
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 4904, pts: [[-326.4,356.3],[-293.7,356.8],[-90.1,400.5],[-17.4,408.2],[25,408.7],[237.5,389.6],[341.8,364.9],[354.8,356.3],[361,348.7],[362.9,341.5],[370.5,308.3],[376.1,297.7],[389.1,288.7],[485.1,239.8],[499.5,223.8],[654.4,-160.3],[656.2,-170.5],[656,-183],[639.6,-242.7],[639.6,-252.1],[644.9,-263.7],[650.9,-271.6],[834.3,-428.6],[839.6,-437.6],[841.5,-448.3],[839.2,-459.7],[832.4,-473.4],[823.7,-480.9],[813.7,-483.9],[798.4,-483.7],[502.7,-445.3],[469,-442.9],[419.2,-445.7],[383.2,-451],[334,-460.3],[283.6,-469.5],[257.5,-474.7],[241,-471.3],[228.5,-465.1],[212.4,-449.4],[196.1,-420],[171.2,-357.8],[165.4,-330.5],[163.6,-299.6],[168.4,-268.1],[204.5,-97.3],[204,-86.6],[198.9,-74.4],[177.9,-41.3],[150.4,1.5],[142.4,5.6],[131.7,6.7],[124.3,3.5],[83.6,-12.9],[71.1,-14.6],[-355.4,-11.8],[-360.9,-14.1],[-366.2,-26.8],[-370.2,-38],[-374.8,-40.7],[-383.8,-41],[-554.1,29.2],[-575.6,41.2],[-646.5,90.2],[-687.1,127.1],[-726.4,166.7],[-822.5,260.8],[-841.9,274.6],[-863,285],[-988.6,340.8],[-998.1,350],[-999.4,364.6],[-996.9,376.2],[-959,456.3],[-950.2,463.9],[-940.5,466.9],[-926.8,467.4],[-915.9,464.7],[-747.1,400.5],[-687.1,377.4],[-654.5,365.6],[-626.1,359.1],[-606.9,355.7]] },
  }
  );
})();
