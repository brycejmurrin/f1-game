/* Apex 26 — MONZA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monza",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 3.9 m off centreline; = trace vertex 0.
    // Was 0.0125, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.0125,
    name: "MONZA",
    gp: "Italian GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    sceneryCoordinates: "racing",
    // Keep the royal-park terrain under the deep forest ranks and hero models.
    terrainOuter: 120,
    dressingExclusions: [
      { kind: "foliage", s0: 0.93, s1: 0.07 },          // pits / Tribuna Centrale
      { kinds: ["foliage"], s0: 0.20, s1: 0.27, side: -1 }, // west lake
      { kinds: ["foliage"], s0: 0.37, s1: 0.43, side: 1 },  // Villa lake
      { kind: "foliage", s0: 0.49, s1: 0.59, side: -1 }, // banking ruin sightline
      { kind: "foliage", s0: 0.69, s1: 0.77 },           // flyover approaches
    ],
    sunAzimBias: 0.16,   // royal-park afternoon: western sun raking through the trees onto the Curva Grande
    baseHW: 8,
    ownPitStraight: true,
    pal: {
      zenith:        [0.20, 0.40, 0.70],
      horizon:       [0.76, 0.68, 0.52],
      sun:           [1.0,  0.92, 0.66],
      sunColor:      [1.0,  0.88, 0.58],
      ambientSky:    [0.46, 0.50, 0.56],
      ambientGround: [0.24, 0.23, 0.17],
      fogColor:      [0.68, 0.64, 0.54],
      grass:         [0.20, 0.44, 0.18],
      sunDir:        [0.5, 0.55, 0.3],
    },
    elevations: [
      { s: 0.3125, halfM: 220, rise: -1.5 },
      { s: 0.4925, halfM: 340, rise: 4.5 },
    ],
    hwZones: [
      { s0: 0.0155, s1: 0.0949, hw: 6.8, ease: 0.012 },  // arc 0.003-0.024 Rettifilo
      { s0: 0.2821, s1: 0.3460, hw: 7.0, ease: 0.012 },  // arc 0.212-0.234 Roggia
      { s0: 0.5960, s1: 0.7315, hw: 7.2, ease: 0.012 },  // arc 0.524-0.572 Ascari
    ],
    bankZones: [
      { frac: 0.0769, angleDeg: 3.0, widthM: 240 },   // Curva Grande
      { frac: 0.2964, angleDeg: 6.0, widthM: 140 },   // Lesmo 1
      { frac: 0.3456, angleDeg: 6.0, widthM: 80 },    // Lesmo 2
      { frac: 0.5443, angleDeg: 3.5, widthM: 110 },   // Ascari
      { frac: 0.7355, angleDeg: 4.0, widthM: 300 },   // Parabolica
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.28, 0.62],
    turns: [0.0962, 0.1022, 0.1288, 0.3057, 0.3122, 0.3692, 0.3827, 0.6177, 0.6309, 0.6497, 0.8387],
    furniture: { tree: "stonePine", fol: [0.16, 0.34, 0.17], lamp: "none" },  // deep royal-park canopy
    kit: { marshal: "hut",       rail: "armco",       fence: "leaning",   tyre: "stack",   board: "arched",    gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    standSet: ["crimson", "concrete", "steel"],  // tifosi red + old park concrete
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 5787, pts: [[588.1,-292.9],[551.6,135.7],[535,315.4],[533.2,322.7],[528,327],[521.7,328],[513.8,327],[506.4,326.4],[499.6,327],[494.9,330.6],[491.2,335.8],[490.3,340.5],[490.3,345.7],[516.1,443.8],[519.8,470.4],[521.2,494.5],[519.3,520.8],[509.7,648.6],[505.9,669.5],[501.3,688.9],[494.4,709.8],[485.2,732.4],[474.6,754.4],[459,779],[442.9,799.4],[421.2,822.5],[397.6,842.9],[371.4,861.7],[343.3,877.9],[311.5,893.7],[279.7,904.7],[244.7,914.6],[205,921.5],[164.5,925.2],[6.4,938.7],[-187.1,950.3],[-198.6,951.3],[-204.6,954.5],[-209.7,959.7],[-216.1,982.3],[-218.9,988.5],[-223.5,992.7],[-231.3,995.3],[-257.6,1000.1],[-286.2,1006.3],[-326.7,1019.4],[-507.8,1080.2],[-523.5,1083.9],[-538.2,1083.9],[-552.5,1081.2],[-562.6,1077.1],[-572.3,1071.3],[-581.5,1065],[-593.1,1052.4],[-599.5,1042.5],[-604.1,1030.4],[-606.4,1016.9],[-614.2,931],[-629,784.3],[-628.6,771.1],[-626.2,762.7],[-622.6,755.4],[-616.6,750.1],[-605.5,742.8],[-487.1,678.9],[-390.8,625],[-330.8,592],[-301.8,575.2],[-269.1,552.2],[-245.6,534.3],[-225.3,516.5],[-120.2,426.4],[-45.7,358.8],[112,220.6],[206.9,137.2],[219.8,124.1],[224.9,115.8],[225.8,107.5],[225.8,97.5],[222.5,75.5],[221.6,63.5],[221.6,46.1],[223,36.7],[226.7,24.7],[232.3,10.6],[241.5,-3.7],[253.9,-18.3],[268.2,-30.3],[279.7,-39.2],[285.7,-46.1],[290.3,-55.5],[294.5,-72.8],[304.1,-151.9],[314.3,-236.3],[392.6,-992.6],[395.8,-1019.9],[399,-1032.5],[405.5,-1045.5],[414.3,-1056.1],[424.4,-1065.5],[438.7,-1074.9],[454.3,-1080.6],[472.3,-1083.9],[487.6,-1082.8],[501.8,-1079.6],[518.4,-1073.3],[534.5,-1066],[546.5,-1057.6],[560.8,-1046.6],[576.9,-1029.3],[588,-1013.6],[597.6,-996.9],[606,-977],[613.8,-955],[619.8,-932.4],[622.6,-913.1],[625.8,-883.7],[626.2,-854.4],[626.7,-826.6],[628.1,-771.6],[629,-723.4],[628.1,-671],[622.1,-602.4],[599.5,-385.5]] },
  }
  );
})();
