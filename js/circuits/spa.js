/* Apex 26 — SPA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "spa",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.9 m off centreline; = trace vertex 0.
    // Was 0.9875, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.9875,
    name: "SPA",
    gp: "Belgian GP",
    country: "Belgium",
    night: false,
    theme: "green",
    lengthKm: 7,
    sunAzimBias: 0.44,   // afternoon sun swings SW over the Ardennes ridge — long shadows down the Kemmel straight
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 90,
    dressingExclusions: [{ kind: "foliage", s0: 0, s1: 1 }],
    // Cool damp Ardennes overcast (ATM.dampArdennes) — grey sky/fog, no warm sun.
    pal: { zenith: [0.42, 0.48, 0.52], horizon: [0.58, 0.62, 0.64], grass: [0.14, 0.28, 0.16], runoff: [0.40, 0.38, 0.34], fog: [0.55, 0.60, 0.62], fogDensity: 0.0032, sunDir: [0.7141470886878855, 0.44326371022006683, 0.5417667569356373], sun: [0.88, 0.90, 0.92], sunColor: [0.88, 0.90, 0.92], ambientSky: [0.50, 0.54, 0.58], ambientGround: [0.28, 0.30, 0.26] },
    elevations: [
      { s: 0.075, halfM: 360, rise: -18 }, // Eau Rouge compression
      { s: 0.155, halfM: 920, rise: 84 },  // Raidillon crest / Kemmel plateau
      { s: 0.46, halfM: 760, rise: 24 },   // rolling high ground before the descent
      { s: 0.72, halfM: 680, rise: -18 },  // Stavelot valley
    ],
    bankZones: [
      { frac: 0.1854, angleDeg: 5.0, widthM: 130 },   // Raidillon
      { frac: 0.3685, angleDeg: 3.0, widthM: 80 },    // Les Combes
      { frac: 0.4531, angleDeg: 4.0, widthM: 170 },   // Bruxelles
      { frac: 0.5648, angleDeg: 6.0, widthM: 160 },   // Pouhon
      { frac: 0.6626, angleDeg: 3.5, widthM: 140 },   // Fagnes
      { frac: 0.7277, angleDeg: 3.5, widthM: 100 },   // Campus
      { frac: 0.7576, angleDeg: 6.0, widthM: 150 },   // Stavelot
      { frac: 0.8572, angleDeg: 4.0, widthM: 140 },   // Blanchimont
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.28, 0.68],
    turns: [0.0350, 0.1430, 0.1615, 0.3260, 0.3370, 0.3595, 0.4105, 0.4215, 0.4500, 0.5225, 0.5325, 0.6195, 0.6280, 0.6410, 0.6505, 0.6855, 0.7150, 0.7210, 0.9435, 0.9515],
    furniture: { tree: "fir",   fol: [0.14, 0.31, 0.21], lamp: "none" },  // dark Ardennes spruce, blue-green
    kit: { marshal: "cabin",     rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "panel",     gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    standSet: ["darkSteel", "steel", "concrete"],
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 6979, pts: [[252.5,811.7],[366,1009.7],[367.2,1018.6],[362.2,1026.5],[351.7,1030.1],[340,1026.9],[302.6,1008.1],[211.9,964.7],[168.3,937.9],[123,904.3],[82.3,870.3],[50,835.2],[-123.4,628.8],[-135.6,617.3],[-156.5,604.3],[-193.9,580.2],[-210.2,563.9],[-224.1,541.9],[-232.9,521.9],[-238.8,499.5],[-243.8,458],[-246.8,443.4],[-251.8,429.8],[-261.4,412],[-347.1,275.2],[-401.6,188.3],[-416.7,155.9],[-426.4,131.7],[-437.7,93],[-506.1,-145.4],[-611.1,-507.4],[-635.4,-594.4],[-636.7,-608.5],[-634.1,-624.2],[-625.7,-636.7],[-613.6,-647.3],[-598,-655.6],[-588.8,-664.5],[-582.5,-675],[-577.5,-690.7],[-578.3,-706.4],[-599.3,-800.2],[-598.9,-816.4],[-595.5,-831.1],[-584.2,-847.3],[-570.7,-858.3],[-331.6,-1023.4],[-316.5,-1029.7],[-301.4,-1030.1],[-285.4,-1025.5],[-272.4,-1016],[-263.1,-1002.5],[-259.4,-988.8],[-258.5,-974.1],[-263.1,-960.5],[-271.5,-946.3],[-283.7,-936.5],[-388.2,-872],[-399.6,-860.4],[-405.8,-848.9],[-408.3,-835.3],[-407.1,-818.5],[-363.8,-691.7],[-350.4,-640],[-319.8,-480.1],[-304.7,-388.5],[-301.4,-372.8],[-293.8,-356],[-283.7,-342.3],[-268.6,-327.7],[-251.8,-316.7],[-233.4,-309.3],[-214,-306.2],[-151.5,-302],[-127.6,-304.7],[-105.7,-310.9],[-83.5,-320.3],[-65.4,-332.5],[-44.5,-351.8],[-31.1,-371.1],[-16.4,-398.9],[42.8,-546.7],[95.7,-678.2],[107.1,-698.6],[120.5,-712.7],[138.9,-723.2],[157.4,-728.4],[174.6,-729],[191.8,-725.3],[206.5,-718.5],[230.9,-702.7],[246.8,-696],[266.1,-692.9],[285.4,-695],[303.1,-700.6],[318.2,-711.2],[327.8,-723.2],[339.6,-739.4],[436.5,-891.3],[446.1,-900.2],[457.9,-906.6],[472.2,-909.7],[488.1,-908.7],[501.9,-902.3],[567.5,-854.7],[606,-826.4],[615.7,-813.9],[625.7,-798.7],[631.6,-784],[635.8,-766.6],[636.7,-748.9],[633.8,-727.4],[627,-709.1],[618.2,-685.5],[605.2,-649.8],[582.6,-609.5],[557.7,-574.4],[520,-532],[457.1,-470.7],[420.1,-441.9],[388.6,-423.6],[226.6,-339.2],[203.1,-324.6],[180.9,-307.2],[160.3,-287.9],[142.7,-266.9],[126.4,-244.9],[104.5,-204.6],[86.9,-165.9],[46.6,-76.3],[39.5,-56.8],[35.2,-36],[34.5,-9.7],[38.6,13.8],[62.5,75.2],[88.6,142.7],[120,227.1],[128.1,258.4],[135.6,295.7],[140.2,330.2],[143.2,359.6],[152.4,495.3],[150.7,504.2],[145.2,510.5],[136.8,512.6],[122.6,510.5],[107.8,510.5],[97.8,512.6],[91.1,519.9],[89.4,528.3],[93.6,539.3],[145.2,623.6]] },
  }
  );
})();
