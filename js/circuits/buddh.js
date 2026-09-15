/* Apex 26 — BUDDH circuit definition (data only). Retired circuit (`classic: true`).
   Indian GP 2011-2013. Tilke layout with a long downhill run into a double-apex Turn 10-11.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 5141 m researched vs 5138 m projected (-0.06%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "buddh",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // v0 sits mid the longest straight, placed by the stitcher. Not yet checked
    // against the real start/finish line — see docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    name: "BUDDH",
    gp: "Indian GP",
    country: "India",
    night: false,
    // "green", NOT "modern" — same reason as korea.js, and the same 2026-09-15
    // visual pass. This file's scenery() carries a RURAL DEPTH band (brick
    // kilns, a pylon line, bunded fields, a village) written specifically to own
    // the far distance; reading that comment alone suggested the generic
    // skyline had been displaced, and the render showed it had not. The Greater
    // Noida plain is farmland and brickfields, not a downtown.
    theme: "green",
    lengthKm: 5.138,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    pal: {
      zenith:        [0.28, 0.42, 0.60],
      horizon:       [0.66, 0.68, 0.68],
      sun:           [0.96, 0.92, 0.84],
      sunColor:      [0.94, 0.90, 0.82],
      ambientSky:    [0.48, 0.52, 0.56],
      ambientGround: [0.26, 0.26, 0.24],
      fogColor:      [0.64, 0.66, 0.66],
      fogDensity:    0.0022,
      grass:         [0.26, 0.42, 0.22],
      sunDir:        [0.56, 0.62, 0.40],
    },

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the 16 strongest curvature peaks of THIS centreline in lap order,
    // 16 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    turns: [0.1197, 0.2288, 0.2527, 0.2963, 0.3103, 0.3663, 0.3807, 0.4228, 0.4913, 0.5092, 0.5633, 0.5733, 0.6482, 0.7943, 0.8133, 0.8682],
    furniture: { tree: "broad", fol: [0.26, 0.40, 0.22], lamp: "post", lc: [0.92, 0.96, 1.0] },
    kit: { marshal: "kiosk", rail: "wArmco", fence: "panelled", tyre: "stack", board: "monopole", gantry: "truss", camera: "monopole", hoarding: "panel" },
    standSet: ["alu", "sandstone", "steel"],
    path: { len: 5138, pts: [[-305.1,94.6],[-378.3,-170.7],[-420,-343.8],[-422.9,-398.7],[-419.6,-408.1],[-415.5,-410.6],[-406.8,-412.1],[-392.4,-408.1],[44.4,-157.6],[54.7,-153.9],[72,-153.2],[87,-156.7],[94.2,-160.6],[145.8,-208.3],[151,-214.2],[157,-227.9],[157.3,-242.4],[154.5,-250],[137.7,-271.2],[133.5,-286.6],[145.3,-424.6],[148.3,-441.9],[153.5,-452.2],[161.1,-460],[203.9,-482.8],[212.1,-493.2],[215.6,-502.2],[218,-515.4],[225.8,-738.1],[232.1,-770.2],[245.1,-792.7],[265.2,-809.9],[286.1,-819.1],[299.1,-821.6],[319.4,-821.6],[335.2,-817.5],[354.8,-807.4],[380.2,-785.8],[394,-769.5],[411,-740.2],[415.7,-728.3],[422.5,-704.4],[422.9,-686.1],[417,-666.5],[403.8,-648.9],[346.1,-602.5],[322.1,-573.8],[242.2,-434.5],[230.5,-409.3],[228.5,-388.9],[229.7,-379.5],[238.9,-356.8],[289.2,-296.5],[292.3,-287.7],[276.9,-52.3],[273.8,-40.5],[266,-26.6],[254.9,-13.9],[239.6,-5.2],[222.5,-1.8],[205,-4.4],[1.9,-120.2],[-69.2,-153.8],[-92,-160.5],[-100.2,-159.5],[-112.8,-151.3],[-115.9,-140.3],[-115.8,-133.4],[-103.5,-96.1],[122.6,524.6],[123,540.9],[116.8,548.8],[109.7,552.5],[104.3,553.9],[54.4,562.9],[31.4,570.3],[10.5,583.4],[-9.5,602.7],[-28.6,632.6],[-48.8,677.8],[-55.9,708.7],[-67.7,796.2],[-72.5,814.6],[-76.3,818.8],[-85.5,821.6],[-95.9,817.7],[-101.5,808.3]] },
  }
  );
})();
