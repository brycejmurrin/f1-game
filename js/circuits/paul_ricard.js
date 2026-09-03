/* Apex 26 — CIRCUIT PAUL RICARD definition (data only).
   Retired circuit (`classic: true`): last French GP 2022.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "paul_ricard",
    classic: true,
    reverse: true,
    // The trace's first vertex opens the pit straight and IS the start line; the
    // 1044 m run at source 0.52-0.70 is the Mistral, not the start.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured LEFT, matches the Verrerie left-right.
    // Was 0.03, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.03,
    name: "PAUL RICARD",
    gp: "French GP",
    country: "France",
    night: false,
    theme: "modern",
    lengthKm: 5.8,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 130,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },  // pits
      { kind: "foliage", s0: 0.20, s1: 0.44 },
      { kind: "foliage", s0: 0.60, s1: 0.78 },
      { kind: "city", s0: 0, s1: 1 },
    ],
    // High Provençal plateau: hard white light, bleached limestone, dry scrub.
    pal: {
      zenith:        [0.22, 0.44, 0.78],
      horizon:       [0.84, 0.82, 0.74],
      sun:           [1.0,  0.97, 0.84],
      sunColor:      [1.0,  0.96, 0.82],
      ambientSky:    [0.54, 0.56, 0.60],
      ambientGround: [0.34, 0.31, 0.24],
      fogColor:      [0.80, 0.78, 0.70],
      grass:         [0.34, 0.40, 0.21],
      runoff:        [0.42, 0.44, 0.62],   // the famous blue-tinted abrasive runoff
      sunDir:        [0.34, 0.78, 0.24],
    },
    elevations: [
      { s: 0.30, halfM: 460, rise: 3.0 },
      { s: 0.66, halfM: 420, rise: -3.5 },
      { s: 0.88, halfM: 380, rise: 2.5 },
    ],
    hwZones: [
      { s0: 0.415, s1: 0.455, hw: 6.8, ease: 0.014 },  // Mistral chicane
      { s0: 0.700, s1: 0.745, hw: 6.6, ease: 0.012 },  // Le Beausset
      { s0: 0.880, s1: 0.930, hw: 6.6, ease: 0.012 },  // Pont / Le Village
    ],
    bankZones: [
      { frac: 0.070, angleDeg: 3.0, widthM: 130 },   // Verrerie
      { frac: 0.560, angleDeg: 4.0, widthM: 170 },   // Signes
      { frac: 0.640, angleDeg: 3.5, widthM: 160 },   // Bosch curve
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.0874, 0.0954, 0.1099, 0.2064, 0.2244, 0.2424, 0.2609, 0.3074, 0.4909, 0.5039, 0.7559, 0.8144, 0.8884, 0.9079, 0.9254],
    furniture: { tree: "stonePine",   fol: [0.14, 0.30, 0.16], lamp: "none",  sparse: true },  // bleached plateau — planting stays off the runoff
    kit: { marshal: "kiosk",     rail: "wArmco",      fence: "panelled",  tyre: "tecpro",  board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "led" },
    standSet: ["alu", "navy", "pastel"],  // clinical: aluminium against the blue runoff
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    // Circuit Paul Ricard — Le Castellet. Upstream fr-1969, stated 5842 m, projected 5825 m, trace winding CW.
    path: { len: 5825, pts: [[-50.7,-91.3],[-291.6,-275],[-414.4,-369.9],[-422.1,-372.6],[-429.3,-372],[-435.1,-368.9],[-438.4,-364.1],[-439.8,-357.9],[-441.8,-293.3],[-443.7,-279.7],[-446.6,-272.4],[-451.8,-264.5],[-460,-254.5],[-471.6,-244.6],[-484.9,-237.2],[-499.4,-233],[-514.2,-232],[-531.1,-233],[-546.4,-238.2],[-558.4,-245.6],[-568.4,-255],[-587.7,-276.1],[-606.4,-293.3],[-628,-309.6],[-651,-322.7],[-673.5,-332.7],[-697.5,-339.5],[-721,-344.8],[-747.9,-346.9],[-776.2,-346.9],[-798.8,-343.8],[-820.9,-338.4],[-843,-331.1],[-865,-322.2],[-883.8,-311.7],[-895.8,-304.3],[-906.3,-299.1],[-916.3,-296],[-926.5,-295.4],[-937,-297.6],[-947.1,-303.3],[-955.7,-311.1],[-961.5,-319],[-964.8,-326.9],[-967.7,-336.4],[-969.6,-349.4],[-969.6,-365.8],[-966.8,-377.8],[-962.5,-389.4],[-956.2,-401.4],[-950.5,-409.9],[-904.3,-470.2],[-889,-491.7],[-874.2,-515.3],[-859.3,-543.1],[-852.5,-559.4],[-849.7,-569.3],[-848.2,-578.8],[-849.7,-588.2],[-853,-596.7],[-857.8,-605],[-866,-615],[-876.5,-623.9],[-891,-633.9],[-905.8,-641.2],[-920.7,-645.4],[-934.1,-647],[-947.6,-646.4],[-961.5,-643.3],[-974.5,-638.6],[-987.4,-632.9],[-997,-626.5],[-1005.6,-619.7],[-1012.8,-611.4],[-1020.5,-601.9],[-1026.8,-589.8],[-1031.6,-579.9],[-1034.4,-568.8],[-1035.9,-557.8],[-1036.3,-547.8],[-1035.4,-327.9],[-1035.4,-312.7],[-1034.4,-301.2],[-1032.5,-290.7],[-1027.7,-276.1],[-1022.4,-260.8],[-1016.2,-249.2],[-1008,-237.2],[-997.5,-225.1],[-985.5,-212.5],[-972.5,-202],[-961,-194.1],[-950,-188.4],[-939.4,-183.7],[-853,-150.1],[-750.3,-111.2],[-651.5,-74.5],[-533.9,-30.9],[-429.3,8.9],[-416.3,14.7],[-404.3,21.5],[-316.5,81.8],[-300.6,92.8],[-293,101.3],[-268,139.6],[-261.3,145.8],[-251.7,151.6],[-242.1,153.2],[-235,153.2],[-227.3,149.5],[-221,144.8],[-187.5,113.3],[-180.2,108.1],[-172,106.5],[-163.5,108.1],[-67.9,143.7],[233.9,256.6],[355.9,302.8],[720.1,438.7],[805,470.7],[813.6,474.9],[820.8,480.7],[824.6,485.9],[829,492.1],[833.8,500],[837.1,508],[856.3,553.6],[861.6,562.5],[866.9,572.5],[875.1,583],[882.7,594.6],[890.4,602.9],[905.3,616.6],[919.7,628.1],[932.6,636],[947.6,642.3],[960.9,646],[969.6,647],[979.2,645.4],[988.8,642.3],[996.5,637.5],[1004.2,630.7],[1008.4,625.5],[1011.4,618.6],[1033.9,552],[1036.3,543.1],[1036.3,538.9],[1034.4,533.1],[1030.1,528.9],[1023.4,526.9],[1010.4,527.3],[965.3,534.7],[952.3,534.7],[939.4,533.1],[928.3,528.4],[920.6,522.1],[913.9,514.7],[910.1,508],[906.3,499],[904.8,491.7],[904.3,485.4],[905.3,477],[909.6,451.3],[909.6,444.9],[908.2,438.2],[905.3,431.8],[899.6,426.6],[890.9,419.2],[839.1,388.3],[796.8,364.7],[758.5,348.4],[724.8,334.3],[707.6,325.3],[688.8,315.4],[668.7,301.7],[642.3,283.9],[607.3,255.6],[579.5,235.1],[562.2,217.7],[538.7,193.1],[528.5,185.8],[514.7,177.9],[462.8,149.1],[447,142.7],[434.5,141.7],[423,143.3],[411.5,147.4],[400.9,154.3],[393.7,161.6],[386,172.1],[379.4,180.4],[370.7,187.4],[362.1,190.5],[352.4,192],[340,192],[327,191],[315.5,187.4],[308.3,182.6],[256.5,142.7],[187.9,89.7],[110.1,32.5],[35.3,-25.7]] },
  }
  );
})();
