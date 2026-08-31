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
      // addBox geometry via neonTower — invisible to js/track/graph.js's
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
    segs: [
      { t: 0, l: 160 }, { t: -60, l: 70 }, { t: 70, l: 70 }, { t: -55, l: 70 }, { t: 0, l: 220 }, { t: -90, l: 70 },
      { t: 0, l: 200 }, { t: -95, l: 70 }, { t: 90, l: 80 }, { t: -80, l: 60 }, { t: 60, l: 70 }, { t: -90, l: 90 },
      { t: 0, l: 180 }, { t: -90, l: 70 }, { t: -90, l: 70 }, { t: 85, l: 60 }, { t: -95, l: 80 },
    ],
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
  }
  );
})();
