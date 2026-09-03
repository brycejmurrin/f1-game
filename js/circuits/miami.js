/* Apex 26 — MIAMI circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "miami",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.7 m off centreline; = trace vertex 0.
    // Was 0.2325, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.2325,
    name: "MIAMI",
    gp: "Miami GP",
    country: "USA",
    night: false,
    theme: "modern",
    lengthKm: 5.4,
    baseHW: 7,
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 90,
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.94, s1: 0.08 },
      { kinds: ["city", "foliage"], s0: 0.26, s1: 0.38, side: 1 },
      { kinds: ["city", "foliage"], s0: 0.60, s1: 0.72 },
    ],
    pal: { zenith: [0.22, 0.5, 0.88], horizon: [0.80, 0.86, 0.90], grass: [0.20, 0.42, 0.18], runoff: [0.12, 0.72, 0.78], fogDensity: 0.0014, sunDir: [0.3131803839972462, 0.7933903061263571, 0.521967306662077], sun: [1, 0.96, 0.82], sunColor: [1, 0.94, 0.8] },
    elevations: [{ s: 0.8925, halfM: 220, rise: 3.5 }],
    bankZones: [
      { frac: 0.0775, angleDeg: 3.5, widthM: 240 },
      { frac: 0.3785, angleDeg: 3.0, widthM: 130 },
      { frac: 0.6788, angleDeg: 3.5, widthM: 200 },
      { frac: 0.7496, angleDeg: 3.0, widthM: 180 },
      { frac: 0.8808, angleDeg: 3.0, widthM: 240 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.3, 0.62],
    turns: [0.0463, 0.0628, 0.0823, 0.1188, 0.1813, 0.2058, 0.2128, 0.2388, 0.2558, 0.2648, 0.2773, 0.5533, 0.5668, 0.5793, 0.5968, 0.6118, 0.6333, 0.8803, 0.9078],
    barrier: { a: [0.97, 0.32, 0.56], b: [0.08, 0.74, 0.78], c: [0.97, 0.80, 0.22], night: [0.30, 0.10, 0.32], tyre: [0.97, 0.32, 0.56] },  // vice pink/teal + sun gold
    furniture: { tree: "palm",  fol: [0.20, 0.48, 0.22], lamp: "post",  lc: [1.0, 0.78, 0.85] },
    kit: { marshal: "kiosk",     rail: "armco",       fence: "chainlink", tyre: "tecpro",  board: "led",       gantry: "portal",     camera: "scaffold",  hoarding: "led" },
    standSet: ["pastel", "teal", "alu"],
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["pink", "cyan", "teal", "orange", "purple"], bias: 0.44, fh: [11, 30], bh: [28, 68],
                 kinds: ["setback", "podium", "slab", "cylinder", "twin", "dome", "chevron", "drum", "hall"], neonKinds: ["clad", "screen"], tone: { n: [0.15, 0.14, 0.18], d: [0.58, 0.60, 0.64] },
                 dayPal: ["cream", "white", "peach", "pink", "aqua", "mint", "lemon"] },
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 5421, pts: [[-38,163.7],[-243.4,35.4],[-246.9,25.9],[-245.4,17.2],[-239.3,5.5],[-195.6,-27],[-182,-41.7],[-177.5,-68.2],[-182,-96.3],[-177.7,-130.9],[-167.1,-153.1],[-127.5,-184.8],[-82.4,-200.4],[-53,-206.9],[-9.8,-207.9],[24.1,-201.8],[63.9,-184],[265.4,-63.1],[294.4,-45.6],[309.2,-43.1],[326.2,-41.7],[343.2,-44],[364.8,-50.8],[383,-61],[401.7,-76],[421.1,-88.9],[446.5,-93.2],[469.4,-91],[494,-79.1],[517.2,-58.4],[538.2,-37.6],[561.8,-25.9],[586.1,-21],[615.5,-26.1],[642.4,-34.6],[665,-45.3],[681.7,-60.8],[697.6,-85.7],[703.8,-112.2],[703.1,-134.4],[698.2,-149.3],[690.1,-159.5],[673.6,-168.5],[653.7,-168.5],[629.1,-163.1],[601.5,-163.2],[544.8,-175.2],[440.9,-196.2],[333.5,-193.1],[169.6,-186.3],[124.2,-200.7],[68.2,-220.7],[23,-236.7],[-37.6,-255.9],[-100.7,-266.5],[-164,-267.3],[-230.6,-256.4],[-291.4,-235],[-430.2,-184.3],[-510.8,-153.6],[-549.6,-136.4],[-648.9,-83.6],[-702.3,-49.4],[-713,-34.9],[-709.5,-22.9],[-699.8,-13.6],[-675.3,1.2],[-658.2,14],[-648.9,32.7],[-646.9,52.2],[-652.4,75.9],[-665.6,89.2],[-681.1,95.4],[-727,92.6],[-750,95.7],[-760.1,102.3],[-775.5,117.3],[-799.4,160.1],[-797.8,169.4],[-786.2,174.1],[-775.7,181.9],[-775.3,197.8],[-794.3,259.2],[-792.8,269.6],[-784.2,276.6],[-736.4,281],[-45.4,305.5],[505.5,330.4],[521.6,326.2],[525,313.5],[519.5,297.7],[500.4,280.8],[470.6,258.2],[438.7,241],[412.7,234.5],[389.8,236.3],[361.7,246.5],[296.4,277.2],[259.7,287],[214.7,290.9],[170.3,284.7],[128.3,267.2]] },
  }
  );
})();
