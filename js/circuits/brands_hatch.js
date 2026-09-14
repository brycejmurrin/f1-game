/* Apex 26 — BRANDS HATCH circuit definition (data only). Retired circuit (`classic: true`).
   British GP 1964-1986, alternating with Silverstone. Drops into Paddock Hill Bend off the start line.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 3908 m researched vs 3899 m projected (-0.23%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "brands_hatch",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // v0 sits mid the longest straight, placed by the stitcher. Not yet checked
    // against the real start/finish line — see docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    name: "BRANDS HATCH",
    gp: "British GP",
    country: "UK",
    night: false,
    theme: "green",
    lengthKm: 3.899,
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
    turns: [0.0143, 0.0762, 0.1903, 0.3782, 0.4612, 0.4748, 0.5323, 0.6362, 0.8323, 0.8448, 0.9137],
    furniture: { tree: "broad", fol: [0.20, 0.38, 0.18], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["steel", "concrete", "darkSteel"],
    path: { len: 3899, pts: [[-20.3,-374.5],[12.2,-337.1],[18.9,-327.8],[20.6,-319.6],[19.1,-270.8],[17.4,-257.6],[-16.4,-113.9],[-16.5,-100.9],[-14.3,-91.2],[-9.6,-81.6],[-1.9,-73.9],[4.9,-69.3],[21.9,-62.8],[364.3,60.4],[378.8,66.5],[395.4,80.6],[406.7,99.4],[413.2,114.3],[415.6,125.7],[416.7,145.7],[414.7,165],[413.1,175],[404.5,203.2],[384.7,243],[377.7,253],[364,269.9],[343.4,290.1],[291.7,325.7],[231.3,358.7],[143.1,401.7],[58.5,440.5],[30.8,451.6],[14,457],[-22.8,464.4],[-47.1,466.4],[-61,466.6],[-71.7,465.4],[-96.4,458.6],[-102.1,456.1],[-111.6,449.3],[-125.4,434.5],[-135.9,414.5],[-142.5,395],[-146.3,379.2],[-153.1,288.9],[-146.6,168.2],[-143.5,158.7],[-135.8,148.5],[-126,142.1],[-120.9,140.5],[-109.5,140],[-103.8,141.1],[-96.5,144.5],[-91.1,148.8],[-84.8,156.3],[-81.7,165.9],[-80.8,172.6],[-75,291.7],[-56.7,338.8],[-50.1,352.5],[-43.5,360.1],[-34.3,365.5],[-24.3,368],[-11,366.5],[100.4,336],[113.8,330.6],[153.5,310.9],[214.2,278.1],[239.5,262.4],[253.4,251.3],[263.8,238.6],[271.8,224.9],[276.2,213.4],[278.6,200.4],[274,173.3],[269.5,166.6],[254.4,153],[244.7,147.7],[232.8,143.6],[78,107.2],[39.3,96],[-285.6,-60.5],[-348.8,-91.8],[-363.9,-100.4],[-375,-108.4],[-389.8,-122.2],[-402.3,-138.1],[-409.8,-152],[-414.2,-166.7],[-416.4,-182.2],[-416.7,-196.6],[-415.3,-208.7],[-410.4,-227.6],[-337.6,-425.8],[-328.7,-442.7],[-321.5,-449],[-315.6,-452.6],[-306.8,-454.9],[-223.7,-466.2],[-204.9,-466.6],[-194.6,-465.2],[-97.6,-431.4],[-76.6,-422.3],[-61.8,-413.1],[-46.7,-401.7],[-32.8,-388.6]] },
  }
  );
})();
