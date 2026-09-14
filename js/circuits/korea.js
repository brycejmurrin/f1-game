/* Apex 26 — KOREA circuit definition (data only). Retired circuit (`classic: true`).
   Korean GP 2010-2013. Tilke layout on reclaimed land by the Yeongam tidal flats; runs anti-clockwise.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 5615 m researched vs 5613 m projected (-0.04%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "korea",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // v0 sits mid the longest straight, placed by the stitcher. Not yet checked
    // against the real start/finish line — see docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    name: "KOREA",
    gp: "Korean GP",
    country: "South Korea",
    night: false,
    theme: "modern",
    lengthKm: 5.613,
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
    // turns: the 18 strongest curvature peaks of THIS centreline in lap order,
    // 18 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    turns: [0.0653, 0.0823, 0.2998, 0.4298, 0.4572, 0.4748, 0.5487, 0.5893, 0.6292, 0.6627, 0.7103, 0.7228, 0.7378, 0.7602, 0.7973, 0.8387, 0.8642, 0.8848],
    furniture: { tree: "broad", fol: [0.24, 0.40, 0.22], lamp: "post", lc: [0.90, 0.96, 1.0] },
    kit: { marshal: "kiosk", rail: "wArmco", fence: "panelled", tyre: "stack", board: "monopole", gantry: "truss", camera: "monopole", hoarding: "panel" },
    standSet: ["alu", "steel", "darkSteel"],
    path: { len: 5613, pts: [[-233.9,-430],[-637.3,-582.9],[-646.9,-584],[-653.6,-578.9],[-655.8,-570.4],[-657.6,-492.6],[-654.2,-477.4],[-644.4,-463.9],[207.4,336.1],[210.7,339.7],[212.8,349],[207.5,356.9],[201.8,358.7],[-478.6,404.2],[-492,409.7],[-499.3,417.6],[-502.4,428.7],[-499.7,438.8],[-494.1,447.6],[-482.8,454.2],[-390.9,468.5],[-383.6,470.9],[-377.5,476.4],[-373.9,483.9],[-374.2,492.4],[-398.1,556.8],[-399.6,565.9],[-393.8,578.9],[-384.4,584],[-237.9,578.5],[-188.8,571],[-154,562],[-116.7,549.4],[-26.8,505.3],[-5.2,500.8],[6.7,501.4],[27,506.8],[111.8,554.6],[130.1,562.1],[148.9,566.6],[168.1,568.1],[202.8,563.5],[218.4,557.5],[232.7,550],[371.1,455.7],[383.3,442.5],[388.4,433.7],[392.8,422.9],[394.2,400.6],[358.8,259.7],[358.9,251],[361.6,246.9],[376.1,242.3],[494.9,243.3],[591.9,229],[612.9,220.5],[629.4,208.7],[648.7,183.5],[655.8,162.7],[657.6,149.6],[656.3,129],[649.2,95.4],[640.3,79.8],[627.6,68.1],[611.2,59.9],[593.9,57.6],[567.3,58.7],[556.3,56.5],[535.4,43.2],[522.2,22.1],[518.3,-1.2],[536.6,-138],[533.9,-165],[524.9,-179.8],[515.8,-187.8],[341.9,-278],[334.8,-285.4],[329.8,-299.1],[329.7,-308.3],[342.9,-357.6],[346.7,-393],[346.6,-418.4],[344.9,-425.3],[338.1,-434.3],[328.1,-439.4],[311.5,-438.6],[229.7,-426.2],[221.8,-419.9],[194.6,-357.9],[181.8,-336.3],[173.2,-326],[149.9,-306.4],[137.6,-300.5],[110.6,-292.1],[92,-290.7],[78.7,-291.2],[60.4,-295.5],[40,-304.2],[21.8,-315.3],[-0.6,-337.3],[-13.6,-346.5],[-241.4,-432.9]] },
  }
  );
})();
