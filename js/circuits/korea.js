/* Apex 26 — KOREA circuit definition (data only). Retired circuit (`classic: true`).
   Korean GP 2010-2013. Tilke layout on reclaimed land by the Yeongam tidal flats; runs anti-clockwise.

   Centreline: OpenStreetMap (ODbL-1.0), stitched by tools/track/stitch-osm-ring.mjs
   and projected by tools/track/import-circuit-path.mjs. The bacinger/f1-circuits
   file the other 40 circuits come from carries exactly 40 features and the game
   already had all of them, so this one had to be recovered from OSM directly —
   tools/track/osm-circuits.json holds the bbox and the researched lap length,
   and re-running the stitch reproduces this trace.
   Stitched 5615 m researched vs 5613 m projected (-0.04%). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "korea",
    // The pit complex (TrackPit) on the LEFT of the main straight, the side
    // scenery/korea.js builds its pit wall, garages and paddock on (harbour
    // side; the main grandstand faces it from the right). Without this the
    // engine built lane and garages on the default right, under the stand.
    pit: { side: -1 },
    classic: true,
    // Projected trace winding is CCW for a clockwise circuit — the x axis is
    // negated by the projection, so it mirrors handedness. Calibrated against
    // monza/suzuka/zandvoort (all real-CW, all projected CCW, all reverse:false).
    reverse: false,
    // Yeongam is reclaimed tidal flat at sea level: the SRTM bake
    // (node tools/gen/bake-elevation.mjs korea) measured 0.00 m of relief over
    // the whole lap and correctly declined to write a profile. So this is the
    // one circuit that takes the engine's undulation opt-out — without it
    // buildCenterline still laid its 0.14 m procedural ripple under a scenery
    // header that says "dead flat".
    undulate: false,
    // v0 sits mid the longest straight, placed by the stitcher. Not yet checked
    // against the real start/finish line — see docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    name: "KOREA",
    gp: "Korean GP",
    country: "South Korea",
    night: false,
    // "green", NOT "modern". `theme: "modern"` is not a palette hint — it puts
    // tracks.js's GENERIC SKYLINE EMITTER (the street_day/street_night/modern
    // branch) around the whole lap, ringing Yeongam in tower blocks. The real
    // circuit sits on reclaimed tidal flats beside an unfinished marina: the
    // emptiness IS the venue, and its own scenery() authors that backdrop
    // (channel beacon, shuttered podiums, the stalled waterfront).
    theme: "green",
    lengthKm: 5.613,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    pal: {
      zenith:        [0.28, 0.42, 0.60],
      horizon:       [0.66, 0.68, 0.68],
      sun:           [0.96, 0.92, 0.84],
      sunColor:      [0.94, 0.90, 0.82],
      ambientSky:    [0.48, 0.52, 0.56],
      ambientGround: [0.26, 0.26, 0.24],
      fogColor:      [0.64, 0.66, 0.66],
      fogDensity:    0.0022,
      grass:         [0.47, 0.49, 0.39],
      runoff:        [0.40, 0.41, 0.42],
      sunDir:        [0.56, 0.62, 0.40],
    },

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the 18 strongest curvature peaks of THIS centreline in lap order,
    // 18 being the researched real turn count. No researched sectors — consumers
    // fall back to thirds.
    sectors: [0.334, 0.68],  // ~1/3 and ~2/3, each snapped to the nearest straight (2026-10-04) — not FIA-published splits
    turns: [0.0653, 0.0823, 0.2998, 0.4298, 0.4572, 0.4748, 0.5487, 0.5893, 0.6292, 0.6627, 0.7103, 0.7228, 0.7378, 0.7602, 0.7973, 0.8387, 0.8642, 0.8848],
    // tree "none": the brief's identity is bare salt fill. "broad" asked the
    // generic scatter for a tree line the engine then dropped (131 of them).
    furniture: { tree: "none", fol: [0.24, 0.40, 0.22], lamp: "none", lc: [0.90, 0.96, 1.0] },
    kit: { marshal: "kiosk", rail: "wArmco", fence: "panelled", tyre: "stack", board: "monopole", gantry: "truss", camera: "monopole", hoarding: "panel" },
    standSet: ["alu", "steel", "darkSteel"],
    // Colinear sample 40 m before the 682 m chord into Turn 4. Clears the fold
    // at s 0.428. Apexes stay within 0.5 m. The other four folds do not clear
    // inside the 2 m budget.
    // +18 chord control points (2026-10 TE-1): short-spaced points 20-90 m either side of the tight hairpins so the
    // uniform Catmull-Rom stops overshooting (node radius korea 2.2 m / buddh 4.8 m / bahrain 5.2 m before; tools/track/verify-track.cjs).
    path: { len: 5613, pts: [[-233.9,-430],[-562.5,-554.5],[-609.2,-572.3],[-637.3,-582.9],[-646.9,-584],[-653.6,-578.9],[-655.8,-570.4],[-656.4,-545.4],[-657,-520.4],[-657.6,-492.6],[-654.2,-477.4],[-644.4,-463.9],[-622.5,-443.4],[-586.1,-409.1],[149.1,281.3],[185.5,315.6],[207.4,336.1],[210.7,339.7],[212.8,349],[207.5,356.9],[201.8,358.7],[171.9,360.7],[122,364],[-358.9,396.2],[-408.8,399.5],[-438.69,401.53],[-478.6,404.2],[-492,409.7],[-499.3,417.6],[-502.4,428.7],[-499.7,438.8],[-494.1,447.6],[-482.8,454.2],[-390.9,468.5],[-383.6,470.9],[-377.5,476.4],[-373.9,483.9],[-374.2,492.4],[-398.1,556.8],[-399.6,565.9],[-393.8,578.9],[-384.4,584],[-237.9,578.5],[-188.8,571],[-154,562],[-116.7,549.4],[-26.8,505.3],[-5.2,500.8],[6.7,501.4],[27,506.8],[111.8,554.6],[130.1,562.1],[148.9,566.6],[168.1,568.1],[202.8,563.5],[218.4,557.5],[232.7,550],[371.1,455.7],[383.3,442.5],[388.4,433.7],[392.8,422.9],[394.2,400.6],[380.7,347],[369.8,303.3],[363.7,279.1],[358.8,259.7],[358.9,251],[361.6,246.9],[376.1,242.3],[396.1,242.5],[421.1,242.7],[466.1,243.1],[494.9,243.3],[591.9,229],[612.9,220.5],[629.4,208.7],[648.7,183.5],[655.8,162.7],[657.6,149.6],[656.3,129],[649.2,95.4],[640.3,79.8],[627.6,68.1],[611.2,59.9],[593.9,57.6],[567.3,58.7],[556.3,56.5],[535.4,43.2],[522.2,22.1],[518.3,-1.2],[536.6,-138],[533.9,-165],[524.9,-179.8],[515.8,-187.8],[341.9,-278],[334.8,-285.4],[329.8,-299.1],[329.7,-308.3],[342.9,-357.6],[346.7,-393],[346.6,-418.4],[344.9,-425.3],[338.1,-434.3],[328.1,-439.4],[311.5,-438.6],[229.7,-426.2],[221.8,-419.9],[194.6,-357.9],[181.8,-336.3],[173.2,-326],[149.9,-306.4],[137.6,-300.5],[110.6,-292.1],[92,-290.7],[78.7,-291.2],[60.4,-295.5],[40,-304.2],[21.8,-315.3],[-0.6,-337.3],[-13.6,-346.5],[-241.4,-432.9]] },
  }
  );
})();
