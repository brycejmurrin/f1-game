/* Apex 26 — AUTÓDROMO INTERNACIONAL DO ALGARVE (PORTIMÃO) definition (data only).
   Retired circuit (`classic: true`): hosted the Portuguese GP in 2020 and 2021.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "portimao",
    classic: true,
    // Upstream pt-2008 already runs clockwise, matching the racing direction.
    reverse: false,
    // The pit straight opens the trace, and its first vertex is the line.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches the real T1.
    // Was 0.96, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.96,
    name: "PORTIMAO",
    gp: "Portuguese GP",
    country: "Portugal",
    night: false,
    theme: "green",
    lengthKm: 4.7,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 125,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },
      { kind: "foliage", s0: 0.30, s1: 0.42 },
    ],
    // Algarve light: dry, bright, faintly dusty, with red-earth soil.
    pal: {
      zenith:        [0.22, 0.44, 0.78],
      horizon:       [0.82, 0.78, 0.68],
      sun:           [1.0,  0.96, 0.80],
      sunColor:      [1.0,  0.95, 0.78],
      ambientSky:    [0.52, 0.54, 0.58],
      ambientGround: [0.34, 0.27, 0.20],
      fogColor:      [0.78, 0.74, 0.64],
      grass:         [0.30, 0.40, 0.20],
      runoff:        [0.66, 0.44, 0.30],   // Algarve red earth
      sunDir:        [0.38, 0.72, 0.28],
    },
    elevations: [
      { s: 0.045, halfM: 260, rise: -14.0 },  // the drop into Turn 1
      { s: 0.20, halfM: 300, rise: 11.0 },    // climb to the Turn 3 crest
      { s: 0.36, halfM: 340, rise: -13.0 },   // plunge through the middle sector
      { s: 0.56, halfM: 300, rise: 10.0 },    // back up the hill
      { s: 0.78, halfM: 320, rise: -9.0 },    // drop toward the final complex
      { s: 0.93, halfM: 300, rise: 12.0 },    // climb back to the pit straight
    ],
    hwZones: [
      { s0: 0.140, s1: 0.185, hw: 6.3, ease: 0.012 },
      { s0: 0.470, s1: 0.515, hw: 6.2, ease: 0.012 },
      { s0: 0.820, s1: 0.870, hw: 6.4, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.050, angleDeg: 4.0, widthM: 110 },
      { frac: 0.300, angleDeg: 3.5, widthM: 120 },
      { frac: 0.640, angleDeg: 4.5, widthM: 130 },
      { frac: 0.900, angleDeg: 3.5, widthM: 110 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.0757, 0.1112, 0.1457, 0.1777, 0.3012, 0.4037, 0.4372, 0.5657, 0.5822, 0.6742, 0.6802, 0.7217, 0.7337, 0.7482, 0.8497],
    furniture: { tree: "stonePine",   fol: [0.14, 0.31, 0.16], lamp: "none",  sparse: true },  // thin Algarve pine; the elevation is the view
    kit: { marshal: "cabin",     rail: "wArmco",      fence: "leaning",   tyre: "stack",   board: "trivision", gantry: "box",        camera: "scaffold",  hoarding: "panel" },
    standSet: ["terracotta", "concrete", "alu"],  // Algarve pantile over hillside terracing
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    // Autódromo Internacional do Algarve — Portimão. Upstream pt-2008, stated 4653 m, projected 4657 m, trace winding CCW.
    path: { len: 4657, pts: [[230.2,93],[319.3,398.6],[339.3,471.4],[340,480.6],[335.3,489],[326,498.4],[314.2,505.8],[257.9,547.8],[218.5,575.4],[205.1,579.3],[194.6,578.6],[67.7,547.7],[60.8,541.3],[58,534.3],[57.2,527.8],[59.3,519.8],[66.8,512.1],[139.2,469.4],[150.1,460.3],[159.3,447.1],[162.2,439],[165.7,425.7],[164.3,404.3],[25.7,-80.4],[18.5,-102.1],[9.5,-109.8],[-0.4,-110],[-9.9,-104.6],[-15.6,-95.4],[-17.1,-76.7],[-32.2,65.6],[-34.2,94],[-30.5,126.8],[-23.8,149.6],[-14.6,170.2],[55.7,303.8],[59.3,318.6],[57.6,334.7],[52.6,348.9],[40.3,365.8],[-13.6,429.9],[-21.6,433.1],[-30.7,434.6],[-44.3,431.9],[-55.3,424.3],[-60.7,415],[-103.3,121.9],[-105.9,108.8],[-112.7,92.4],[-119.3,79.5],[-134.4,63],[-155.8,48.1],[-299.1,-25.6],[-311.2,-37.1],[-325.1,-57],[-338,-90.6],[-340,-104.4],[-337.7,-115.5],[-332.9,-123.1],[-324,-131.2],[-170.5,-178.1],[-160.6,-183.5],[-146.4,-195.1],[-131.3,-211.8],[-120.2,-232.4],[-114.9,-256.1],[-96.4,-378.9],[-97.9,-390.4],[-104.1,-399],[-114.1,-408.8],[-128.9,-410.7],[-140.9,-408.2],[-146.3,-404],[-241.7,-288.5],[-255.4,-281.5],[-270.1,-278.4],[-288.7,-282.9],[-303.9,-296.4],[-314.9,-311.7],[-319.3,-322.6],[-323.9,-345],[-323.4,-357.8],[-320.6,-372.6],[-313.7,-387.4],[-294.5,-413.9],[-198.2,-529.9],[-177.4,-547.5],[-158.8,-559.8],[-144,-567],[-121,-575.1],[-99.3,-579.2],[-71.9,-579.3],[-50.4,-576],[-28.8,-570.2],[-7.4,-560.2],[13.9,-547.8],[31.5,-530.9],[46.1,-514],[61.7,-491],[227.3,83]] },
  }
  );
})();
