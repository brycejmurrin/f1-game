/* Apex 26 — BAHRAIN circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "bahrain",
    reverse: false,  // driving direction flipped (manual override of the GPS-trace auto-audit)
    // Bounded only (START-LINES: Not located — OSM pit way is a weak proxy). Keep until a better source.
    startFrac: 0.2250,
    name: "BAHRAIN",
    gp: "Bahrain GP",
    country: "Bahrain",
    night: true,
    theme: "desert",
    sceneryTheme: "desert",
    lengthKm: 5.4,
    sunAzimBias: -0.36,   // low desert-latitude sun sits east of overhead at race time (late-day GP)
    baseHW: 7,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0, s1: 1 },
    ],
    pal: { horizon: [0.20, 0.10, 0.05], zenith: [0.06, 0.05, 0.16], sunColor: [0.80, 0.62, 0.40], ambientSky: [0.30, 0.22, 0.16], ambientGround: [0.28, 0.18, 0.10], fogColor: [0.16, 0.10, 0.06], fogDensity: 0.0028, sunDir: [0.5, 0.14, 0.4], concrete: [0.27, 0.26, 0.25], runoff: [0.24, 0.23, 0.22], grass: [0.19, 0.17, 0.14] },
    elevations: [{ s: 0.645, halfM: 260, rise: -3 }, { s: 0.725, halfM: 180, rise: 2 }],
    bankZones: [
      { frac: 0.0475, angleDeg: 3.0, widthM: 120 },   // T1
      { frac: 0.1166, angleDeg: 3.0, widthM: 100 },   // T4
      { frac: 0.3373, angleDeg: 4.0, widthM: 220 },   // T5-T7 sweep
      { frac: 0.4064, angleDeg: 3.5, widthM: 190 },
      { frac: 0.6077, angleDeg: 3.0, widthM: 130 },   // T10
      { frac: 0.9799, angleDeg: 3.0, widthM: 100 },   // final right
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.28, 0.62],
    turns: [0.0480, 0.0705, 0.1165, 0.1870, 0.2030, 0.3370, 0.3950, 0.4065, 0.4520, 0.4610, 0.6080, 0.8335, 0.8510, 0.8710, 0.9800],
    // Sakhir: sparse desert — cool-white lamps, thin palm line (not oasis green)
    furniture: { tree: "palm",  fol: [0.30, 0.40, 0.18], lamp: "arm",   lc: [0.88, 0.94, 1.0], sparse: true },
    kit: { marshal: "container", rail: "wArmco",      fence: "panelled",  tyre: "stack",   board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "panel" },
    standSet: ["sandstone", "steel", "alu"],
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 5419, pts: [[379.4,31.2],[370,368],[361.1,588.6],[356.9,598.5],[348.1,600.1],[338.6,597.5],[331.5,592.3],[285.9,546.2],[273.5,541.5],[259.9,542.5],[180.6,568.2],[161.6,570.3],[144.4,569.2],[-375.9,468.6],[-393.8,463.4],[-403.3,453.5],[-405.6,440.8],[-403.8,428.8],[-397.9,415.2],[-386.7,401.6],[-373.6,390.6],[-355.8,376.9],[-293.1,330.3],[-242.7,278],[-230.3,265.9],[-220.3,248.7],[-197.8,197.8],[-190.1,186.8],[-178.2,179],[-166.4,172.6],[-147.5,170.5],[-90.6,180],[-75.2,179.4],[-59.3,176.3],[-46.2,169.5],[-30.3,154.9],[85.3,8.7],[96.5,-1.3],[112.5,-3.8],[122.5,3.9],[126.1,19.7],[125.5,43.7],[97.7,209.3],[81.7,313],[79.3,333.5],[82.3,352.3],[86.4,366.5],[94.7,380.6],[142.1,421.5],[148.6,424.6],[155.7,422.6],[159.8,415.2],[177,287.3],[181.7,202],[190,48.5],[195.9,-111.9],[201.9,-258],[199.5,-282],[190,-296.2],[175.2,-304],[154.5,-308.2],[133.2,-306.7],[106.6,-301.4],[79.3,-288.3],[56.3,-272.1],[33.8,-249.1],[20.1,-226.5],[-5.4,-160.5],[-19.6,-132.7],[-33.2,-116.5],[-51,-101.9],[-72.3,-88.7],[-101.9,-81.4],[-134.4,-80.8],[-157.5,-86.2],[-188.3,-100.9],[-269.4,-141.1],[-286,-153.2],[-300.2,-167.3],[-307.3,-180.4],[-316.1,-195.1],[-316.1,-208.2],[-309,-221.8],[-294.8,-235.4],[-275.3,-250.1],[339.2,-593.7],[350.4,-599.5],[368.2,-600.1],[375.9,-592.7],[403.2,-535],[405.6,-512],[405,-468.6],[397.3,-230.2]] },
  }
  );
})();
