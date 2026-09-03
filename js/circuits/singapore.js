/* Apex 26 — SINGAPORE circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "singapore",
    name: "SINGAPORE",
    // Start/finish line. Snapped to the real one: coord 6.8 m off centreline; = trace vertex 0.
    // Was 0.5075, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.5075,
    // Marina Bay races ANTI-CLOCKWISE — Pirelli ("cars are driving
    // anti-clockwise"), f1-fansite ("Driving direction: Counterclockwise"),
    // and Turn 1 is a sharp left. The imported centreline runs the other way:
    // of the eleven circuits in tests/data/f1-circuit-reference.geojson that
    // are anti-clockwise in reality, ten compute anti-clockwise and singapore
    // alone computes clockwise, so the upstream line is drawn backwards. Left
    // uncorrected the lap played mirrored — measured 11 right / 6 left against
    // a real 12 left / 7 right.
    //
    // startFrac is unchanged and must stay so: racing 0 maps to source `phi`
    // under BOTH branches of toSourceFrac, so the start line does not move.
    reverse: true,
    sceneryLapMirror: true,
    gp: "Singapore GP",
    country: "Singapore",
    night: true,
    theme: "street_night",
    sceneryTheme: "street",
    sceneryThemeOverrides: {
      palette: { shell: [0.16, 0.30, 0.40], roof: [0.80, 0.88, 0.94] },
    },
    lengthKm: 4.9,
    baseHW: 6,
    street: true,
    barrierGap: 1.2,
    terrainOuter: 48,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.15, s1: 0.48, side: 1 },
      { kinds: ["city", "foliage"], s0: 0.78, s1: 0.90, side: 1 },
      { kinds: ["city", "foliage"], s0: 0.90, s1: 0.15, side: 1 },
      // The comment above has always been true for side 1, where the two bay
      // windows exclude the generic pass from the sightlines cityFront() does
      // not reach. It was never applied to side -1, where cityFront() ALSO runs
      // bespoke facades — over s 0.00-0.20 and 0.48-0.88, ~68% of the lap on
      // this side (see the cityFront() calls below). Nothing excluded the
      // generic pass there, so for most of side -1 BOTH systems were placing a
      // full building row over the identical street frontage: the generic
      // engine-level city generator (js/track/tracks.js, every 18/26 m, raw
      // addBox geometry via neonTower — invisible to js/track/scenery/graph.js's
      // instancing stats, which is why this was hard to find) stacked
      // underneath cityFront()'s own facades rather than only showing through
      // the gaps between them. These three rules (plus the pit-straight one
      // below) match EXACTLY the s-ranges the five cityFront() calls below
      // cover on side -1 — a lap-wide exclusion was also measured (811,379 at
      // night) but rejected: it would also blank the ~35% of side -1
      // (s 0.20-0.48, 0.88-0.955) that has NO bespoke facade, leaving those
      // stretches with no buildings at all. This is the redundant-layer class
      // of cut in tests/specs/new-hooks.spec.js's Qatar precedent (fc40591b) — cut
      // where two systems draw the same wall twice, not where only one draws
      // it. Measured: these three rules alone took night from 1,271,799 to
      // 1,006,947 with ZERO change to the bespoke facade wall itself.
      { kinds: ["city", "foliage"], s0: 0.00, s1: 0.20, side: -1 },
      { kinds: ["city", "foliage"], s0: 0.48, s1: 0.88, side: -1 },
      { kinds: ["city", "foliage"], s0: 0.955, s1: 0.04, side: -1 },
      { kind: "lamps", s0: 0, s1: 1 },
    ],
    // The redundant-layer cut above still left night at 1,006,947 — over even
    // a raised budget — because cityFront()'s own along() step (44/62/44/48 m)
    // was dense enough that neonFacade's per-building row/col grid was
    // already pinned at its LOD cap (rows<=10, cols<=6) on nearly every unit:
    // past that point, more buildings only adds unresolvable window detail,
    // not visible skyline. Widened to 70/95/70/75 (~1.5-1.6x) below — Qatar
    // precedent's second technique, thinning an along()/every() step rather
    // than suppressing geometry — and re-measured at 954,223. A full
    // zero-bespoke floor (all five cityFront() calls, plus building()/tower()/
    // waterBand()/floodMastRing()/makePortal(), NOOPed) still measures
    // 746,999 — the remaining generic-city-only frontage (the ~35% of side -1
    // with no bespoke coverage) is itself already close to a 700,000 budget,
    // so 700,000 was never reachable here without either bare street or
    // shared-engine (js/track/tracks.js / scenery-city.js) changes touching
    // every street/night circuit. tests/specs/new-hooks.spec.js's budget for this
    // circuit is raised to 1,050,000 to match the real, verified number.
    // Cool night: near-black zenith + cool fog/ambient so CBD glass & neon pop.
    // Warm flood pools on tarmac stay in scenery — not the sky.
    pal: {
      horizon:      [0.10, 0.12, 0.20],
      zenith:       [0.02, 0.02, 0.07],
      sunColor:     [0.55, 0.62, 0.78],
      ambientSky:   [0.22, 0.26, 0.36],
      ambientGround:[0.18, 0.20, 0.26],
      fogColor:     [0.06, 0.08, 0.14],
      fogDensity:   0.0020,
    },
    elevations: [
      { s: 0.9000, halfM: 120, rise: -2.5 },
      { s: 0.3800, halfM: 120, rise: 2.5 },
    ],
    hwZones: [
      { s0: 0.5890, s1: 0.6642, hw: 5.2, ease: 0.012 },  // arc 0.098-0.152 T1-T3
      { s0: 0.1020, s1: 0.1774, hw: 5.1, ease: 0.012 },  // arc 0.650-0.685 bridge link
      { s0: 0.2341, s1: 0.2901, hw: 5.3, ease: 0.012 },  // arc 0.808-0.838 Esplanade
      { s0: 0.3236, s1: 0.4067, hw: 5.3, ease: 0.012 },  // arc 0.925-0.955 final corners
    ],
    // Flat city tarmac — crown only, 2.5-3°. Nothing here is banked.
    bankZones: [
      { frac: 0.1043, angleDeg: 3.0, widthM: 100 },
      { frac: 0.3562, angleDeg: 3.0, widthM: 130 },
      { frac: 0.4377, angleDeg: 3.0, widthM: 90 },
      { frac: 0.6585, angleDeg: 2.5, widthM: 80 },
      { frac: 0.7694, angleDeg: 3.0, widthM: 80 },
      { frac: 0.0114, angleDeg: 3.0, widthM: 130 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // Mirrored (f -> 1-f, re-sorted) when singapore gained `reverse: true`: these
    // are RACING-lap fractions, which the header says are never fmap'd, so they
    // had to move by hand or all 19 apexes would sit on the wrong corners. The
    // physical apex positions are unchanged — only which corner you meet first.
    sectors: [0.34, 0.68],
    turns: [0.0629, 0.0809, 0.0914, 0.1739, 0.1814, 0.3409, 0.3839, 0.4259, 0.5179, 0.5414, 0.5484, 0.5574, 0.5829, 0.6004, 0.7104, 0.8579, 0.8714, 0.9299, 0.9499],
    barrier: { a: [0.92, 0.93, 0.96], b: [0.10, 0.34, 0.74], c: [0.90, 0.12, 0.18], night: [0.12, 0.16, 0.32], tyre: [0.10, 0.34, 0.74] },  // white/blue + flag red
    furniture: { tree: "palm",  fol: [0.16, 0.46, 0.20], lamp: "arm",   lc: [0.85, 0.95, 1.0] },
    kit: { marshal: "hut",       rail: "armco",       fence: "chainlink", tyre: "tecpro",  board: "led",       gantry: "truss",      camera: "scaffold",  hoarding: "led" },
    standSet: ["scaffold", "teal", "darkSteel"],
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["cyan", "blue", "teal", "white", "green", "violet"], bias: 0.42, fh: [20, 52], bh: [48, 88],
                 kinds: ["podium", "setback", "cylinder", "spire", "twin", "slab", "notch", "fin", "drum"], neonKinds: ["clad", "screen", "antenna"], tone: { n: [0.12, 0.13, 0.18], d: [0.44, 0.46, 0.50] },
                 dayPal: ["white", "bluglass", "greyblue", "teal", "steel", "paleblue", "darkglass", "stone"] },
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 4944, pts: [[-684.4,110.6],[-712.9,-106.6],[-715.7,-134.7],[-712.9,-148.6],[-705.3,-160.8],[-670,-214.5],[-663.6,-223.3],[-657,-226.5],[-648.5,-227.5],[-629.1,-226.5],[-539.8,-221.7],[-402,-207],[-384.5,-202.4],[-373.5,-195.8],[-364.8,-186.3],[-357.6,-167.4],[-356.6,-148.8],[-357.1,-137.6],[-353.6,-131.9],[-334.3,-130.5],[-314.4,-130.1],[-212.8,-124.3],[73.3,-109.1],[108,-105],[132.2,-98.4],[157.1,-86.1],[258.6,2.9],[302,40],[309.3,45.7],[319.6,47.4],[332.5,45.1],[342.2,38.6],[348.6,32.4],[366.9,-23.4],[376.6,-65.2],[400.9,-191.6],[450.8,-446.1],[453.6,-451.5],[457.3,-456.1],[464.2,-461.1],[472.4,-463],[482.6,-462.8],[487.2,-460.9],[498.9,-446.1],[510.6,-429.6],[519.3,-410.8],[528.6,-401.6],[572.7,-366.3],[594.6,-346.1],[608.3,-332.9],[616.8,-321],[625.3,-292],[624.1,-278.4],[621.7,-268.1],[615.7,-256.1],[618.8,-248.5],[629.9,-244.8],[650.4,-237.8],[668,-226.5],[689.6,-211.4],[706.3,-196.8],[712.3,-184.4],[715,-167.1],[715.7,-151.9],[698.8,-123.1],[630.6,-1.2],[542.8,156.3],[527.2,184.8],[512.6,198.2],[506.6,203.1],[486.6,207.1],[468.9,196.2],[446.5,180.6],[354.5,84.3],[346.2,80.1],[339.4,81.7],[333.1,93.7],[296.8,164.6],[248.3,246.7],[239.4,259.9],[230.8,263],[215.3,256.1],[206.4,250.9],[-51.8,101.7],[-93.9,85.6],[-123.2,80.2],[-487.3,58.7],[-501.5,61.5],[-519.8,70.1],[-535,80.7],[-544.7,98.4],[-547.1,115.2],[-544.3,155.1],[-533.9,209.3],[-502.3,296.9],[-493.7,315.6],[-487.9,331],[-484.8,349.9],[-484.8,374.1],[-490.1,428],[-499.4,449.3],[-512.1,462],[-522.7,463],[-532.4,460.5],[-543.1,448.1],[-548.9,440.6],[-554.5,432.9],[-564.5,424.5],[-587.5,413.1],[-606.9,407.8],[-631.1,410.1],[-643.6,405.1],[-649.9,396.2],[-653.6,382],[-663.4,262.4]] },
  }
  );
})();
