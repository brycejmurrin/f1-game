/* Apex 26 — NÜRBURGRING (GP-Strecke) circuit definition (data only). Retired circuit (`classic: true`): last hosted the 2020 Eifel GP and is not on the current ca… */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "nurburgring",
    classic: true,
    reverse: false,
    startFrac: 0.02,
    name: "NURBURGRING",
    gp: "Eifel GP",
    country: "Germany",
    night: false,
    theme: "green",
    lengthKm: 5.1,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 100,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.94, s1: 0.10 },  // pit straight + Arena
      { kind: "foliage", s0: 0.60, s1: 0.68 },              // Dunlop-Kehre runoff
    ],
    pal: {
      zenith:        [0.38, 0.48, 0.60],
      horizon:       [0.66, 0.70, 0.72],
      sun:           [0.92, 0.93, 0.92],
      sunColor:      [0.92, 0.93, 0.92],
      ambientSky:    [0.50, 0.54, 0.58],
      ambientGround: [0.26, 0.28, 0.24],
      fogColor:      [0.62, 0.66, 0.68],
      fogDensity:    0.0030,
      grass:         [0.16, 0.36, 0.17],
      sunDir:        [0.50, 0.52, 0.42],
    },
    elevations: [
      { s: 0.18, halfM: 340, rise: -8.0 },   // drop out of the Mercedes-Arena
      { s: 0.42, halfM: 460, rise: -12.0 },  // low ground through the back loop
      { s: 0.66, halfM: 380, rise: 6.0 },    // Dunlop-Kehre rise
      { s: 0.86, halfM: 420, rise: 11.0 },   // climb back to Veedol / the pits
    ],
    hwZones: [
      { s0: 0.100, s1: 0.180, hw: 6.2, ease: 0.012 },  // Mercedes-Arena complex
      { s0: 0.630, s1: 0.690, hw: 6.4, ease: 0.012 },  // Dunlop-Kehre
      { s0: 0.910, s1: 0.955, hw: 6.3, ease: 0.012 },  // Veedol chicane
    ],
    bankZones: [
      { frac: 0.055, angleDeg: 3.5, widthM: 110 },   // Castrol-S
      { frac: 0.300, angleDeg: 4.5, widthM: 140 },   // Ford Kurve
      { frac: 0.520, angleDeg: 3.0, widthM: 120 },   // Bit-Kurve
      { frac: 0.780, angleDeg: 4.0, widthM: 130 },   // Schumacher-S
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.0250, 0.0555, 0.1075, 0.1145, 0.1325, 0.2580, 0.2640, 0.3730, 0.3825, 0.3890, 0.5665, 0.6025, 0.7800, 0.7860, 0.8385, 0.8490],
    furniture: { tree: "fir",   fol: [0.09, 0.27, 0.14], lamp: "none" },  // dark Eifel spruce, bluer than Spa
    kit: { marshal: "bunker",    rail: "doubleArmco", fence: "leaning",   tyre: "stack",   board: "panel",     gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    standSet: ["darkSteel", "concrete", "alu"],  // cold Eifel steel and poured concrete
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    // Nürburgring — Nürburg. Upstream de-1927, stated 5148 m, projected 5141 m, trace winding CCW.
    path: { len: 5141, pts: [[-396,524],[-117.9,240.3],[-60.2,183.5],[-32.4,162],[-5.3,141.9],[55,100.5],[67.6,98.8],[75.7,103.1],[79.7,113.2],[77,127.5],[68.7,159.2],[55.4,187],[28.9,235.2],[26.7,246.6],[27.4,261.1],[32.3,276.9],[43.1,291.6],[54.1,301.3],[67.4,308.1],[82.7,311.2],[93.2,310.7],[157.1,301.3],[186.2,293.4],[212,285.1],[230.9,273.5],[241.4,263.9],[245.9,254],[246.1,239.2],[243,224.8],[230.2,212.7],[213.1,207.7],[182.6,209.2],[165.7,208.6],[155.9,203.9],[146.6,193.2],[144.8,180.7],[147.2,149.9],[152.6,104.1],[165.4,29.8],[172.4,-8],[178.7,-40.4],[184.7,-62.2],[209.8,-138],[232,-211],[239.5,-233.6],[240.8,-245],[241.7,-255.8],[238.5,-269.9],[233.4,-281.9],[225.7,-294.2],[214.5,-305],[206.5,-310.1],[172.9,-326.1],[132.7,-344.6],[121.1,-353.3],[114.8,-363.3],[111.8,-372.2],[111.3,-383],[112.3,-389],[116.1,-402.4],[128.8,-414.6],[179,-441.2],[245.4,-478.7],[277,-499.4],[308.6,-521.9],[357.5,-566.3],[383.4,-591.8],[407.5,-621.6],[430.8,-651.8],[452,-683.2],[490.5,-748.5],[502.7,-760.9],[516.5,-765.9],[528.4,-766.2],[541.6,-762.1],[552.7,-753.8],[560.4,-742.6],[563.2,-729.3],[562.9,-716.5],[557.9,-703.7],[537.6,-683.1],[373.4,-519],[354.1,-499.7],[346.8,-488.3],[340,-472.8],[335.1,-454.7],[334.1,-430.3],[338,-408.6],[349.3,-374.8],[352.1,-357.4],[352.1,-328.7],[347.1,-305.4],[274.8,-79.6],[243.4,18.8],[232.7,57.3],[234.7,70.1],[242.5,85],[248.2,91.3],[255.7,95.5],[379.7,150.3],[393.9,162.6],[401.6,174.7],[405.9,189.2],[406.9,209.2],[403.8,222.4],[396.6,236.9],[379.6,258.8],[274.2,386.3],[169.7,513.6],[158.4,522.6],[144,533.1],[124.5,542.3],[49.3,563.9],[-282.5,651.1],[-286.7,655.1],[-287.2,661.5],[-284.2,672.2],[-281.4,685.1],[-283.7,694.2],[-297.8,702.6],[-354,728.2],[-389.1,738.1],[-509.5,766.2],[-527,766.2],[-543,758.3],[-554.8,745.2],[-560.8,733.3],[-563.2,722],[-563,705.2],[-557.7,689.2],[-398.5,526.6],[-398.5,526.6]] },
  }
  );
})();
