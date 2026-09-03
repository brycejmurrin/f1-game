/* Apex 26 — INTERCITY ISTANBUL PARK circuit definition (data only).
   Retired circuit (`classic: true`): last Turkish GP 2021.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "istanbul",
    classic: true,
    reverse: false,
    // The trace's first vertex is the start line, on the pit straight ahead of
    // the Turn 1 plunge.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured LEFT, matches the real T1.
    // Was 0.98, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.98,
    name: "ISTANBUL",
    gp: "Turkish GP",
    country: "Turkey",
    night: false,
    theme: "green",
    lengthKm: 5.3,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },  // pits
      { kind: "foliage", s0: 0.34, s1: 0.46 },              // the Turn 8 amphitheatre
    ],
    // Dry Thracian hillside: hazy warm sun, parched grass, pale limestone dust.
    pal: {
      zenith:        [0.24, 0.44, 0.74],
      horizon:       [0.80, 0.78, 0.70],
      sun:           [1.0,  0.95, 0.78],
      sunColor:      [1.0,  0.94, 0.76],
      ambientSky:    [0.50, 0.53, 0.58],
      ambientGround: [0.30, 0.28, 0.21],
      fogColor:      [0.76, 0.74, 0.66],
      grass:         [0.31, 0.39, 0.20],
      runoff:        [0.64, 0.58, 0.44],
      sunDir:        [0.46, 0.66, 0.30],
    },
    elevations: [
      { s: 0.055, halfM: 300, rise: -12.0 },  // the Turn 1 downhill plunge
      { s: 0.28, halfM: 380, rise: -7.0 },    // valley floor before Turn 8
      { s: 0.48, halfM: 340, rise: 8.0 },     // climb out of Turn 8
      { s: 0.72, halfM: 400, rise: 9.0 },     // long rise back toward the pits
    ],
    hwZones: [
      { s0: 0.135, s1: 0.180, hw: 6.4, ease: 0.012 },  // Turn 3-4 complex
      { s0: 0.590, s1: 0.640, hw: 6.4, ease: 0.012 },  // Turn 9-10
      { s0: 0.880, s1: 0.930, hw: 6.3, ease: 0.012 },  // Turn 13-14
    ],
    // Turn 8 is the famous one: a long, banked, quadruple-apex left taken flat.
    bankZones: [
      { frac: 0.050, angleDeg: 4.0, widthM: 130 },   // Turn 1
      { frac: 0.400, angleDeg: 7.0, widthM: 300 },   // Turn 8 — the big one
      { frac: 0.760, angleDeg: 3.5, widthM: 130 },   // Turn 12
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.0569, 0.2229, 0.2504, 0.2684, 0.3594, 0.3659, 0.4384, 0.4764, 0.6234, 0.6364, 0.8819, 0.8884, 0.9014, 0.9224],
    furniture: { tree: "stonePine",   fol: [0.13, 0.30, 0.16], lamp: "post",  lc: [1.0, 0.90, 0.66], sparse: true },  // sparse Thracian hillside pine
    kit: { marshal: "kiosk",     rail: "armco",       fence: "panelled",  tyre: "stack",   board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "panel" },
    standSet: ["sandstone", "crimson", "darkSteel"],  // pale Thracian stone, Turkish red, modern steel
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    // Intercity Istanbul Park — Istanbul. Upstream tr-2005, stated 5338 m, projected 5313 m, trace winding CW.
    path: { len: 5313, pts: [[216,-561.4],[-10,-511.3],[-27.7,-503.2],[-36,-487.2],[-33.7,-474.1],[-19.1,-413.5],[-10.4,-381.7],[-10.4,-357.9],[-16.4,-324],[-36.9,-287.6],[-70.6,-255.2],[-138.7,-214.9],[-178.1,-198.5],[-227.1,-182.2],[-316.8,-165.1],[-374.1,-162.5],[-406.1,-162.1],[-451.7,-168.7],[-471.5,-165.9],[-493.1,-156.2],[-513.6,-135.8],[-524,-111.7],[-528.5,-88.2],[-518.8,-13.9],[-521.2,1.2],[-531.6,10.9],[-547.6,10.9],[-596,5],[-638.8,5],[-661.7,10.9],[-671.8,22.7],[-674.1,36.8],[-662.2,102.2],[-654.6,116.8],[-639.6,128.3],[-271.7,315.4],[-248.4,333.1],[-240.1,349.8],[-240.8,366.2],[-245.3,380.3],[-255.7,391.5],[-286.7,410.3],[-313.2,416.5],[-335.7,417.9],[-448,397.4],[-540.9,375.5],[-587.8,362],[-610.8,357.1],[-625.4,360.8],[-698.7,401.3],[-707.8,413.7],[-731.2,484.6],[-730.9,502.3],[-724.2,518.4],[-696.1,566.2],[-671.1,595.1],[-632.9,632.1],[-615.1,640.1],[-588.6,642.3],[-552.5,637.7],[-86.4,499.1],[-59.3,484.2],[-49.9,471.9],[-51.3,455.7],[-68.3,428.2],[-79.8,404.9],[-79.8,378.8],[68.7,-81.7],[87.1,-105.3],[116.1,-132.3],[717.6,-458.5],[728.8,-470.3],[731.2,-486.3],[728.5,-501.2],[715.9,-516.9],[702.7,-521.8],[662.7,-518.6],[651.6,-523.5],[646,-531.8],[647.4,-550.6],[658.8,-620],[657.2,-633.2],[647.7,-642.3],[634.2,-642.3]] },
  }
  );
})();
