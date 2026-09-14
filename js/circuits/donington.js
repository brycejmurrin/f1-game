/* Apex 26 — DONINGTON circuit definition (data only). Retired circuit (`classic: true`).
   European GP 1993 — Senna's opening lap in the wet, from fifth to first before the end of it.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 4020 m researched vs 3998 m projected (-0.55%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "donington",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // MEASURED, not assumed. The stitcher was supposed to leave v0 mid-straight
    // and did not: the 182 m of starting grid behind v0 ran through a corner of
    // 28 m radius, so the grid was laid round a bend. This moves the line to the
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
    startFrac: 0.9072,
    sceneryStartFrac: 0.0000,
    name: "DONINGTON",
    gp: "European GP",
    country: "UK",
    night: false,
    theme: "green",
    lengthKm: 3.998,
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
    turns: [0.0410, 0.1636, 0.2671, 0.4185, 0.4315, 0.5525, 0.6135, 0.6686, 0.7776, 0.8565, 0.8860],
    furniture: { tree: "broad", fol: [0.20, 0.38, 0.18], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["steel", "concrete", "darkSteel"],
    path: { len: 3998, pts: [[244,-236.4],[274.5,-237.5],[336.4,-244.2],[456.7,-259.7],[465.4,-259.2],[471.8,-255.9],[477.2,-249.4],[478.7,-245.5],[479.5,-235.7],[477.3,-223.2],[474.4,-219.7],[466,-215.7],[323.8,-193.4],[234.4,-181.7],[192.9,-178.9],[130.9,-179.9],[117.1,-178.5],[106.9,-173.7],[100.8,-165.9],[98.6,-155.8],[100,-145.3],[104.6,-134.8],[109.6,-128.1],[119.2,-120.4],[125.6,-118.3],[608.6,-28.5],[640.3,-19.2],[655.5,-12.3],[665.7,-4.5],[671.3,2],[677.9,16],[679.6,23.5],[680.3,29.9],[678.6,39.8],[671.5,54.7],[604.4,141.7],[581.5,166.8],[571.1,175.2],[549.6,188],[528.1,199.2],[510.4,206.2],[463.8,216.5],[406.7,218],[376.2,213.8],[300.1,192.3],[284.4,189.5],[268.9,190.8],[250.4,194],[228.6,200.1],[208.1,208.4],[145,238.8],[70.9,259.7],[54.6,259.1],[42.7,255],[32,246.7],[-59.2,156.8],[-97,117.4],[-106.5,109.5],[-136.5,98.2],[-172,88.2],[-200,83.2],[-224.3,80.5],[-304.6,75],[-340.3,76],[-357.1,79.1],[-372.5,84.5],[-429.5,117.9],[-443.2,124.6],[-465.5,132.4],[-485,137],[-493.9,137.8],[-512.1,135.3],[-523.3,130.8],[-534.7,120.2],[-546.3,102.5],[-599.8,5.1],[-671.8,-117.4],[-676.5,-126.3],[-680.3,-142.4],[-679,-155.2],[-676,-163.3],[-658.9,-193.4],[-646.5,-207.2],[-625.8,-221.3],[-611.1,-229.9],[-598.2,-234.6],[-570.9,-239.3],[-542.5,-239.3],[-77.2,-196.8],[-6.2,-190.9],[2.1,-192.8],[10.4,-198.1],[14.6,-205.6],[19.3,-218.4],[27.4,-227.5],[35.4,-232.1],[45.7,-234.7]] },
  }
  );
})();
