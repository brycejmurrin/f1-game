/* Apex 26 — ZOLDER circuit definition (data only). Retired circuit (`classic: true`).
   Belgian GP 1973-1984. Pine heath in Limburg; Gilles Villeneuve was killed here in qualifying in 1982.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 4010 m researched vs 4004 m projected (-0.15%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "zolder",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // MEASURED, not assumed. The stitcher was supposed to leave v0 mid-straight
    // and did not: the 182 m of starting grid behind v0 ran through a corner of
    // 176 m radius, so the grid was laid round a bend. Now 4653 m.
    //
    // startFrac is an INDEX fraction into the control points, NOT an arc
    // fraction. The points are not arc-uniform, so this value comes from
    // projecting each control point onto the spline the grid is measured on and
    // taking the nearest node that holds R >= 1500 m across the whole zone.
    // Scaling a polyline length instead put this circuit on a 35 m radius.
    //
    // sceneryStartFrac records that every prop, landmark and corner board was
    // authored against the OLD origin, so the dressed world stays on its real
    // corners while only the line and grid move.
    startFrac: 0.1226,
    sceneryStartFrac: 0.0000,
    name: "ZOLDER",
    gp: "Belgian GP",
    country: "Belgium",
    night: false,
    theme: "green",
    lengthKm: 4.004,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    pal: {
      zenith:        [0.38, 0.48, 0.60],
      horizon:       [0.66, 0.70, 0.72],
      sun:           [0.94, 0.94, 0.90],
      sunColor:      [0.94, 0.92, 0.86],
      ambientSky:    [0.50, 0.54, 0.58],
      ambientGround: [0.26, 0.28, 0.24],
      fogColor:      [0.62, 0.66, 0.68],
      fogDensity:    0.0030,
      grass:         [0.18, 0.38, 0.18],
      sunDir:        [0.50, 0.52, 0.42],
    },

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the 10 strongest curvature peaks of THIS centreline in lap order,
    // 10 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    turns: [0.0240, 0.0376, 0.1911, 0.2771, 0.4105, 0.5591, 0.7066, 0.7230, 0.7675, 0.8790],
    furniture: { tree: "fir", fol: [0.15, 0.31, 0.19], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["concrete", "steel", "darkSteel"],
    path: { len: 4004, pts: [[-433.1,493.4],[-554,446.2],[-561.5,440],[-565.8,432.8],[-567.1,428],[-567,422.1],[-565.5,418.2],[-559.6,410.2],[-515.3,380.8],[-502.6,370.1],[-494.9,361],[-473.8,330.9],[-463.8,321.1],[-121.4,89],[-117,82.2],[-115.2,75.6],[-113.3,65.3],[-127.7,44.1],[-132.2,35.6],[-131.7,29.9],[-129.2,23.9],[-125.6,16.7],[-118,7.4],[72.7,-114.4],[330.8,-282.9],[344.8,-295],[358,-308.9],[366.7,-320.2],[370,-334],[367.9,-352.8],[360,-374.8],[355.6,-383.6],[341.1,-405],[313.7,-441.8],[244,-539.8],[237.8,-553.2],[230,-578.2],[228.7,-590.7],[230,-604.8],[233.5,-615.6],[243.2,-628.2],[248.5,-632.7],[271.1,-644.5],[289.1,-649.7],[341.5,-658.8],[367.4,-660.6],[385.5,-658.9],[395.3,-656.6],[414.6,-649.1],[432.1,-639.3],[446.2,-628.2],[460.6,-613.5],[474.8,-593.9],[558.6,-439.5],[563.9,-424.5],[566.8,-408.1],[567.1,-399.2],[566.5,-391.3],[563.1,-376.9],[557.9,-364.2],[549.3,-350.7],[540.2,-340.8],[526.9,-330.4],[181.2,-93.1],[75.3,-24.3],[68,-18.2],[63.7,-10.9],[64.4,-7.2],[71.8,9.3],[71.1,16.5],[5.5,121],[-54,234.5],[-61.3,251.1],[-66.3,263.6],[-73.8,293.7],[-76.2,337.7],[-74.2,353.7],[-70.9,369.2],[-62.3,398.8],[-43.9,454.2],[-29.9,488.5],[-29.3,492.9],[-30.2,501.3],[-34.1,505.1],[-48.3,513.9],[-52.7,519],[-54.2,524.9],[-52.8,533.3],[-42.3,553.4],[-38,566.4],[-38,578.2],[-39.4,584.1],[-44,594.3],[-48.2,598.9],[-119.8,651.8],[-128.5,655.7],[-149.7,660.2],[-159.9,660.6],[-178.1,658],[-191,653.7],[-200.5,648.9],[-215.1,637.5],[-303.4,560.1],[-325.3,543.2],[-345,530.9],[-363.2,521.9]] },
  }
  );
})();
