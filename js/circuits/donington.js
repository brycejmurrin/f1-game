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
    // MEASURED START LINE (2026-11-11): driver61 Donington circuit guide
    // (https://driver61.com/circuit-guide/donington/) gives Start/Finish
    // 52°49'47.3"N 1°22'46.4"W, on the straight between Goddards and Redgate
    // (pit wall on the driver's left approaching Redgate). Projected with
    // import-circuit-path.mjs project() it lands 3.8 m off the 491 m segment
    // pts[24]->pts[25] at t = 0.402 (~197 m past pts[24]); no node sat on it.
    // pts[25] = [319.8, -82.2] is HAND-ADDED, collinear on that segment
    // (0.006 m off the chord, so the centreline moves < 1 m; jerez.js
    // precedent) — every OSM point from the old pts[25] on is index + 1.
    // The previous 0.9072 put the line on the straight before the Esses.
    //
    // startFrac is an INDEX fraction into the control points, NOT an arc
    // fraction (racing node 0 = pts[round(startFrac * pts.length)]):
    // 25 / 98 = 0.2551 -> the hand-added point.
    //
    // sceneryStartFrac keeps the dressing on the v0 origin it was authored
    // against, so props, landmarks and corner boards stay on their real corners
    // while only the line and grid move.
    startFrac: 0.2551,
    sceneryStartFrac: 0.0000,
    name: "DONINGTON",
    gp: "European GP",
    country: "UK",
    night: false,
    theme: "green",
    lengthKm: 3.998,
    tyreSeverity: 1,  // UK permanent; calendar-neutral proxy
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
      runoff:        [0.24, 0.34, 0.19],
      sunDir:        [0.50, 0.52, 0.42],
    },

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the 11 strongest curvature peaks of THIS centreline in lap order,
    // 11 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    sectors: [0.333, 0.645],  // ~1/3 and ~2/3, each snapped to the nearest straight (2026-10-04) — not FIA-published splits
    turns: [0.0853, 0.0939, 0.2149, 0.2759, 0.3310, 0.4400, 0.5189, 0.5484, 0.7034, 0.8260, 0.9295],
    furniture: { tree: "broad", fol: [0.20, 0.38, 0.18], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["steel", "concrete", "darkSteel"],
    path: { len: 3998, pts: [[244,-236.4],[274.5,-237.5],[336.4,-244.2],[456.7,-259.7],[465.4,-259.2],[471.8,-255.9],[477.2,-249.4],[478.7,-245.5],[479.5,-235.7],[478.4,-224.9],[473.8,-220],[457.7,-212.2],[323.8,-193.4],[234.4,-181.7],[192.9,-178.9],[130.9,-179.9],[117.1,-178.5],[106.9,-173.7],[100.8,-165.9],[98.6,-155.8],[100,-145.3],[104.6,-134.8],[109.9,-127.5],[119.2,-120.4],[125.6,-118.3],[319.8,-82.2],[608.6,-28.5],[640.3,-19.2],[655.5,-12.3],[665.7,-4.5],[671.3,2],[677.9,16],[679.6,23.5],[680.3,29.9],[678.6,39.8],[671.5,54.7],[604.4,141.7],[581.5,166.8],[571.1,175.2],[549.6,188],[528.1,199.2],[510.4,206.2],[463.8,216.5],[406.7,218],[376.2,213.8],[300.1,192.3],[284.4,189.5],[268.9,190.8],[250.4,194],[228.6,200.1],[208.1,208.4],[145,238.8],[70.9,259.7],[54.6,259.1],[42.7,255],[32,246.7],[-59.2,156.8],[-97,117.4],[-106.5,109.5],[-136.5,98.2],[-172,88.2],[-200,83.2],[-224.3,80.5],[-304.6,75],[-340.3,76],[-357.1,79.1],[-372.5,84.5],[-429.5,117.9],[-443.2,124.6],[-465.5,132.4],[-485,137],[-493.9,137.8],[-512.1,135.3],[-523.3,130.8],[-534.7,120.2],[-546.3,102.5],[-599.8,5.1],[-671.8,-117.4],[-676.5,-126.3],[-680.3,-142.4],[-679,-155.2],[-676,-163.3],[-658.9,-193.4],[-646.5,-207.2],[-625.8,-221.3],[-611.1,-229.9],[-598.2,-234.6],[-570.9,-239.3],[-542.5,-239.3],[-77.2,-196.8],[-6.9,-190.9],[0.7,-193.3],[10.4,-198.1],[14.6,-205.6],[19.3,-218.4],[26.8,-227.2],[35.4,-232.1],[45.7,-234.7]] },
  }
  );
})();
