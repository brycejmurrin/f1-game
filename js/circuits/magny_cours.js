/* Apex 26 — CIRCUIT DE NEVERS MAGNY-COURS definition (data only).
   Retired circuit (`classic: true`): last French GP 2008.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "magny_cours",
    classic: true,
    // Upstream fr-1960 already runs clockwise, matching the racing direction.
    reverse: false,
    startFrac: 0.99,
    name: "MAGNY-COURS",
    gp: "French GP",
    country: "France",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 115,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },
      { kind: "foliage", s0: 0.40, s1: 0.50 },
    ],
    // Central-French farmland: soft, cool, slightly overcast light over green
    // fields — Magny-Cours never looked exotic and shouldn't here.
    pal: {
      zenith:        [0.32, 0.48, 0.70],
      horizon:       [0.74, 0.76, 0.72],
      sun:           [0.98, 0.96, 0.86],
      sunColor:      [0.98, 0.96, 0.86],
      ambientSky:    [0.50, 0.53, 0.57],
      ambientGround: [0.27, 0.29, 0.22],
      fogColor:      [0.72, 0.74, 0.72],
      grass:         [0.22, 0.44, 0.20],
      sunDir:        [0.42, 0.62, 0.36],
    },
    elevations: [
      { s: 0.24, halfM: 360, rise: 5.0 },
      { s: 0.52, halfM: 340, rise: -6.0 },
      { s: 0.80, halfM: 320, rise: 4.5 },
    ],
    hwZones: [
      { s0: 0.150, s1: 0.195, hw: 6.3, ease: 0.012 },  // Estoril
      { s0: 0.560, s1: 0.600, hw: 6.2, ease: 0.012 },  // Adelaide hairpin
      { s0: 0.900, s1: 0.945, hw: 6.4, ease: 0.012 },  // Lycée
    ],
    bankZones: [
      { frac: 0.060, angleDeg: 3.0, widthM: 110 },
      { frac: 0.400, angleDeg: 3.5, widthM: 130 },
      { frac: 0.780, angleDeg: 3.0, widthM: 120 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.0905, 0.1450, 0.1675, 0.1830, 0.1945, 0.4130, 0.5350, 0.5475, 0.6050, 0.6165, 0.6355, 0.7575, 0.7695, 0.8170, 0.9540, 0.9780, 0.9840],
    furniture: { tree: "broad", fol: [0.22, 0.46, 0.22], lamp: "none", treeCrown: "weeping" },  // Nivernais poplar and hedgerow
    kit: { marshal: "cabin",     rail: "wArmco",      fence: "mesh",      tyre: "stack",   board: "trivision", gantry: "box",        camera: "lattice",   hoarding: "panel" },
    standSet: ["navy", "alu", "concrete"],  // French blue on a plain 1990s facility
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    // Circuit de Nevers Magny-Cours — Magny-Cours. Upstream fr-1960, stated 4412 m, projected 4464 m, trace winding CCW.
    path: { len: 4464, pts: [[72.1,35.6],[-82.4,161.2],[-94.4,181.9],[-100.1,198.5],[-101.5,255.7],[-100.9,328.9],[-95.8,342],[-81.2,370.1],[-74.1,403.1],[-75.3,425.9],[-78,436.8],[-87.1,461.1],[-101.4,479.8],[-117.6,494.1],[-132.1,503.9],[-154.5,512.6],[-178.6,515.5],[-199.4,514.9],[-223.8,507.2],[-241.5,495.8],[-254.3,483.2],[-269.1,461.4],[-303.5,388.5],[-320.3,345.4],[-328.7,312.1],[-332.9,286.5],[-348.7,30.8],[-348.7,4.1],[-344.9,-46.1],[-337.9,-86.9],[-247.1,-421],[-241.8,-430.5],[-232,-432.3],[-225.1,-427.9],[-221.1,-418.4],[-206.7,-322],[-225.8,-190.1],[-229,-172.7],[-222.8,94.8],[-224.4,103.3],[-231.2,112.1],[-250.9,130.7],[-260.2,144.2],[-267.5,165.8],[-270,186.1],[-269,227.1],[-260.3,282],[-245.2,335.2],[-232.8,355.8],[-216.5,370.7],[-197.8,377.5],[-175.5,373],[-164.6,361.9],[-158.5,351.3],[-158.7,336.3],[-162.7,323.3],[-183.5,291.7],[-188.9,279],[-194.1,256.8],[-195.2,229.9],[-189.7,204.4],[-166.7,131],[-162,109.6],[-158.8,89.2],[-162.2,-233.4],[-157.4,-244.3],[-117.3,-289],[-113.3,-299.4],[-111.7,-330.4],[-112.1,-349.4],[-116.1,-387.4],[-121.4,-409.5],[-149.3,-502.8],[-146.1,-509.3],[-126.8,-515.5],[-107.4,-513],[-88.4,-505.3],[-61,-485.7],[-36,-463.5],[-8.9,-430.7],[91.2,-315.6],[115.1,-292.2],[154.4,-262.8],[191.4,-245],[344,-194.6],[348.3,-189],[348.7,-180],[331.9,-148.9],[297.5,-109.2],[286,-101.9],[277.3,-107.4],[269.6,-114],[261.8,-115.3],[238,-97.8]] },
  }
  );
})();
