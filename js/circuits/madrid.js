/* Apex 26 — MADRID / Madring circuit definition. */
(function () {
  "use strict";

  (window.TrackDefs = window.TrackDefs || []).push({
    id: "madrid",
    name: "MADRID",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    street: false,
    reverse: false,
    sceneryCoordinates: "racing",
    lengthKm: 5.5,
    baseHW: 7,
    terrainOuter: 56,
    banked: true,
    bankZones: [
      { frac: 0.75, angleDeg: 13.5, widthM: 180 }, // 24% grade = atan(0.24)
      { frac: 0.0524, angleDeg: 3.0, widthM: 180 },
      { frac: 0.3990, angleDeg: 3.5, widthM: 110 },
      { frac: 0.5711, angleDeg: 3.0, widthM: 90 },
      { frac: 0.6557, angleDeg: 3.0, widthM: 180 },
      { frac: 0.9296, angleDeg: 3.0, widthM: 90 },
    ],
    // The generic city/furniture base layer carries most of the circuit's
    // density — the bespoke IFEMA halls and La Monumental bowl layer on top of
    // it, they don't replace it. Only carve their curated sightlines (the
    // exhibition-hall pit straight and the banked bullring sector); the old
    // road-overlap risk is handled by the guarded emitters, not exclusions.
    //
    // The two rules below (s 0.15-0.55, 0.83-0.95) are a later, separate cut:
    // tests/specs/new-hooks.spec.js's prop-vertex budget measured day 621,075 /
    // night 968,561 against 250,000 — not a duplicate-layer bug like
    // Singapore's (CI-3), just this generic layer covering ~74% of a 5.5 km
    // lap at its normal density. Unlike Singapore's cityFront(), the generic
    // city here has no per-circuit along()-step to widen (js/track/tracks.js's
    // every(18)/every(26) is shared by 14 other circuits), so the only
    // Madrid-local lever is exclusion. Cuts lap coverage to ~22%, kept where
    // it was already theme-matched — flanking the two landmark precincts
    // above — rather than spread thin lap-wide. See the budget comment in
    // tests/specs/new-hooks.spec.js for the measured before/after and why 250,000
    // was never reachable (even zero city buildings floors near 435,000, on
    // the required bespoke landmarks alone).
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.95, s1: 0.06 },
      { kinds: ["city", "foliage", "lighting"], s0: 0.68, s1: 0.83 },
      { kinds: ["city"], s0: 0.15, s1: 0.55 },
      { kinds: ["city"], s0: 0.83, s1: 0.95 },
    ],
    pal: {
      zenith: [0.30, 0.58, 0.90],
      horizon: [0.78, 0.79, 0.78],
      grass: [0.48, 0.48, 0.29],
      sunDir: [0.121, 0.968, 0.222],
      sun: [1.0, 0.91, 0.70],
      sunColor: [1.0, 0.98, 0.94],
    },
    elevations: [
      { s: 0.40, halfM: 520, rise: 18 },
      { s: 0.52, halfM: 360, rise: -8 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.32, 0.66],
    turns: [0.0455, 0.0520, 0.0755, 0.2455, 0.2515, 0.3155, 0.3275, 0.3775, 0.3990, 0.4330, 0.4470, 0.5710, 0.6055, 0.6370, 0.6560, 0.7005, 0.7440, 0.7825, 0.8455, 0.8530, 0.8735, 0.9300],
    barrier: { a: [0.90, 0.12, 0.14], b: [0.97, 0.81, 0.12], c: [0.55, 0.12, 0.42], night: [0.26, 0.13, 0.06], tyre: [0.97, 0.81, 0.12] },  // Spain red/gold + crimson-purple
    furniture: { tree: "plane", fol: [0.40, 0.45, 0.27], lamp: "post",  lc: [1.0, 0.90, 0.66] },  // olive, not northern green
    kit: { marshal: "tent",      rail: "jersey",      fence: "hoarding",  tyre: "tecpro",  board: "led",       gantry: "cantilever", camera: "scaffold",  hoarding: "banner" },
    standSet: ["crimson", "sandstone", "steel"],  // the file hardcodes these at its own call sites
    // IFEMA / Castilian campus: white / glass / steel / stone (not ochre brick canyon)
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["red", "gold", "white", "cyan", "violet"], bias: 0.28, fh: [14, 38], bh: [30, 70],
                 kinds: ["setback", "slab", "cylinder", "podium", "spire", "dome", "chevron", "arch"], neonKinds: ["clad", "antenna"], tone: { n: [0.16, 0.16, 0.18], d: [0.64, 0.63, 0.66] },
                 dayPal: ["white", "bluglass", "steel", "stone", "paleblue", "concrete", "darkglass", "cream"] },
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 5431, pts: [[-150.5,-809.2],[36.7,-842.1],[47.8,-848.9],[49.6,-891.4],[55.2,-898.2],[85.4,-903.8],[120.6,-909.2],[151.4,-907.4],[189.7,-891.4],[216.9,-865.6],[360.6,-635.5],[438.3,-514.8],[461.7,-467],[475.9,-434.5],[482.7,-414.7],[498.8,-353.8],[506.1,-288.4],[503.7,-239.2],[496.9,-186.2],[478.4,-136.3],[459.9,-105.5],[452.5,-95.1],[452.5,-86.5],[463,-80.3],[471.6,-71.7],[470.3,-61.2],[463,-50.7],[458.6,-38.4],[461.1,-13.8],[474.1,31.2],[485.1,62],[501.2,87.2],[514.8,105.6],[522.2,127.2],[541.3,204.9],[551.8,233.8],[564.7,247.9],[565.3,257.8],[554.2,266.4],[534.5,281.4],[524,298.8],[524,316],[530.8,336.9],[561.7,393.6],[564.2,409.2],[565.3,516.4],[562.3,558.3],[549.9,575.8],[522.8,596.7],[492.6,621.4],[480.8,644.8],[481.5,673.2],[485.1,690.1],[522.2,779.3],[525.9,808.9],[523.4,839.1],[510.5,866.2],[490.7,889.6],[461.1,904.3],[429,909.2],[394.5,907.4],[360.6,890.2],[327.9,861.2],[308.2,828],[302.6,789.2],[305,754.1],[318.6,717.2],[339,681.7],[349.5,664.5],[451.3,537.7],[501.8,460],[506.1,446.5],[502.4,427.5],[480.8,407.1],[408.1,356.3],[378.4,330.5],[365.5,308.9],[359.3,286.8],[359.3,176.8],[355.7,155.2],[343.9,130],[326.6,103.9],[308.2,83.5],[282.8,68.1],[253.2,58.3],[116.9,58.3],[93.5,68.7],[69.4,82.3],[57.7,85.4],[47.2,76.1],[10.2,20.7],[-36.1,-60.3],[-45.3,-80.6],[-57.1,-97.9],[-78.7,-111.4],[-99.6,-115.1],[-179.8,-104.6],[-218.1,-105.3],[-256.9,-118.7],[-282.8,-144.3],[-295.2,-167.8],[-339.6,-415.7],[-343.9,-446.1],[-349.5,-460.9],[-365.5,-462.8],[-388.9,-445.5],[-403.1,-441.8],[-498.1,-430.1],[-506.7,-439.4],[-525.3,-501.6],[-545,-583.2],[-563.5,-691.5],[-565.3,-719.9],[-549.9,-737.7],[-525.9,-743.3]] },
  });
})();
