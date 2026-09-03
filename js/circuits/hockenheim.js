/* Apex 26 — HOCKENHEIMRING circuit definition (data only). Retired circuit (`classic: true`): last German GP 2019, not on the current calendar, so it is playable … */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hockenheim",
    classic: true,
    reverse: false,
    startFrac: 0.0,
    name: "HOCKENHEIM",
    gp: "German GP",
    country: "Germany",
    night: false,
    theme: "green",
    lengthKm: 4.6,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.78, s1: 0.06 },   // Motodrom + pits
      { kind: "foliage", s0: 0.40, s1: 0.50 },               // Spitzkehre runoff
    ],
    // Baden pine forest under a hazy continental summer sky.
    pal: {
      zenith:        [0.26, 0.44, 0.72],
      horizon:       [0.74, 0.76, 0.72],
      sun:           [1.0,  0.95, 0.78],
      sunColor:      [1.0,  0.94, 0.76],
      ambientSky:    [0.48, 0.52, 0.58],
      ambientGround: [0.24, 0.25, 0.20],
      fogColor:      [0.70, 0.72, 0.70],
      grass:         [0.19, 0.42, 0.19],
      sunDir:        [0.42, 0.62, 0.36],
    },
    elevations: [
      { s: 0.26, halfM: 380, rise: -3.5 },  // drift down through the forest loop
      { s: 0.46, halfM: 300, rise: -5.0 },  // Spitzkehre sits in the low corner
      { s: 0.70, halfM: 420, rise: 4.0 },   // climb back toward the Motodrom
    ],
    hwZones: [
      { s0: 0.435, s1: 0.480, hw: 6.2, ease: 0.012 },  // Spitzkehre hairpin
      { s0: 0.815, s1: 0.960, hw: 6.6, ease: 0.015 },  // Motodrom stadium loop
    ],
    bankZones: [
      { frac: 0.055, angleDeg: 3.0, widthM: 110 },   // Nordkurve
      { frac: 0.335, angleDeg: 2.5, widthM: 90 },    // Ostkurve entry
      { frac: 0.880, angleDeg: 4.0, widthM: 120 },   // Sachskurve
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.0610, 0.1875, 0.1985, 0.2175, 0.4635, 0.5625, 0.6220, 0.6570, 0.7535, 0.7655, 0.8265, 0.8335, 0.8415, 0.8675, 0.8830, 0.9075, 0.9360],
    furniture: { tree: "fir",   fol: [0.11, 0.30, 0.15], lamp: "none" },  // Hardtwald pine corridor
    kit: { marshal: "bunker",    rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "panel",     gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    standSet: ["concrete", "darkSteel", "crimson"],  // Motodrom concrete bowl, German-GP red accents
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 4559, pts: [[609.1,-216.9],[668.6,-95.7],[726.6,12.4],[727.8,20.7],[725.3,29.2],[699.1,88.9],[686.6,115.8],[673.4,140.4],[659.1,161.9],[645,180.2],[618.8,210.7],[562.1,268.9],[387.4,452.1],[380,455.7],[370.2,457.3],[362,453.6],[353.4,445.7],[344,430.6],[337.1,411.7],[335.8,395.4],[336.2,372.8],[334.6,360.8],[331.9,350.3],[324.6,335.6],[316.5,325.1],[302.3,314.6],[261.1,289.4],[217.3,264.7],[171.3,241.7],[128,221.2],[95.4,207.5],[54.6,193.4],[14.2,182.3],[-21,174],[-68.2,165.5],[-100.9,161.4],[-138.7,158.2],[-170.5,157.7],[-211.7,159.7],[-252.1,164],[-292.8,171.9],[-338.8,183.9],[-424.2,212.8],[-705.1,319.3],[-714.1,320.9],[-721.8,318.8],[-726.5,312.5],[-727.8,305.7],[-725.7,299.3],[-720.5,294.1],[-612.7,223.3],[-387.7,74.8],[-371.8,68.5],[-354.2,66.9],[-106.5,97.8],[-95.7,97.8],[-88.4,91.6],[-84.1,77.9],[-82.9,55.9],[-85,28.1],[-91.9,5.6],[-103.5,-15.5],[-118.1,-34.8],[-123.7,-45.9],[-125.8,-57.4],[-125.8,-67.9],[-122.8,-78.9],[-115.5,-94.2],[-106.5,-106.8],[-95.3,-117.8],[-73.4,-135.1],[46,-214.8],[187.6,-307.2],[200.6,-314],[214.7,-318.7],[227.6,-319.8],[242.2,-318.3],[254.7,-315.6],[267.1,-310.4],[279.1,-302.5],[292,-291],[307.9,-271.5],[435,-121.4],[444.5,-113.5],[455.2,-108.3],[466.8,-107.3],[478.3,-108.3],[488.3,-113.1],[496,-120.9],[502.4,-130.4],[505.8,-141.4],[506.3,-153],[504.2,-166.1],[483.5,-230.1],[478.3,-240.6],[470.7,-251.6],[459.5,-261],[447.4,-266.8],[421.7,-276.7],[409.3,-283.6],[399.8,-292.5],[389.5,-305.1],[357.3,-350.8],[351.7,-363.3],[349.6,-372.3],[350.4,-381.7],[353,-391.7],[360.7,-401.6],[373.6,-412.1],[421.2,-446.3],[437.6,-455.2],[448.7,-457.3],[461.2,-457.3],[475.8,-454.2],[489.1,-445.7],[501.1,-433.7],[511.9,-418.4],[521.3,-401.6]] },
  }
  );
})();
