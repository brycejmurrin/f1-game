/* Apex 26 — SUZUKA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "suzuka",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.3 m off centreline, 1 node before vertex 0.
    // Was 0.6125. That already measured straight (mean |k| 0.00330 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.9942,
    sceneryStartFrac: 0.6125,
    sceneryCoordinates: "racing",
    name: "SUZUKA",
    gp: "Japanese GP",
    country: "Japan",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    sunAzimBias: -0.14,   // Pacific-coast morning race slot — sun still east of the crossover
    baseHW: 7,
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0.19, s1: 0.26 },
      { kinds: ["foliage", "lighting"], s0: 0.79, s1: 0.85 },
    ],
    pal: { zenith: [0.35, 0.50, 0.70], horizon: [0.74, 0.74, 0.8], grass: [0.2, 0.44, 0.2], sunDir: [0.8846517369293829, 0.44232586846469146, 0.14744195615489716], sun: [1, 0.90, 0.65], sunColor: [1, 0.82, 0.55] },
    // Elevations and bridges are authored in source-trace space. These source
    // fractions map through startFrac=0.9942 to racing s≈0.818, 0.068 and 0.436
    // (the crossover bridge).
    // Keeping that contract explicit prevents the crossover lift from landing on
    // the Esses while its scenery remains at the real figure-8 crossing.
    // The bridge peak sits exactly on the measured self-crossing (lower road
    // racing s≈0.226, upper s≈0.817). The lower road there is already lifted to
    // y≈5.4 by the Esses elevation, so rise must clear it: 13.5 − 5.4 ≈ 8.1 m of
    // road-to-road daylight — the crossover deck (6.5 m underside + 1.5 m deck)
    // tucks exactly beneath the upper ribbon instead of clipping through it.
    elevations: [{ s: 0.8125, halfM: 300, rise: 11 }, { s: 0.0625, halfM: 260, rise: -5 }],
    bridges: [{ s: 0.4298, halfM: 160, rise: 13.5 }],
    hwZones: [
      { s0: 0.8710, s1: 0.9671, hw: 6.1, ease: 0.012 },  // arc 0.300-0.348 the Esses
    ],
    bankZones: [
      { frac: 0.0622, angleDeg: 4.0, widthM: 260 },   // T1/T2
      { frac: 0.3306, angleDeg: 3.5, widthM: 220 },   // Dunlop / Degner approach
      { frac: 0.5194, angleDeg: 3.5, widthM: 150 },
      { frac: 0.6549, angleDeg: 3.5, widthM: 170 },
      { frac: 0.8015, angleDeg: 4.0, widthM: 80 },    // Spoon
      { frac: 0.8562, angleDeg: 7.0, widthM: 100 },   // 130R
      { frac: 0.9281, angleDeg: 4.0, widthM: 240 },   // final corner
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.32, 0.68],
    turns: [0.1198, 0.1392, 0.1890, 0.2104, 0.2339, 0.2754, 0.2968, 0.3404, 0.3930, 0.4213, 0.4753, 0.4988, 0.5472, 0.6537, 0.6820, 0.8549, 0.9275, 0.9511],
    furniture: { tree: "broad", fol: [0.24, 0.46, 0.24], lamp: "none" },  // mixed Japanese hill forest
    kit: { marshal: "kiosk",     rail: "wArmco",      fence: "panelled",  tyre: "stack",   board: "banner",    gantry: "truss",      camera: "lattice",   hoarding: "banner" },
    standSet: ["navy", "orange", "steel"],  // Honda crown orange; navy no longer clashes with Silverstone
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 5814, pts: [[-695.1,-35.7],[-816.2,-181.3],[-957.9,-354.6],[-970.9,-373],[-978.1,-392.1],[-981.9,-409.3],[-981.6,-426.2],[-979.5,-439.2],[-962.9,-490.2],[-955.1,-503.5],[-943.7,-513.7],[-934.1,-519.1],[-916.8,-523.3],[-901.1,-522.8],[-883.8,-517],[-867.7,-504.3],[-851.4,-479.6],[-767.8,-351.5],[-752,-338.1],[-738.4,-333.7],[-717.8,-330.2],[-674.6,-329.8],[-652.9,-323.6],[-637.5,-312.8],[-625.9,-298.7],[-620.4,-284.9],[-601,-211.2],[-592.8,-192.3],[-579.9,-176],[-564.8,-165],[-545.8,-156.1],[-526.3,-152.5],[-476.1,-151.7],[-452.9,-147.2],[-437,-139.7],[-420.5,-127],[-408.5,-109.4],[-401.1,-91.4],[-397.7,-74.3],[-397.9,-58.1],[-401,-44.3],[-425.7,23],[-429.4,36.7],[-430,54.7],[-427.4,66.6],[-420.9,83.8],[-411.2,98.5],[-392.7,111.6],[-370.1,123.8],[-343.3,137.2],[-319.8,146.7],[-302.2,151.6],[-277.6,155.7],[-249.6,156.1],[-227.6,155.3],[-209.2,150.4],[-194.3,144],[-171.1,134.1],[-146.7,120.5],[-118.7,97.6],[-96.8,74.3],[-4.6,-37.2],[0.2,-43.7],[14.9,-47.1],[149.6,-59.2],[158.2,-58.1],[167.5,-51.9],[171.2,-41.3],[172.9,-32.5],[193.3,51.6],[220.6,209.4],[225.8,238.4],[227.1,253],[225.7,268.2],[222.7,283.8],[216.5,300.1],[209.5,316.2],[187.7,366],[185.5,373.6],[187.1,380.6],[191.2,387.1],[198.3,391.9],[206.4,394.4],[214.2,393.9],[223.2,387.9],[230.6,377.2],[262.3,322.5],[288.1,281.3],[304.9,256.8],[318.8,240.7],[330.7,230.5],[351.3,214.3],[372.9,202.7],[395.6,195.9],[435.1,190.1],[472.4,188.6],[500.6,190.7],[534.1,198],[570.8,208.4],[611.9,223.7],[637.9,235.7],[660.6,249.4],[681.6,265],[703.8,284.9],[726.8,310.3],[741.9,332.4],[755.6,356.6],[789.2,446],[807.2,485.1],[816.3,500.8],[828.7,512.3],[845,519.7],[864.5,523.3],[887.8,522.8],[909.3,519.7],[930.4,515],[951,506.5],[967.8,493.8],[977.9,477.5],[981.9,461.6],[980.7,441.6],[976.1,426.7],[969.4,411.7],[958,399.2],[935.4,378.1],[907.2,354.6],[879.6,330.5],[844.6,304.1],[804.6,276.8],[763.7,251.3],[717.9,229.5],[677,208.6],[635,192.6],[566.7,169],[491.6,139.8],[400.7,108],[310.5,79.6],[248.1,58],[167.5,27.2],[149,22.6],[130.6,22],[111.2,25.7],[92.3,30.9],[58.2,44],[26.9,59.7],[0.5,75.9],[-26.7,97],[-77.6,144.6],[-147.3,209.5],[-166.6,225.5],[-180.4,235.2],[-193,243.5],[-202,248.8],[-206.8,249.3],[-213.2,246.6],[-229,232.6],[-240.3,223.2],[-249.5,220.5],[-258.2,222.2],[-268.4,228.9],[-285.2,244.2],[-304.1,257.7],[-325.2,266.6],[-351,268.8],[-375,267.5],[-400.4,262.3],[-425.8,252.4],[-447.4,242],[-474.4,223.7],[-498.7,201.1],[-523.7,173.4]] },
  }
  );
})();
