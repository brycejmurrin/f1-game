/* Apex 26 — MONACO circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monaco",
    name: "MONACO",
    gp: "Monaco GP",
    country: "Monaco",
    night: false,
    theme: "street_day",
    lengthKm: 3.3,
    baseHW: 5,
    street: true,
    terrainOuter: 28,
    sceneryCoordinates: "source",
    barrierGap: 2.0,
    dressingExclusions: [
      // Keep generic city furniture out of the tunnel and the Casino sightline.
      { kinds: ["city", "foliage", "lighting"], s0: 0.50, s1: 0.60 },
      { kind: "city", s0: 0.17, s1: 0.24 },
      { kinds: ["city", "foliage"], s0: 0.29, s1: 0.70, side: 1 },
      { kinds: ["city", "foliage"], s0: 0, s1: 0.14, side: 1 },
    ],
    reverse: true,
    // Rotate the start/finish line onto the main pit/harbour straight so the lap
    // begins on the straight with the first corner at its end (fraction of the
    // original trace; tuned against the reversed layout).
    // Start/finish line. Snapped to the real one: coord 0.5 m off centreline; this trace is stored REVERSED, so its vertex 0 is not the line.
    // Was 0.28. That already measured straight (mean |k| 0.00298 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.2516,
    sceneryStartFrac: 0.28,
    pal: { horizon: [0.55, 0.68, 0.82], grass: [0.36, 0.35, 0.34], runoff: [0.42, 0.41, 0.4], concrete: [0.24, 0.23, 0.22], fogDensity: 0.0014, sunDir: [0.22008805283522467, 0.8803522113408987, 0.4201681008672471], sun: [1, 0.98, 0.93], sunColor: [1, 0.97, 0.9] },
    elevations: [{ s: 0.10, halfM: 340, rise: 30 }, { s: 0.55, halfM: 220, rise: -10 }],
    hwZones: [
      { s0: 0.1524, s1: 0.2131, hw: 4.6, ease: 0.012 },  // arc 0.112-0.150 Massenet/Casino
      { s0: 0.8217, s1: 0.8864, hw: 4.1, ease: 0.012 },  // arc 0.432-0.462 Loews hairpin
      { s0: 0.7430, s1: 0.7741, hw: 4.3, ease: 0.012 },  // arc 0.485-0.510 Portier
      { s0: 0.5579, s1: 0.5879, hw: 4.5, ease: 0.012 },  // arc 0.770-0.792 Tabac
      { s0: 0.4848, s1: 0.5349, hw: 4.4, ease: 0.012 },  // arc 0.815-0.855 swimming pool
      { s0: 0.3488, s1: 0.3918, hw: 4.3, ease: 0.012 },  // arc 0.930-0.955 Rascasse
    ],
    bankZones: [
      { frac: 0.1286, angleDeg: 3.0, widthM: 60 },    // Massenet
      { frac: 0.2961, angleDeg: 3.0, widthM: 160 },   // Mirabeau/descent
      { frac: 0.7791, angleDeg: 3.0, widthM: 120 },   // Tabac
      { frac: 0.8847, angleDeg: 2.5, widthM: 140 },   // swimming pool
      { frac: 0.9417, angleDeg: 2.5, widthM: 100 },   // Rascasse
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.32, 0.68],
    turns: [0.0666, 0.1516, 0.2135, 0.2341, 0.2535, 0.2742, 0.3433, 0.3615, 0.3834, 0.4077, 0.4344, 0.6407, 0.7171, 0.7378, 0.7645, 0.8227, 0.8640, 0.8797, 0.9064],
    barrier: { a: [0.95, 0.95, 0.96], b: [0.86, 0.16, 0.15], c: [0.13, 0.28, 0.55], night: [0.20, 0.20, 0.24], tyre: [0.86, 0.16, 0.15] },  // red/white + Riviera navy
    furniture: { tree: "palm",  fol: [0.28, 0.44, 0.22], lamp: "globe", lc: [1.0, 0.92, 0.70] },  // Riviera palms
    kit: { marshal: "tent",      rail: "armco",       fence: "hoarding",  tyre: "tecpro",  board: "fascia",    gantry: "cantilever", camera: "scaffold",  hoarding: "barrierTop" },
    standSet: ["scaffold", "pastel", "alu"],
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["gold", "teal", "white", "rose"], bias: 0.12, fh: [9, 17], bh: [14, 28],
                 kinds: ["setback", "slab", "podium", "tiered", "chevron", "dome", "hall"], neonKinds: [], tone: { n: [0.22, 0.19, 0.15], d: [0.88, 0.81, 0.66] },
                 dayPal: ["cream", "peach", "tan", "ochre", "terra", "pink", "sand"] },
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 3325, pts: [[-118,284.6],[-123.1,279.5],[-128.6,274.7],[-139.8,264.2],[-151.6,255],[-159.1,240.2],[-164.7,224.5],[-167.3,210.3],[-167.9,195.1],[-164,180.7],[-155.1,166.9],[-139.4,150.6],[-121.3,139.2],[-106.5,134],[-80,129.6],[-52.2,125.7],[-19,118.2],[3.7,108.9],[55.6,84.3],[73.6,77.9],[96.6,76],[130.1,70.6],[166.7,60.6],[232.2,41.3],[257.9,36.8],[286.9,33.1],[307.8,30.6],[323,29.9],[340,25.8],[347,22.4],[349.8,17.4],[349.5,9],[348.9,-4.7],[350.2,-13.7],[353,-23.9],[358.6,-40.6],[363.6,-59.1],[366.4,-85.8],[367.9,-111.5],[367.9,-145],[363.4,-196.5],[357.8,-236],[353.5,-263.2],[347.3,-288.5],[324.7,-367.1],[314.4,-395.3],[304.8,-410.2],[292.4,-430.1],[275.5,-450.9],[272.6,-459.9],[271.2,-467.2],[271,-476.3],[267.2,-480.2],[261,-484.9],[251.2,-486.3],[240.2,-486.1],[223.5,-483.4],[193.5,-475.5],[186.7,-471.5],[184.6,-464.6],[189,-451.6],[192.8,-447.4],[200.2,-444.1],[215.2,-437.1],[228.5,-429.4],[246.7,-411.1],[261.2,-390.4],[269.6,-374.6],[277.9,-354.6],[287,-328.1],[288.5,-316.4],[286.7,-310.8],[278.7,-306.9],[270.8,-301.4],[267.2,-296.5],[266.8,-290.4],[268,-285.8],[271.6,-271.5],[285.7,-189.7],[287.2,-177.8],[290.8,-169.6],[299.2,-161.9],[311.6,-152.8],[317.3,-146.5],[320.1,-139.9],[320.5,-130.4],[320.2,-91.9],[317.3,-69.5],[314.4,-56.6],[308,-38.5],[300,-20.3],[290.5,-1.7],[284.4,4.6],[276.1,6],[263.5,7.9],[218.2,15],[168.9,22.1],[69.6,35.1],[62.8,34.7],[50.3,27.6],[39,29.4],[31.1,32.2],[28.7,37.7],[27.5,43.2],[27.3,48],[24.1,53.5],[5.3,57],[-30.2,62.6],[-85.3,75.6],[-122.6,88.5],[-178.1,114.4],[-206.9,128.5],[-255.2,158],[-289,194.8],[-312.4,224.7],[-332.6,260],[-344.4,290.9],[-355.1,334.3],[-365.3,402.4],[-367.9,468.6],[-365.1,480],[-357.8,483.6],[-344,482.6],[-331.3,478.2],[-322.1,474.5],[-313.2,471.2],[-296.7,467],[-286.1,461.5],[-283.7,456.8],[-282,451.6],[-282,445],[-285.2,438.1],[-307.8,409.4],[-315.5,403.9],[-318.5,398.2],[-317.1,391.5],[-312.6,386.9],[-306.6,385.1],[-301.3,386.5],[-298,390.9],[-295.5,398.2],[-288.9,410.3],[-279.1,424],[-273.9,430.7],[-269.4,439.6],[-268.5,447.1],[-268.3,456.2],[-267.2,467.2],[-261.7,477],[-254.1,483.2],[-243.3,486.3],[-234.3,483.8],[-228.3,475.3],[-141.7,357.8],[-124.6,336.3],[-119.2,327.6],[-113.4,315.3],[-111.1,306.3],[-112.7,296.3]] },
  }
  );
})();
