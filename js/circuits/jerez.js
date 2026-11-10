/* Apex 26 — JEREZ circuit definition (data only). Retired circuit (`classic: true`).
   Spanish GP 1986-1990 and European GP 1994, 1997. Dry Andalusian scrub; Senna beat Mansell here by 0.014 s in 1986.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 4428 m researched vs 4426 m projected (-0.05%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "jerez",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // The line sits on the real start/finish straight: the 600 m run from the
    // final LEFT hairpin (Curva Lorenzo) to Turn 1, Curva Expo '92, a RIGHT
    // (startline-probe: first apex R at 364 m, 24-slot grid max |k| 0.0002).
    // v0 is NOT that straight: it is the 210 m run between the built Peluqui
    // and the next right, and 0.1220 (shipped until #5078) put the line 80 m
    // before the final hairpin. The OSM trace carried that straight as ONE
    // 599 m segment (pts 17 -> 18), so no index landed mid-straight; path.pts
    // [18] = [-28.4, 86.1] is a hand-added collinear point 230 m along it, and
    // the line is that index (18 / 83). It moved the built centreline by
    // <= 0.86 m and the lap by -0.6 m; re-running the stitch drops it.
    //
    // startFrac is an INDEX fraction into the control points, NOT an arc
    // fraction: the points are not arc-uniform (converting the arc target
    // straight to a fraction lands on a 31 m radius), so the value is the
    // control-point index whose cumulative arc length reaches the target.
    //
    // sceneryStartFrac keeps the dressing on the v0 origin it was authored
    // against, so props, landmarks and corner boards stay on their real corners
    // while only the line and grid move.
    startFrac: 0.2169,
    sceneryStartFrac: 0.0000,
    name: "JEREZ",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "desert",
    lengthKm: 4.426,
    tyreSeverity: 0.82,  // Smooth test-track asphalt; low permanent band
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    // The main stand is authored in scenery/jerez.js (block 2, 0.005 -1 20 terracing). Without
    // this the generic 7-box shells also stand at nodes 0-24, where the line curves and they overlap.
    ownPitStraight: true,
    // The pit building is authored too (scenery block 3: garage row, Tío Pepe tower, El Ovni), so the
    // generic bay row stays off, as it was while the line sat in the short window before #5078. On
    // this straight the returning Michelin leg runs 60 m away and 4.5 m higher: its terrain ribbon
    // stands 0.1-2.8 m above the lane floor across the bays' 14-27 m footprint, and the bays' keep-out
    // (to 30 m) leaves El Ovni and the tower no seat short of that leg.
    pit: { side: 1, bays: false },
    terrainOuter: 110,
    pal: {
      zenith:        [0.34, 0.46, 0.64],
      horizon:       [0.76, 0.70, 0.58],
      sun:           [1.00, 0.94, 0.78],
      sunColor:      [0.98, 0.90, 0.72],
      ambientSky:    [0.50, 0.50, 0.50],
      ambientGround: [0.34, 0.30, 0.22],
      fogColor:      [0.74, 0.70, 0.60],
      fogDensity:    0.0026,
      grass:         [0.42, 0.40, 0.24],
      sunDir:        [0.52, 0.60, 0.38],
    },

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the 13 strongest curvature peaks of THIS centreline in lap order,
    // 13 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    sectors: [0.370, 0.675],  // ~1/3 and ~2/3, each snapped to the nearest straight (re-snapped 2026-11-10 with the line, #5078) — not FIA-published splits
    turns: [0.0872, 0.1385, 0.1667, 0.3060, 0.3398, 0.4955, 0.6146, 0.6249, 0.7004, 0.7342, 0.8488, 0.9272, 0.9395],
    // tree:"none" — the generic roadside scatter plants at 8–22 m (camera
    // corridor). Olive / pine scrub is hand-seated past the orbit wedge in
    // scenery/jerez.js (Circuit Yard r4 camera-clip fix).
    furniture: { tree: "none", fol: [0.30, 0.38, 0.20], lamp: "none", sparse: true },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["sandstone", "concrete", "steel"],
    path: { len: 4426, pts: [[372.5,35.5],[360.9,55.8],[343.2,74],[320.2,86.8],[302.9,91.8],[287.2,93.5],[267.4,92.3],[153.3,82.1],[137.3,78.3],[121.7,68],[-66.1,-162.4],[-75,-168.1],[-85.6,-170.3],[-100.3,-167.7],[-110.4,-161.4],[-117.5,-148.2],[-118.7,-132.7],[-116.9,-126.2],[-28.4,86.1],[113.7,426.7],[116.6,440.4],[115,453.5],[109.7,464.9],[101.6,473.5],[89.9,479.2],[-92.2,481.6],[-105.8,478.7],[-115.9,471.1],[-122.1,456.4],[-121.3,442.6],[-109.7,427],[-67.4,395.7],[-57.6,385],[-47.1,368.2],[-40.2,341.9],[-47.7,207.8],[-56,179.2],[-68.1,157.3],[-88.2,135.6],[-96.5,129.7],[-115.3,119.1],[-136.2,112.2],[-401.9,74.6],[-427.9,67.2],[-449.8,53],[-464.4,36],[-476.4,6.8],[-477.9,-22],[-475.8,-40.8],[-471.3,-56.2],[-461.7,-74.5],[-446.4,-93],[11.6,-462.9],[29.1,-476.2],[44.1,-481.6],[59.8,-478.5],[66.9,-474.1],[75.1,-461.7],[75.1,-444.6],[-8.7,-276.6],[-16.6,-247.6],[-15.5,-217.5],[-9.7,-199.2],[4.6,-174.3],[114.3,-34.4],[131.1,-19.2],[154.1,-9.1],[177.7,-5.7],[189.5,-6.6],[220.1,-16.7],[249.7,-38.3],[265.8,-58.6],[277.5,-82.2],[338.1,-251.5],[344,-260.5],[359.4,-270.6],[380.7,-272.2],[395.9,-266.8],[468.3,-212.8],[473.6,-206],[477.7,-194.2],[477.9,-184.4],[473,-169.2]] },
  }
  );
})();
