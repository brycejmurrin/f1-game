/* Apex 26 — INDIANAPOLIS MOTOR SPEEDWAY (road course) definition (data only). Retired circuit (`classic: true`): last United States GP 2007. This is the F1 ROAD C… */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "indianapolis",
    classic: true,
    // Upstream us-1909 already runs clockwise, matching the F1 lap.
    reverse: false,
    // The 647 m run opening the trace is the oval front straight — the pit
    // straight for the Grand Prix — and its first vertex is the line.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches the real T1.
    // Was 0.05, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.05,
    name: "INDIANAPOLIS",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "modern",
    lengthKm: 4.2,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 90,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.86, s1: 0.22 },
      { kind: "foliage", s0: 0.30, s1: 0.70 },
    ],
    // Flat Midwestern summer: high hazy sun, humid white horizon.
    pal: {
      zenith:        [0.28, 0.48, 0.76],
      horizon:       [0.84, 0.84, 0.80],
      sun:           [1.0,  0.97, 0.86],
      sunColor:      [1.0,  0.96, 0.84],
      ambientSky:    [0.54, 0.56, 0.60],
      ambientGround: [0.28, 0.28, 0.24],
      fogColor:      [0.82, 0.82, 0.80],
      grass:         [0.24, 0.44, 0.20],
      sunDir:        [0.34, 0.78, 0.26],
    },
    elevations: [
      { s: 0.40, halfM: 300, rise: 1.8 },
      { s: 0.68, halfM: 280, rise: -1.5 },
    ],
    hwZones: [
      { s0: 0.240, s1: 0.700, hw: 6.4, ease: 0.020 },
      { s0: 0.760, s1: 0.820, hw: 6.6, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.115, angleDeg: 9.0, widthM: 320 },
      { frac: 0.880, angleDeg: 6.0, widthM: 200 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.1449, 0.1684, 0.2419, 0.2569, 0.2959, 0.3459, 0.3539, 0.3974, 0.4114, 0.5509, 0.5924, 0.6059, 0.6394],
    furniture: { tree: "broad", fol: [0.22, 0.42, 0.19], lamp: "post",  lc: [0.94, 0.96, 1.0] },  // clipped infield planting + service lighting
    kit: { marshal: "tower",     rail: "safer",       fence: "chainlink", tyre: "stack",   board: "tower",     gantry: "truss",      camera: "lattice",   hoarding: "double" },
    standSet: ["alu", "scaffold", "navy"],  // bare bleachers; navy nods to the blue seat bands
    // Speedway apron: red brick, steel sheds, water towers. Midwest, not modern.
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["white", "red", "gold", "blue"], bias: 0.10, fh: [7, 15], bh: [11, 24],
                 kinds: ["hall", "slab", "chevron", "drum", "setback", "cross"], neonKinds: [], tone: { n: [0.19, 0.16, 0.15], d: [0.66, 0.52, 0.44] },
                 dayPal: ["brick", "white", "steel", "terra", "stone", "concrete", "paleblue"] },
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    // Indianapolis Motor Speedway — Indianapolis. Upstream us-1909, stated 4192 m, projected 4088 m, trace winding CCW.
    path: { len: 4088, pts: [[334,-169.5],[340.8,477.6],[338.1,487.5],[333.3,492.5],[325.2,495],[306.5,495.4],[277.6,495.3],[266.2,496.9],[255.8,500.9],[247.3,505.7],[238.7,515.5],[233.1,527.7],[231.7,539.3],[232.4,551.8],[235.7,587.3],[235.7,599.6],[234.3,611.5],[228.7,632.8],[217.4,656.4],[204.2,674.2],[194.2,683.9],[178.3,695.8],[148.3,710.9],[112,727.5],[103,730],[91.5,729.3],[82.6,726],[65.9,714.6],[53.7,699.5],[49.8,692.4],[45.4,680.2],[44.1,669.4],[43.2,638.4],[43.1,592.6],[42.1,557.9],[43.1,548.6],[46.7,536.5],[53.2,523.6],[63.2,512.9],[184.3,425.9],[196.3,412.6],[203.4,395.5],[204,386.3],[202,371.2],[198.6,360.8],[188,347],[178.5,338.1],[168.5,332],[155.1,327],[142.2,325.6],[128.7,326.1],[111.6,331],[70.5,359.2],[61.1,364.1],[52.1,365.7],[43.2,365.2],[29.9,358.8],[18.5,347.8],[7.8,328.6],[4.1,317.5],[3,307],[-2.6,-214],[-4.4,-226.7],[-5.8,-229.7],[-10.1,-239.4],[-18.4,-250.3],[-30.1,-260.7],[-36.3,-264.2],[-50.8,-269.9],[-61.9,-272.1],[-71,-273.2],[-106.9,-271.1],[-122.9,-270.6],[-134.8,-272.2],[-148.2,-278.1],[-155.6,-283.1],[-163,-290.7],[-167.2,-297.5],[-171.1,-307.5],[-173.9,-318],[-178.5,-327.9],[-183.3,-335.2],[-190.7,-341.2],[-199.2,-345.5],[-207.5,-348.2],[-215.6,-349.3],[-229.4,-349.5],[-302.4,-344.5],[-312,-347.1],[-321,-353.5],[-325.3,-360],[-329.3,-367.7],[-337,-393.9],[-340.8,-419],[-340.6,-433.2],[-339.5,-446.3],[-330.8,-503.8],[-319.7,-578.7],[-314.6,-595.1],[-308.3,-613.2],[-293.2,-637],[-276.6,-658.8],[-260.2,-674.4],[-232.1,-693.1],[-201,-706.8],[-177.9,-713.3],[-148.4,-717.7],[-69.1,-724],[32.7,-728.5],[92.2,-730],[115.1,-727.4],[139.1,-722.4],[156.2,-717.2],[166.8,-712.8],[195.7,-699],[213.9,-688.1],[243.8,-665.3],[261.4,-646],[271.1,-635.9],[284.3,-618.9],[306,-583.5],[319.8,-547.7],[327,-511.3],[329.2,-490.9],[331.4,-459.9]] },
  }
  );
})();
