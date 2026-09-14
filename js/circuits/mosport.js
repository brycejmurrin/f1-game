/* Apex 26 — MOSPORT circuit definition (data only). Retired circuit (`classic: true`).
   Canadian GP 1967, 1969, 1971-1974, 1976-1977 — eight World Championship races.
   Brabham, Ickx, Stewart twice, Revson, Fittipaldi, Hunt, Scheckter.

   THE ONLY VENUE LEFT THAT IS BOTH IMPORTABLE AND THE LAYOUT F1 ACTUALLY RACED.
   Of the ten remaining World Championship venues with usable OSM data, nine are
   modern rebuilds of a circuit Formula One would no longer recognise — Jarama is
   3.85 km where F1 ran 3.312, what OSM calls Aintree is the club circuit and not
   the 4.828 km Grand National perimeter. Mosport is the exception: its own
   infobox reads "Clockwise Grand Prix Circuit (1961-present)", and the 2001 work
   was a resurface and a widening to 13 m with the corner geometry deliberately
   preserved. So this trace needs none of the caveat brands_hatch and zolder carry.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. Nine ways, one clean cycle,
   no dangling ends. Stitched 3957 m researched vs 3948 m projected (-0.24%), the
   second-tightest delta of any OSM circuit here.

   With mont_tremblant and montreal already shipping, this completes the Canadian
   Grand Prix's entire venue history. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "mosport",
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    // Mosport is clockwise, and the stitch projected CCW, so this holds.
    reverse: false,
    // MEASURED TWICE, INDEPENDENTLY, AND THEY AGREE. The ring's own v0 puts the
    // 182 m starting grid on a 67 m radius — the same grid-in-a-corner defect the
    // other five OSM circuits shipped with. Searching the control points for the
    // section holding the largest radius across the whole grid zone lands on lap
    // fraction 0.671 (R = 2672 m). Projecting OSM's NAMED "Pit Lane" way onto the
    // ring — a completely separate method, from the research note — puts the real
    // start/finish at 0.664. Two unrelated measurements, 28 m apart, so this is
    // the real line and not merely a convenient straight.
    //
    // startFrac is an INDEX fraction into the control points, not an arc
    // fraction, and the points are not arc-uniform: 0.5943 is the control point
    // whose arc position is that 0.671.
    startFrac: 0.5943,
    name: "MOSPORT",
    gp: "Canadian GP",
    country: "Canada",
    night: false,
    theme: "green",
    lengthKm: 3.948,
    baseHW: 6.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    pal: {
      zenith:        [0.34, 0.46, 0.62],
      horizon:       [0.68, 0.72, 0.74],
      sun:           [0.96, 0.95, 0.90],
      sunColor:      [0.96, 0.93, 0.85],
      ambientSky:    [0.48, 0.53, 0.58],
      ambientGround: [0.24, 0.27, 0.22],
      fogColor:      [0.64, 0.68, 0.70],
      fogDensity:    0.0028,
      grass:         [0.20, 0.40, 0.19],
      sunDir:        [0.48, 0.54, 0.44],
    },

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // turns: the 10 strongest curvature peaks of THIS centreline in lap order,
    // 10 being the real turn count. Mosport is the one circuit here whose corners
    // OSM names individually, so these are checked against the real thing rather
    // than taken on trust — Clayton (T2), Quebec (T3), Moss (T5a/5b), the Esses
    // after T8 and Whites (T10) all land where the named ways say they do.
    // No researched sectors — consumers fall back to thirds.
    //
    // CHECKED AGAINST THE NAMED WAYS, not just taken from curvature. Projecting
    // OSM's own corner ways onto this ring puts Clayton at 0.185, Quebec at
    // 0.307, Moss at 0.491, the Esses at 0.873 and Whites at 0.937; the peaks
    // below land at 0.1817, 0.3117, 0.4817, 0.8817 and 0.9183. Five named
    // corners, five matches inside ~20 m, which is the geometry validating
    // itself rather than a curve-fit hoping to be right.
    turns: [0.0183, 0.0467, 0.1483, 0.1817, 0.2800, 0.3117, 0.4817, 0.8017, 0.8817, 0.9183],
    furniture: { tree: "broad", fol: [0.22, 0.40, 0.20], lamp: "none" },
    kit: { marshal: "cabin", rail: "armco", fence: "mesh", tyre: "stack", board: "panel", gantry: "box", camera: "lattice", hoarding: "panel" },
    standSet: ["steel", "concrete", "darkSteel"],
    path: { len: 3948, pts: [[-406.2,-235.4],[-219.6,-386],[-204.4,-401.8],[-189.8,-418.9],[-169.6,-452.4],[-159.2,-473.8],[-151.2,-491.6],[-144.6,-515.9],[-143,-537.2],[-145.5,-573.9],[-151.9,-616.3],[-157.6,-646.7],[-158.8,-663.1],[-153.1,-679],[-143,-695.4],[-130.4,-704.3],[-112,-708.7],[-84.8,-708.7],[-72.8,-702.4],[-65.2,-689.7],[-63.3,-672.6],[-62.6,-648.6],[-62.6,-629],[-60.7,-610],[-55.1,-589.7],[-45.6,-563.1],[-35.4,-539.1],[-21.5,-513.8],[-6.7,-496.8],[159.5,-296.7],[242.4,-177.3],[339.2,-21.5],[360.7,17.8],[377.1,54.5],[388.3,84.2],[460,330.3],[467,370.2],[468.1,395.8],[468.2,398.7],[465.1,421.5],[458.1,442.3],[442.9,469.1],[424,493.6],[406.9,508.1],[373.3,528.4],[348.7,535.4],[325.2,539.8],[303.1,539.8],[270.8,542.3],[254.4,549.3],[237.3,560],[224.6,573.9],[218.3,586],[210.1,613.8],[193.1,665.4],[184.6,685.7],[179.2,695],[172.7,701.8],[162,706.8],[147.4,708.7],[132,707.9],[103.1,699.2],[-67,650],[-153.8,621.4],[-168.4,615.4],[-189.8,604.9],[-203.1,592.9],[-209.9,585.1],[-221.1,568.6],[-231.4,549.4],[-236.4,529.8],[-239.9,510.6],[-240.3,495.2],[-238.3,479.5],[-234.1,460.3],[-223.7,438.4],[-203.4,399.9],[-158.4,328.7],[-108.4,240.8],[-84.9,196.9],[-77.8,179.8],[-72.6,155.1],[-72.1,132.3],[-75.3,115.2],[-82.9,92.4],[-93,67.7],[-108.2,42.4],[-124.7,22.2],[-142.4,8.1],[-163.3,-3.1],[-189.8,-10.7],[-224.3,-16.5],[-372.1,-25.3],[-389.8,-26.5],[-406.6,-31.8],[-425.2,-40.5],[-439.8,-51.2],[-451.7,-67.8],[-458.8,-79.7],[-466.3,-99.2],[-468.2,-112],[-464.7,-138.9],[-459.4,-160.5],[-446.7,-186],[-430.3,-211.9],[-417.3,-226.4]] },  // mosport
  }
  );
})();
