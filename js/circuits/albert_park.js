/* Apex 26 — ALBERT PARK circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "albert_park",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 2.5 m off centreline; = trace vertex 0.
    // Was 0.0925, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.0925,
    name: "ALBERT PARK",
    gp: "Australian GP",
    country: "Australia",
    night: false,
    theme: "green",
    sceneryTheme: "park",
    lengthKm: 5.3,
    baseHW: 7,
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 120,
    dressingExclusions: [
      { kind: "foliage", s0: 0, s1: 1 },
    ],
    pal: { zenith: [0.22, 0.44, 0.82], horizon: [0.76, 0.79, 0.82], grass: [0.28, 0.50, 0.24], runoff: [0.48, 0.42, 0.32], fogDensity: 0.0012, sunDir: [0.6666666666666667, 0.6666666666666667, 0.33333333333333337], sun: [1, 0.95, 0.8], sunColor: [1, 0.93, 0.78] },
    bankZones: [
      { frac: 0.1125, angleDeg: 3.0, widthM: 90 },    // T1
      { frac: 0.1810, angleDeg: 3.0, widthM: 90 },    // T3
      { frac: 0.3186, angleDeg: 2.5, widthM: 200 },   // the long lakeside right
      { frac: 0.5300, angleDeg: 3.5, widthM: 130 },   // fast left past the lake
      { frac: 0.7331, angleDeg: 3.0, widthM: 110 },   // T10
      { frac: 0.9741, angleDeg: 3.0, widthM: 90 },    // last corner
    ],
    elevations: [{ s: 0.2125, halfM: 340, rise: 0.6 }, { s: 0.6425, halfM: 300, rise: -0.4 }],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.3, 0.62],
    turns: [0.0762, 0.1021, 0.2146, 0.2413, 0.2831, 0.3652, 0.4770, 0.5029, 0.6321, 0.6588, 0.7880, 0.8352, 0.8861, 0.9150],
    furniture: { tree: "broad", fol: [0.28, 0.46, 0.22], lamp: "none", treeCrown: "vase" },  // tidy Melbourne parkland
    kit: { marshal: "container", rail: "jersey",      fence: "chainlink", tyre: "tecpro",  board: "panel",     gantry: "box",        camera: "scaffold",  hoarding: "panel" },
    standSet: ["steel", "pastel", "alu"],  // temporary park build, pale Melbourne palette
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 5279, pts: [[151.9,-428],[241.3,-339.7],[373.7,-204.7],[381.3,-196.9],[384.6,-186.2],[384.1,-181.5],[381.9,-177.2],[377.4,-166.3],[369.9,-153],[365.3,-136.1],[362.6,-115.3],[362.1,-100],[366.7,-70.3],[372.6,-55.2],[381.6,-39.4],[392.2,-26.7],[415.8,-3.2],[443.8,22.4],[483.1,60.5],[531.1,111.7],[550.4,132.3],[601.5,196.5],[626.9,230.5],[653.2,271.8],[703.8,360.3],[716.3,385.1],[723.8,403.7],[722.9,414],[718.5,421.4],[707.9,426.7],[672.2,433],[604.7,446.8],[596.9,449.9],[592,453.1],[588.6,457.8],[583.7,472.4],[582.7,487.7],[587.3,619.5],[588.9,667.9],[587.7,672],[573.4,688.7],[560.3,698.6],[459.9,771],[437.7,783.9],[334,826.2],[294.9,840.3],[259.5,861.7],[232.6,878],[220.6,880.1],[211,880.3],[202.1,875],[190.4,861.2],[176.3,848.8],[156.9,835.1],[132.3,825.8],[100.4,821.9],[71.6,820.6],[47.1,816.9],[19.9,807.5],[-4.2,796],[-30.8,776.3],[-48.7,760.3],[-66.5,737],[-83.2,708],[-92.6,678.5],[-98.5,655.7],[-101.5,636.6],[-125.8,504],[-126,487.4],[-123.3,467.5],[-116.8,447.1],[-109.2,429.7],[-95.5,410.4],[-83,395],[-69.2,376.3],[-62.2,362.7],[-56.2,347.4],[-51.6,329.9],[-24.1,183.9],[-22,166.1],[-20.8,145],[-20.8,125.6],[-22.5,90.4],[-26.5,63.2],[-34,31.9],[-43.2,1.6],[-55.2,-24.4],[-67.7,-48.6],[-88.4,-81.1],[-102.3,-101.6],[-130.1,-131.1],[-222,-212.8],[-236.5,-224],[-250.1,-231.5],[-260.1,-236.3],[-279.5,-242.2],[-298.2,-243.7],[-320.8,-242.9],[-341.3,-242.7],[-361.2,-242],[-378.1,-242.5],[-392.5,-246.1],[-406.9,-253.1],[-416.7,-258.7],[-434.2,-274.2],[-535.8,-360.7],[-573.6,-392.4],[-592,-414.5],[-605.7,-430.4],[-620.7,-454.1],[-635.8,-489.3],[-650.9,-533.4],[-691,-672.1],[-715,-760.3],[-719.6,-784.8],[-722.1,-797.1],[-722.4,-804.7],[-716.1,-808],[-697.3,-815.3],[-606.9,-851.8],[-513.8,-888.8],[-506.6,-890.8],[-495,-892.1],[-480.8,-891.1],[-466.2,-885.1],[-451.5,-875.1],[-442.8,-867.1],[-434.4,-854.1],[-379.2,-752.3],[-345.8,-698.2],[-341.3,-690.9],[-336.7,-686.7],[-332,-684.9],[-324,-684.6],[-318.4,-687.8],[-258.4,-755.7],[-250.1,-764.1],[-241.1,-769.3],[-229.9,-773.7],[-219.8,-776.1],[-210.9,-776],[-200.2,-773.8],[-185.3,-768.6],[-174.3,-760.8],[-170,-756.6]] },
  }
  );
})();
