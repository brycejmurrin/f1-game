/* Apex 26 — LAS VEGAS circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "vegas",
    revision: 2,
    reverse: false, // real-world CW/CCW direction
    // Start/finish line. Snapped to the real one: coord 0.3 m off centreline, 1 node before vertex 0 (timing line).
    // A start line is always on a straight: docs/tracks/START-LINES.md.
    startFrac: 0.9899,
    sceneryStartFrac: 0.8575,
    name: "LAS VEGAS",
    gp: "Las Vegas GP",
    country: "USA",
    night: true,
    theme: "street_night",
    lengthKm: 6.2,
    tyreSeverity: 1.05,  // Street thermal stress; below Singapore 1.15 (Pirelli Las Vegas heat notes)
    baseHW: 7,
    street: true,
    // The pit complex (TrackPit): the STREET one on the inside (left), where
    // the purpose-built Paddock Building and this def's paddock kits stand.
    pit: { mode: "street", side: -1 },
    sceneryCoordinates: "racing",
    terrainOuter: 26,
    barrierGap: 1.0,
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.36, s1: 0.47 },
      // Windows are AUTHORED-frame like the row above (TrackSpace.sceneryRange adds
      // _sceneryShift 0.8433); scenery/vegas.js sl(f) = f + 0.1567 is that same map.
      // Hand-built Strip canyon, RACING 0.485-0.815 -> authored 0.642-0.972:
      { kinds: ["city", "foliage"], s0: 0.642, s1: 0.972 },
      // Sphere / Koval, RACING 0.22-0.34 -> authored 0.377-0.497 (overlaps the 0.36-0.47 row):
      { kinds: ["city", "foliage"], s0: 0.377, s1: 0.497 },
      { kind: "lamps", s0: 0.27, s1: 0.36, side: -1 },
      { kind: "lamps", s0: 0.65, s1: 0.71, side: 1 },
    ],
    // Strip streets and parking lots in the Mojave, not lawns: the verge band
    // (pal.runoff, MAT.ROCK at the road edge) is sidewalk/lot concrete, and the
    // ground beyond it (pal.grass under terrainMat SAND, plus the far ground
    // plane, which reads pal.grass) is dusty desert tan. The night pal default
    // grass [0.14, 0.18, 0.14] on MAT.GRASS rendered as green lawn (survey 2026-10-05).
    terrainMat: "SAND",
    pal: { horizon: [0.28, 0.12, 0.32], zenith: [0.08, 0.04, 0.14], sunColor: [0.65, 0.50, 0.88], ambientSky: [0.42, 0.28, 0.50], ambientGround: [0.50, 0.25, 0.38], fogColor: [0.22, 0.10, 0.26], fogDensity: 0.0030, sunDir: [0.75, 0.20, 0.12], runoff: [0.30, 0.29, 0.28], grass: [0.38, 0.33, 0.26] },
    hwZones: [   // s0/s1 are CONTROL-INDEX fractions (def.js applyHwZones); "racing arc" = where the narrowed nodes really sit
      { s0: 0.2164, s1: 0.2374, hw: 6.2, ease: 0.012 },  // racing arc 0.256-0.263 T7
      { s0: 0.3139, s1: 0.4596, hw: 6.1, ease: 0.012 },  // racing arc 0.324-0.367 T9-T10
      { s0: 0.5623, s1: 0.6186, hw: 6.3, ease: 0.012 },  // racing arc 0.510-0.532 T13
      { s0: 0.8221, s1: 0.8832, hw: 6.3, ease: 0.012 },  // racing arc 0.835-0.852 T17
    ],
    // Public roads, so crown rather than banking: 2.5-3° on the sweeps only.
    bankZones: [
      { frac: 0.2080, angleDeg: 3.0, widthM: 190 },
      { frac: 0.2664, angleDeg: 3.0, widthM: 180 },
      { frac: 0.4893, angleDeg: 3.0, widthM: 220 },
      { frac: 0.5949, angleDeg: 2.5, widthM: 130 },
      { frac: 0.6481, angleDeg: 2.5, widthM: 130 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.291, 0.62],   // timing lines snapped onto straights, |k| < 0.0035 (was [0.3, 0.62])
    turns: [0.0513, 0.0653, 0.0868, 0.0928, 0.1093, 0.2588, 0.3003, 0.3328, 0.3398, 0.3638, 0.4383, 0.4913, 0.5223, 0.8388, 0.8443, 0.8558, 0.9898],
    barrier: { a: [0.97, 0.84, 0.12], b: [0.10, 0.10, 0.12], c: [0.85, 0.12, 0.48], night: [0.28, 0.10, 0.32], tyre: [0.97, 0.84, 0.12] },  // casino gold/black + neon magenta
    furniture: { tree: "none",  fol: [0.22, 0.42, 0.18], lamp: "arm",   lc: [1.0, 0.86, 0.55] },
    kit: { marshal: "hut",       rail: "armco",       fence: "chainlink", tyre: "tecpro",  board: "led",       gantry: "portal",     camera: "scaffold",  hoarding: "led" },
    standSet: ["darkSteel", "scaffold", "alu"],
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["mag", "gold", "red", "cyan", "violet", "pink", "orange"], bias: 0.62, fh: [6, 10], bh: [8, 16],
                 kinds: ["setback", "tiered", "podium", "slab", "twin", "jenga", "dome", "fin", "ziggurat", "drum"], neonKinds: ["screen", "clad", "antenna"], tone: null,
                 dayPal: ["charcoal", "graphite", "concrete", "darkglass", "steel", "bluglass", "gold", "bronze", "sand"] },
    // [x,z,y] metres. The plan comes from bacinger/f1-circuits us-2023.geojson (ODbL).
    // At arc fractions i/48, sample the USGS 1 m DEM (epqs.nationalmap.gov/v1/json),
    // subtract the first height, and linearly interpolate onto the plan vertices.
    // Runtime relief is 16.26 m. OpenF1 qualifying session 9640, driver 63, lap 24
    // independently spans 16.3 m and matches the built profile to 1.16 m RMS.
    path: { len: 6221, pts: [[-489.4,-759,0.0],[-544.5,-697.1,-0.66],[-556.2,-684.1,-0.8],[-564.6,-670,-0.93],[-567.3,-653.2,-1.03],[-560.2,-638.1,-1.0],[-548.6,-628.5,-0.98],[-527.8,-620.6,-0.94],[-507.9,-617.3,-0.91],[-488.8,-618.4,-0.88],[-470.9,-623.8,-0.85],[-431.6,-647.3,-0.42],[-395.4,-683.2,0.22],[-381.5,-692.5,0.43],[-351,-699.2,0.81],[-334.5,-698.9,0.89],[-304.8,-688.9,1.06],[-288.3,-679.8,1.16],[-273,-666.8,1.26],[-247.7,-632.6,1.48],[-237.4,-603.6,1.46],[-230.4,255.7,1.27],[-235.7,268.7,1.23],[-246,275.3,1.04],[-423.6,271.9,-1.35],[-476.8,272.3,-1.58],[-504.6,278.7,-1.66],[-515.8,288.4,-1.68],[-547.2,318.9,-1.72],[-561.3,338.8,-1.74],[-572.1,360.3,-1.77],[-579.9,379.1,-1.82],[-584.6,403.5,-1.96],[-587.8,432.6,-2.12],[-587,449.8,-2.22],[-577.2,455.9,-2.28],[-551.5,458.8,-2.42],[-542.5,464.4,-2.48],[-534.8,476.3,-2.56],[-531.7,494.9,-2.66],[-533.2,508.4,-2.73],[-558.1,551.4,-3.0],[-562.4,562.9,-3.07],[-572.8,582.7,-3.19],[-569.1,603.4,-2.98],[-548.8,616.8,-2.72],[-511.2,621,-2.33],[-229.8,628.1,0.33],[-125.8,643.2,1.17],[-91.5,659.8,1.44],[-53.5,698.8,1.48],[-21,763.8,1.41],[28.9,880.7,1.09],[60.9,914.4,1.19],[94.1,937.2,1.39],[127.8,949.6,1.56],[180.6,966.6,1.79],[240.5,978.6,2.03],[248.6,976.6,2.06],[256.5,970.6,2.1],[262.6,950.2,2.19],[268.8,936.2,2.3],[330.9,814.9,3.39],[369.6,742.8,4.26],[389.7,706.2,4.71],[410.4,671,5.17],[446.1,609.1,5.98],[482.8,525.9,6.98],[502.2,463,7.7],[523.6,390.6,8.53],[537.9,338.8,8.98],[548.6,287.3,9.33],[557.1,235,9.67],[566.2,158.5,10.12],[568.4,113.8,10.38],[570.8,60.6,10.35],[569.8,-83.6,10.38],[569.2,-165.9,10.5],[569,-228.4,10.56],[580.9,-554.8,10.86],[584.5,-722.2,11.66],[584.6,-805.8,12.41],[587.8,-906.5,12.97],[582.2,-914.6,13.03],[574.5,-917.3,13.07],[555.9,-917,13.06],[542.3,-922.2,13.05],[511.5,-953,13.0],[484.6,-968.3,12.96],[448.8,-975.3,12.85],[293,-978.6,11.74],[89.1,-976.2,10.02],[-78.6,-977.2,8.24],[-160.5,-976.1,7.34],[-227.6,-966.7,6.58],[-297.7,-953.4,5.78],[-316,-945.1,5.51],[-330.7,-935.8,5.14],[-342.5,-924.7,4.79]] },
  }
  );
})();
