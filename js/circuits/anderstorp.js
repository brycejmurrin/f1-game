/* Apex 26 — ANDERSTORP circuit definition (data only). Retired circuit (`classic: true`).
   Swedish GP 1973-1978. Built around an airfield — the back straight is the runway.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 4031 m researched vs 4017 m projected (-0.35%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "anderstorp",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // v0 sits mid the longest straight, placed by the stitcher. Not yet checked
    // against the real start/finish line — see docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    name: "ANDERSTORP",
    gp: "Swedish GP",
    country: "Sweden",
    night: false,
    theme: "green",
    lengthKm: 4.017,
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
    // turns: the 8 strongest curvature peaks of THIS centreline in lap order,
    // 8 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    turns: [0.0423, 0.1807, 0.1988, 0.3277, 0.4798, 0.5543, 0.8588, 0.9187],
    furniture: { tree: "fir", fol: [0.14, 0.30, 0.18], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["concrete", "steel", "alu"],
    path: { len: 4017, pts: [[-233.5,56.3],[-166.5,-46.1],[-155.2,-58.6],[-144.5,-65.5],[-131.6,-70.4],[-108.2,-71.5],[-83.5,-65],[-65.5,-50.7],[-52.4,-30.4],[-49.4,-2.5],[-54.4,19.6],[-69.4,40],[-236.2,242.7],[-248,260.1],[-255.6,286.6],[-253.3,307.4],[-240.9,331.5],[-229.1,342.6],[-217.2,348.9],[-194.2,354.1],[-173.2,352],[-160.5,346.7],[-149,338.7],[-131.8,317.5],[30.4,62],[95.1,-42.3],[101.9,-58.3],[102.7,-75.9],[99,-90.2],[94.6,-98.3],[83.3,-109.8],[70.1,-117.5],[42.2,-128.1],[-49.4,-158.4],[-73.5,-174.5],[-89,-192.5],[-100.6,-218],[-104.1,-245.9],[-98.5,-274.1],[-91,-290.4],[-83,-301.8],[-71.7,-313.1],[-58.8,-322.1],[-36.2,-331.6],[-2.9,-335.2],[20,-330],[43.3,-318.2],[58.3,-303.8],[71.5,-285.2],[98.2,-237.5],[105.8,-229.1],[118,-222.8],[136.1,-224.9],[143.7,-229.1],[150,-235.9],[282.9,-447.1],[294.8,-462.3],[317.6,-474.7],[337.8,-477.4],[361,-472.7],[380.6,-461],[391.6,-445.9],[398.2,-429.5],[400.7,-410.3],[397.8,-392.5],[331.5,-247],[296,-176.6],[248.9,-91.8],[84.5,168],[43.5,220],[-15.8,292.9],[-87.4,370.6],[-188.6,472.6],[-199.1,477.4],[-206,476.6],[-249.6,453.7],[-382.2,368.6],[-393.3,358.3],[-399.4,348.8],[-400.7,335.5],[-398.3,322.8],[-394.6,313.6],[-339.1,223.6]] },
  }
  );
})();
