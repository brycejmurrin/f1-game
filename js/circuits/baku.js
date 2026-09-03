/* Apex 26 — BAKU circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "baku",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // startFrac defaults to 0 — Already correct per docs/tracks/START-LINES.md
    name: "BAKU",
    gp: "Azerbaijan GP",
    country: "Azerbaijan",
    night: true,
    theme: "street_night",
    street: true,
    lengthKm: 6,
    baseHW: 6,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kinds: ["city", "foliage", "lighting"], s0: 0.36, s1: 0.56 },
      // Preserve the Caspian void on the left of Neftchilar Avenue.
      { kinds: ["city", "foliage", "lighting"], s0: 0.58, s1: 0.97, side: -1 },
    ],
    pal: { horizon: [0.10, 0.12, 0.22], zenith: [0.04, 0.05, 0.14], sunColor: [0.72, 0.74, 0.88], ambientSky: [0.24, 0.26, 0.36], ambientGround: [0.20, 0.20, 0.28], fogColor: [0.08, 0.10, 0.18], fogDensity: 0.0016 },
    hwZones: [
      { s0: 0.42, s1: 0.50, hw: 3.8, ease: 0.02 },      // Castle Section
      { s0: 0.0874, s1: 0.1194, hw: 5.3, ease: 0.012 },  // T2 tight left
      { s0: 0.2577, s1: 0.3233, hw: 5.4, ease: 0.012 },  // T6/T7 into the Old City
      { s0: 0.8232, s1: 0.8825, hw: 5.4, ease: 0.012 },  // T15/T16 seafront kink
    ],
    elevations: [{ s: 0.46, halfM: 500, rise: 14 }],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.3, 0.62],
    turns: [0.0315, 0.0880, 0.2340, 0.2705, 0.3260, 0.3355, 0.4005, 0.4340, 0.4430, 0.4495, 0.4605, 0.5290, 0.5570, 0.5645, 0.6030, 0.6630, 0.6900, 0.7375, 0.7600, 0.8240],
    barrier: { a: [0.93, 0.94, 0.96], b: [0.00, 0.62, 0.58], c: [0.95, 0.45, 0.08], night: [0.08, 0.22, 0.22], tyre: [0.00, 0.62, 0.58] },  // teal/white + flame orange
    furniture: { tree: "palm",  fol: [0.30, 0.42, 0.20], lamp: "globe", lc: [1.0, 0.82, 0.50] },  // Caspian boulevard palms
    kit: { marshal: "hut",       rail: "armco",       fence: "chainlink",  tyre: "tecpro",  board: "fascia",    gantry: "portal",     camera: "scaffold",  hoarding: "barrierTop" },
    standSet: ["scaffold", "sandstone", "steel"],
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["orange", "red", "amber", "gold", "cyan", "white"], bias: 0.40, fh: [10, 26], bh: [38, 84],
                 kinds: ["setback", "slab", "tiered", "podium", "spire", "cylinder", "dome", "chevron", "arch", "hall"], neonKinds: ["clad", "antenna"], tone: { n: [0.16, 0.14, 0.13], d: [0.62, 0.56, 0.46] },
                 dayPal: ["sand", "cream", "tan", "stone", "ochre", "terra", "paleblue"] },
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 5949, pts: [[-1053.9,416.3],[-1204.5,480.9],[-1212.5,487.2],[-1217.6,496.6],[-1218.6,505.6],[-1216,518.6],[-1185.4,597.9],[-1133.7,698.2],[-1091,795.3],[-1084,799.9],[-1075,801.5],[-930.9,743.8],[-754.7,675.6],[-514.2,567.5],[-306.9,472.5],[-293.4,458.3],[-293.4,438.9],[-361.1,263.2],[-361.6,249.5],[-351.1,237.4],[-233.1,181.8],[-166.4,145],[-76.5,87.4],[-71,80],[-73,69.5],[-88,36.5],[-87.5,27],[-80,19.7],[-45.9,-10.3],[159,-168.8],[193.6,-200.2],[208.1,-210.2],[222.7,-209.6],[234.8,-196.5],[289,-37],[295.5,-30.2],[305.5,-28.1],[318.6,-28.1],[338.2,-16],[350.2,-12.9],[362.8,-13.4],[374.8,-14.5],[387.9,-9.2],[394.4,0.8],[405.9,38.5],[411.4,45.4],[419.5,50.6],[431.5,51.2],[517.9,21.3],[655.5,-46],[746.3,-100.5],[764.4,-115.2],[778.4,-134],[791.5,-160.9],[836.1,-312.5],[839.2,-333],[824.6,-542.4],[820.1,-555.5],[809,-568.5],[622.8,-666.1],[570.6,-689.3],[542,-699.8],[525.9,-702.3],[507.4,-699.2],[494.3,-690.3],[485.7,-680.8],[429.5,-577],[416.4,-552.8],[401.4,-533.5],[241.3,-387.5],[228.2,-369.1],[221.7,-351.3],[207.6,-255.3],[201.6,-236.5],[189.6,-218.5],[175.5,-206],[-54.9,-27.1],[-86.1,-6.6],[-121.2,12.3],[-153.8,28],[-257.7,71.6],[-350.1,114.7],[-575.4,211.2],[-666.9,252.7],[-900.8,352.3]] },
  }
  );
})();
