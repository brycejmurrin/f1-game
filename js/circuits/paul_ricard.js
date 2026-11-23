/* Apex 26 — CIRCUIT PAUL RICARD definition (data only).
   Retired circuit (`classic: true`): last French GP 2022.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "paul_ricard",
    revision: 3,
    classic: true,
    reverse: true,
    // The trace's first vertex opens the pit straight and IS the start line; the
    // 1044 m run at source 0.52-0.70 is the Mistral, not the start.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured LEFT, matches the Verrerie left-right.
    // A start line is always on a straight: docs/tracks/START-LINES.md.
    // No sceneryStartFrac: the scenery is authored against THIS start (pit block
    // 0.95-0.01 = pitLaneSpan, Verrerie bank 0.07 = T1). The 0.03 the start-line
    // campaign kept was a shift of 0.923 on this reversed lap and stood the pit
    // block on Le Village. docs/notes/DEFECT-LEDGER.md § paul_ricard.
    startFrac: 0.0000,
    name: "PAUL RICARD",
    gp: "French GP",
    country: "France",
    night: false,
    theme: "modern",
    lengthKm: 5.8,
    tyreSeverity: 1.28,  // High summer track temps + abrasion (historic French GP Pirelli)
    baseHW: 8,
    sceneryCoordinates: "racing",
    ownPitStraight: true,   // its own 150 m main stand (scenery grandstandEx 0.005); the generic 7-box stand stood inside it
    terrainOuter: 130,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },  // pits
      { kind: "foliage", s0: 0.20, s1: 0.50 },   // the plateau to the Mistral chicane (0.49-0.50)
      { kind: "foliage", s0: 0.68, s1: 0.83 },   // Signes (0.713), Beausset, Bendor run-off
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
      grass:         [0.46, 0.46, 0.34],   // bleached limestone plateau; [0.34,0.40,0.21] read olive-green, [0.56,0.53,0.38] desert-orange
      runoff:        [0.42, 0.44, 0.62],   // the famous blue-tinted abrasive runoff
      sunDir:        [0.34, 0.78, 0.24],
    },
    // hwZones are SOURCE fracs on a reversed def: resolve() maps them through
    // TrackSpace.range(..., "source"), i.e. by control-point INDEX, and this
    // trace's points are uneven (300 m legs on the straights, 3-8 m in the
    // corners), so racing arc is not 1 - s and `ease` is index-wide too.
    // Written as racing fracs, they narrowed the Mistral straight (0.61-0.67)
    // and never the chicane. Each zone now spans exactly its corner's control
    // points, with an ease under one index step (1/202), so the taper runs
    // over the one short leg either side instead of a 300 m straight.
    hwZones: [
      { s0: 0.5135, s1: 0.5580, hw: 6.8, ease: 0.003 },  // Mistral chicane (racing 0.490-0.511)
      { s0: 0.2710, s1: 0.3405, hw: 6.6, ease: 0.003 },  // Le Beausset (racing 0.729-0.760)
      { s0: 0.0135, s1: 0.0980, hw: 6.6, ease: 0.003 },  // Pont / Le Village / Tour (racing 0.883-0.927)
    ],
    // IGN RGE ALTI cross-sections at ±5 m from the racing centreline, sampled
    // through each apex. Values fit the local net transverse slope.
    bankZones: [
      { turn: 1, angleDeg: 0.4, widthM: 130 },       // Verrerie
      { frac: 0.713, angleDeg: 1.4, widthM: 170 },   // Signes
      { frac: 0.745, angleDeg: 0.8, widthM: 160 },   // Le Beausset
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: sector splits + turn apexes as RACING-LAP fractions (post
    // startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs re-seats
    // turns when the start line moves.
    // turns: one apex per corner of the FIA 2022 French GP numbering (Race Director
    // "Event Notes - Circuit Map v2", FRANCE_CIRCUIT_22 FIA v2, 21 Jul 2022), T1..T15
    // in lap order, each at THIS centreline's curvature peak for that corner:
    // T1 L, T2 R, T3 R, T4 L, T5 R, T6 R, T7 L, T8 L / T9 R (Mistral chicane),
    // T10 R (Signes), T11 R, T12 L, T13 R (flat arc, mid-arc), T14 L, T15 R.
    // The previous list split T1 into two peaks and had no T10 or T13.
    sectors: [0.333, 0.681],  // ~1/3 and ~2/3, each snapped to the nearest straight (2026-10-04) — not FIA-published splits
    turns: [0.0957, 0.1102, 0.2066, 0.2245, 0.2424, 0.2610, 0.3072, 0.4904, 0.5041, 0.7135, 0.7562, 0.8147, 0.8526, 0.9077, 0.9249],
    furniture: { tree: "stonePine",   fol: [0.14, 0.30, 0.16], lamp: "none",  sparse: true },  // bleached plateau — planting stays off the runoff
    kit: { marshal: "kiosk",     rail: "wArmco",      fence: "panelled",  tyre: "tecpro",  board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "led" },
    standSet: ["alu", "navy", "pastel"],  // clinical: aluminium against the blue runoff
    // OSM trace (bacinger/f1-circuits, ODbL). Each [x,z,y] carries IGN RGE ALTI terrain
    // elevation at the source vertex, in metres relative to the first vertex (426.44 m above sea level).
    // tools/track/import-circuit-path.mjs projects the open-loop plan.
    // Circuit Paul Ricard — Le Castellet. Upstream fr-1969, stated 5842 m, projected 5825 m, trace winding CW.
    path: { len: 5825, pts: [[-50.7,-91.3,0.0],[-291.6,-275,-0.13],[-414.4,-369.9,1.87],[-420.9,-372.2,1.86],[-429.3,-372,1.92],[-435.1,-368.9,1.96],[-438.4,-364.1,1.97],[-439.8,-357.9,2.02],[-441.8,-293.3,2.43],[-443.7,-279.7,2.47],[-446.6,-272.4,2.49],[-451.8,-264.5,2.52],[-460,-254.5,2.58],[-471.6,-244.6,2.89],[-484.9,-237.2,2.97],[-499.4,-233,3.07],[-514.2,-232,3.15],[-531.1,-233,3.32],[-546.4,-238.2,3.43],[-558.4,-245.6,3.47],[-568.4,-255,3.5],[-587.7,-276.1,3.53],[-606.4,-293.3,3.61],[-628,-309.6,3.65],[-651,-322.7,3.75],[-673.5,-332.7,3.9],[-697.5,-339.5,4.04],[-721,-344.8,4.41],[-747.9,-346.9,4.98],[-776.2,-346.9,5.71],[-798.8,-343.8,6.4],[-820.9,-338.4,7.19],[-843,-331.1,8.18],[-865,-322.2,9.08],[-883.8,-311.7,9.83],[-895.8,-304.3,10.5],[-906.3,-299.1,10.96],[-916.3,-296,11.35],[-926.5,-295.4,11.63],[-937,-297.6,11.78],[-947.1,-303.3,11.9],[-955.7,-311.1,11.93],[-961.5,-319,11.87],[-964.8,-326.9,11.7],[-967.7,-336.4,11.43],[-969.6,-349.4,11.22],[-969.6,-365.8,10.69],[-966.8,-377.8,10.37],[-962.5,-389.4,9.88],[-956.2,-401.4,9.41],[-950.5,-409.9,8.97],[-904.3,-470.2,6.47],[-889,-491.7,5.62],[-874.2,-515.3,4.58],[-859.3,-543.1,3.46],[-852.5,-559.4,2.92],[-849.7,-569.3,2.53],[-848.2,-578.8,2.25],[-849.7,-588.2,1.97],[-853,-596.7,2.0],[-857.8,-605,2.01],[-866,-615,2.1],[-876.5,-623.9,2.17],[-891,-633.9,2.21],[-905.8,-641.2,2.3],[-920.7,-645.4,2.52],[-934.1,-647,2.88],[-947.6,-646.4,3.27],[-961.5,-643.3,3.69],[-974.5,-638.6,4.06],[-987.4,-632.9,4.63],[-997,-626.5,5.14],[-1005.6,-619.7,5.54],[-1012.8,-611.4,6.05],[-1020.5,-601.9,6.79],[-1026.8,-589.8,7.22],[-1031.6,-579.9,7.74],[-1034.4,-568.8,8.3],[-1035.9,-557.8,8.62],[-1036.3,-547.8,8.94],[-1035.4,-327.9,14.18],[-1035.4,-312.7,14.56],[-1034.4,-301.2,14.93],[-1032.5,-290.7,15.1],[-1027.7,-276.1,15.35],[-1022.4,-260.8,15.43],[-1016.2,-249.2,15.54],[-1008,-237.2,15.52],[-997.5,-225.1,15.5],[-985.5,-212.5,15.39],[-972.5,-202,15.15],[-961,-194.1,15.02],[-950,-188.4,14.64],[-939.4,-183.7,14.39],[-853,-150.1,11.78],[-750.3,-111.2,8.26],[-651.5,-74.5,5.68],[-533.9,-30.9,2.95],[-429.3,8.9,1.75],[-416.3,14.7,1.65],[-404.3,21.5,1.63],[-316.5,81.8,2.19],[-300.6,92.8,2.36],[-293,101.3,2.55],[-268,139.6,2.79],[-261.3,145.8,2.65],[-251.7,151.6,2.57],[-242.1,153.2,2.38],[-235,153.2,2.17],[-227.3,149.5,1.81],[-221,144.8,1.46],[-187.5,113.3,-0.46],[-180.2,108.1,-0.69],[-172,106.5,-0.8],[-163.5,108.1,-0.94],[-67.9,143.7,-1.83],[233.9,256.6,-5.82],[355.9,302.8,-7.08],[720.1,438.7,-11.39],[805,470.7,-12.5],[813.6,474.9,-12.65],[820.8,480.7,-12.78],[824.6,485.9,-12.86],[829,492.1,-13.0],[833.8,500,-13.05],[837.1,508,-13.12],[856.3,553.6,-13.57],[861.6,562.5,-13.67],[866.9,572.5,-13.79],[875.1,583,-13.88],[882.7,594.6,-13.98],[890.4,602.9,-14.1],[905.3,616.6,-14.19],[919.7,628.1,-14.22],[932.6,636,-14.24],[947.6,642.3,-14.24],[960.9,646,-14.16],[969.6,647,-14.19],[979.2,645.4,-14.23],[988.8,642.3,-14.28],[996.5,637.5,-14.22],[1004.2,630.7,-14.13],[1008.4,625.5,-14.01],[1011.4,618.6,-14.06],[1033.9,552,-13.82],[1036.3,543.1,-13.85],[1036.3,538.9,-13.85],[1034.4,533.1,-13.96],[1030.1,528.9,-13.97],[1023.4,526.9,-14.02],[1010.4,527.3,-13.95],[965.3,534.7,-13.47],[952.3,534.7,-13.28],[939.4,533.1,-13.16],[928.3,528.4,-12.96],[920.6,522.1,-12.85],[913.9,514.7,-12.73],[910.1,508,-12.66],[906.3,499,-12.54],[904.8,491.7,-12.5],[904.3,485.4,-12.36],[905.3,477,-12.31],[909.6,451.3,-11.92],[909.6,444.9,-11.85],[908.2,438.2,-11.65],[905.3,431.8,-11.57],[899.6,426.6,-11.49],[890.9,419.2,-11.25],[839.1,388.3,-10.03],[796.8,364.7,-9.13],[758.5,348.4,-8.76],[724.8,334.3,-8.53],[707.6,325.3,-8.31],[688.8,315.4,-8.17],[668.7,301.7,-7.98],[642.3,283.9,-7.84],[607.3,255.6,-7.6],[579.5,235.1,-7.45],[562.2,217.7,-7.13],[538.7,193.1,-6.9],[528.5,185.8,-6.84],[514.7,177.9,-6.65],[462.8,149.1,-5.7],[447,142.7,-4.83],[434.5,141.7,-4.28],[423,143.3,-4.16],[411.5,147.4,-4.18],[400.9,154.3,-4.2],[393.7,161.6,-4.52],[386,172.1,-4.78],[379.4,180.4,-5.01],[370.7,187.4,-5.07],[362.1,190.5,-4.95],[352.4,192,-4.8],[340,192,-4.56],[327,191,-4.39],[315.5,187.4,-4.34],[308.3,182.6,-4.35],[256.5,142.7,-4.47],[187.9,89.7,-4.28],[110.1,32.5,-3.25],[35.3,-25.7,-1.49]] },
  }
  );
})();
