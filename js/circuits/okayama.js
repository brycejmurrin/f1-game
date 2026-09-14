/* Apex 26 — OKAYAMA circuit definition (data only). Retired circuit (`classic: true`).
   Pacific GP 1994-1995, when it was TI Circuit Aida. Tight, hilly, and short — the narrowest lap here.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 3703 m researched vs 3704 m projected (0.03%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "okayama",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // v0 sits mid the longest straight, placed by the stitcher. Not yet checked
    // against the real start/finish line — see docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    name: "OKAYAMA",
    gp: "Pacific GP",
    country: "Japan",
    night: false,
    theme: "green",
    lengthKm: 3.704,
    baseHW: 7,
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
    // turns: the 11 strongest curvature peaks of THIS centreline in lap order,
    // 11 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    turns: [0.1172, 0.1658, 0.2107, 0.2928, 0.3048, 0.3372, 0.3992, 0.4552, 0.6322, 0.6937, 0.8678],
    furniture: { tree: "pine", fol: [0.18, 0.34, 0.20], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["concrete", "steel", "darkSteel"],
    path: { len: 3704, pts: [[-171.1,186.8],[-114.1,7.7],[-106.7,-17.3],[-53.3,-221.9],[-51.4,-227.4],[-47.8,-233.8],[-42.6,-238.8],[-37,-241.7],[-27.9,-242],[-20.5,-240.2],[-13.6,-237.1],[-7.6,-230.3],[-4.5,-221.9],[-4.8,-212.3],[-8.7,-191],[-20.7,-127.5],[-23.1,-108],[-22.1,-98.4],[-16.5,-90.7],[-8.9,-86.1],[-0.2,-83.3],[32.9,-77.4],[64.7,-70.4],[99,-66.3],[107.4,-67.4],[114.4,-69.4],[122,-73.1],[127.5,-77.2],[133.6,-82.9],[137.9,-89.6],[140,-96.5],[140.9,-103.3],[134.1,-360.5],[132.8,-372.8],[130.1,-382.7],[126.4,-389.3],[121.4,-393.8],[109.7,-399.8],[98.1,-401.2],[86.6,-398.1],[78.7,-391.7],[73.3,-382.9],[53.3,-336.9],[47,-322.1],[40.3,-314.5],[30.3,-309],[23.4,-307.7],[14.2,-307.9],[4.2,-312.8],[-2.4,-319.4],[-7,-328.6],[-8.6,-337.8],[-4.3,-376.9],[3.1,-441.3],[10.7,-503.4],[13.2,-511.6],[18.6,-520.3],[25.2,-528.1],[34.4,-534.9],[48.5,-541.4],[143.7,-574.3],[161,-577.8],[174.8,-577.1],[184.6,-573.9],[191.4,-569.4],[201.3,-560.3],[206.4,-552.3],[209,-545.6],[210.1,-537.4],[221.5,-415],[249.6,-34.8],[251.8,27.6],[254.3,52.4],[252.2,65.1],[248.5,74.8],[243,83.3],[239,88.3],[230.5,95.5],[216.8,100.5],[208.8,102.2],[192.8,100.9],[175.3,97.9],[152.3,89.2],[73.2,32.6],[48.9,17.4],[39.4,11.3],[27.1,9.5],[7.9,9.6],[-8.3,13.5],[-25.8,20.7],[-37.7,30.1],[-52.7,48.3],[-75.1,103.9],[-103.9,170.3],[-113.4,195.1],[-117.4,211.7],[-118.9,226.5],[-118.9,238.8],[-116.4,251],[-105.8,285.3],[-102.5,299],[-100.9,311.4],[-100.4,324.3],[-102.5,336.8],[-105.9,347.5],[-112.3,362.9],[-123.6,389.8],[-129.5,407.1],[-135.2,435.1],[-139.6,467.5],[-142.6,505.2],[-144.6,538.1],[-146.2,551.1],[-151.3,563.2],[-160.3,571.1],[-174.9,576.7],[-189.7,577.8],[-204.2,576.6],[-219.4,570.5],[-233.2,561.8],[-243.1,551.5],[-249.8,538.7],[-252.6,524.8],[-254.2,507.4],[-254.3,474.1],[-252.7,455],[-248.5,435.5],[-208.4,308]] },
  }
  );
})();
