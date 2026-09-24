/* Apex 26 — MONT-TREMBLANT circuit definition (data only). Retired circuit (`classic: true`).
   Canadian GP 1968 and 1970. Laurentian forest, hard elevation change, and no run-off worth the name.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 4265 m researched vs 4243 m projected (-0.52%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mont_tremblant",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // MEASURED, not assumed. The stitcher was supposed to leave v0 mid-straight
    // and did not: the 182 m of starting grid behind v0 ran through a corner of
    // 104 m radius, so the grid was laid round a bend. This moves the line to the
    // nearest section holding R >= 1500 m across the whole grid zone.
    //
    // startFrac is an INDEX fraction into the control points, NOT an arc
    // fraction, and the points are not arc-uniform — the first attempt at this
    // fix converted the arc target straight to a fraction and landed Donington
    // back on a 31 m radius. The value below is the control-point index whose
    // cumulative arc length reaches the target.
    //
    // sceneryStartFrac records that every prop, landmark and corner board was
    // authored against the OLD origin, so the dressed world stays on its real
    // corners while only the line and grid move.
    startFrac: 0.6465,
    sceneryStartFrac: 0.0000,
    name: "MONT-TREMBLANT",
    gp: "Canadian GP",
    country: "Canada",
    night: false,
    theme: "green",
    lengthKm: 4.243,
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
    // turns: the 15 strongest curvature peaks of THIS centreline in lap order,
    // 15 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    turns: [0.0592, 0.1191, 0.1502, 0.1626, 0.1806, 0.4641, 0.4812, 0.4981, 0.6952, 0.7391, 0.7862, 0.8251, 0.8986, 0.9092, 0.9411],
    furniture: { tree: "fir", fol: [0.14, 0.30, 0.17], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["concrete", "steel", "darkSteel"],
    path: { len: 4243, pts: [[-108.6,7],[-220.7,-137.3],[-234.3,-157.6],[-244.3,-180.4],[-248.7,-197.4],[-250.4,-217.6],[-248.9,-235.1],[-242.4,-258.8],[-234.5,-275.3],[-176.5,-350.3],[-152.4,-389.3],[-135.9,-422.5],[-118.8,-470.9],[-57.1,-672.1],[-49.2,-683.2],[-35.1,-693.7],[-19.1,-698.4],[-1.6,-697.9],[21.5,-689.4],[31.4,-683.6],[42.8,-673.3],[52.5,-661.3],[60.8,-645.4],[68.4,-615],[65.6,-582.8],[31.1,-348],[27.4,-285.5],[36.9,-164.5],[70.6,173],[68.7,187.9],[63.7,203.1],[56.1,216.4],[40.8,233.9],[24.1,246],[-73.8,294.1],[-83.2,302.3],[-90.6,314.5],[-96,334],[-95.7,384.9],[-77.8,477.7],[-71.6,487.8],[-58.6,496.7],[-44.5,500.1],[-32.5,499.6],[-8.5,490.2],[51,451.1],[80.1,440.3],[96.3,437.2],[117.4,436.7],[187.3,442.2],[220.2,451],[274.6,473.5],[297.5,485.3],[358.3,522.9],[366.2,530.3],[368.2,536],[367.1,544.7],[360.9,553.1],[342.9,564.3],[326.4,568.5],[312.4,569.3],[211.2,538.2],[198.1,537],[185.4,538.8],[-60.2,680.2],[-81.4,689.6],[-107,696.2],[-133,698.4],[-173.4,697.6],[-211.5,690.2],[-224.9,683.5],[-229.6,663.9],[-237.9,653.6],[-245.8,650.5],[-269.2,648.9],[-283.9,641.8],[-299.4,620.2],[-327.2,571.5],[-363.3,484.5],[-367.3,466.8],[-368.2,444.8],[-362.2,416.7],[-339.6,348.7],[-329,334.9],[-315.2,326.8],[-289.2,321.2],[-276.2,321.5],[-264.7,326.2],[-222.7,354.6],[-207.5,355.6],[-194.3,349.7],[-90.1,199.9],[-79.8,179.2],[-72.5,158],[-67.6,116.6],[-69.9,90.2],[-75,68.8],[-83.2,46.9],[-95.4,25.6]] },
  }
  );
})();
