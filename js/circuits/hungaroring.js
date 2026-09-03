/* Apex 26 — HUNGARORING circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hungaroring",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.7 m off centreline; = trace vertex 0.
    // Was 0.9825, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.9825,
    name: "HUNGARORING",
    gp: "Hungarian GP",
    country: "Hungary",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0, s1: 1 },
    ],
    terrainOuter: 90,
    pal: { zenith: [0.55, 0.62, 0.78], horizon: [0.78, 0.72, 0.58], fog: [0.72, 0.68, 0.55], fogDensity: 0.0022, grass: [0.42, 0.40, 0.22], runoff: [0.58, 0.50, 0.34], ambientSky: [0.62, 0.58, 0.50], ambientGround: [0.40, 0.36, 0.28], sunDir: [0.7401805851129838, 0.587790464648546, 0.3265502581380811], sun: [1.0, 0.94, 0.78], sunColor: [1.0, 0.94, 0.78] },
    elevations: [
      { s: 0.00, halfM: 240, rise: 14 },   // SF plateau high
      { s: 0.12, halfM: 340, rise: -22 },  // T1 plunge / T2–4 basin low
      { s: 0.52, halfM: 380, rise: 16 },   // mid-sector climb crest (T10–11)
    ],
    bankZones: [
      { frac: 0.1888, angleDeg: 3.0, widthM: 100 },   // T1 downhill right
      { frac: 0.2961, angleDeg: 3.5, widthM: 150 },   // T2
      { frac: 0.3474, angleDeg: 6.0, widthM: 90 },    // T4 — the banked left
      { frac: 0.5197, angleDeg: 3.0, widthM: 170 },   // hilltop sweep
      { frac: 0.8506, angleDeg: 3.0, widthM: 70 },    // T11
      { frac: 0.9624, angleDeg: 3.5, widthM: 190 },   // final long right
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.32, 0.68],
    turns: [0.0899, 0.1990, 0.2182, 0.2503, 0.3612, 0.4226, 0.4914, 0.5399, 0.5702, 0.6628, 0.7544, 0.8241, 0.8653, 0.8983],
    furniture: { tree: "broad", fol: [0.44, 0.44, 0.19], lamp: "none", sparse: true, treeCrown: "columnar" },  // dry straw-olive, dusty bowl
    kit: { marshal: "hut",       rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    standSet: ["concrete", "sandstone", "steel"],  // poured 1986 terracing; alu reads as steel at distance
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 4381, pts: [[372.9,-276.9],[572.8,-117],[631.9,-70.8],[637.2,-61.9],[640.4,-53],[639.5,-43],[635.5,-35.2],[629.7,-30],[622.1,-26.3],[611,-24.6],[594.6,-24.6],[548.8,-25.7],[518.1,-31],[490.1,-39.3],[460.8,-50.9],[438.5,-63.5],[421.7,-75.1],[258.5,-204.2],[246.6,-210.4],[235,-213.1],[223.5,-213.1],[214.1,-209.9],[203.9,-206.2],[195.9,-200],[189.2,-192.6],[184.8,-185.8],[180.8,-176.4],[179.5,-163.2],[179.9,-155.9],[183.5,-145.9],[186.5,-135.9],[233.2,-56.7],[238.1,-42],[239,-30.4],[236.3,-20.5],[232.8,-7.9],[228.4,3.6],[176.8,106.5],[85.2,291.7],[68.8,321.1],[49.6,346.8],[25.7,374.7],[20.8,382.5],[17.2,390.4],[16.4,399.3],[19,409.3],[60.8,566.7],[61.7,578.7],[60.4,590.3],[57.2,601.9],[52.3,612.9],[43.5,621.8],[32.8,629.7],[21.7,635.4],[10.6,637.5],[-3.2,637.1],[-16.5,633.8],[-32.6,627],[-50.7,615.5],[-63.7,606.6],[-78.8,595.5],[-94.8,583],[-114.8,562],[-200.1,469.6],[-204.1,460.7],[-205.4,453.8],[-205,446.5],[-200.5,440.2],[-193.4,433.5],[-187.6,427.7],[-185.5,422.4],[-185.9,413],[-188.1,402.5],[-219.2,285.4],[-225.9,269.7],[-230.7,263.4],[-235.6,257.7],[-242.3,252.3],[-250.3,249.8],[-265.4,246.7],[-329.9,237.2],[-343.2,232],[-351.6,226.2],[-358.8,220.4],[-365,210.4],[-367.2,201.5],[-369.9,191],[-369.9,179.4],[-367.6,166.8],[-351.6,54.1],[-351.2,34],[-352.5,21.5],[-356.1,8.4],[-361,-4.3],[-424.1,-105],[-430.3,-120.1],[-431.7,-130.7],[-432.1,-140.6],[-430.8,-151.1],[-428.5,-161.7],[-424.1,-171.1],[-417,-180.5],[-308.5,-302.3],[-212.1,-414],[-179.2,-450.8],[-171.2,-455.4],[-163.7,-456.5],[-156.5,-455.4],[-150.3,-451.8],[-144.1,-446.1],[-78.3,-371.5],[-67.6,-361],[-17.4,-320.1],[-8.5,-315.4],[0.3,-311.7],[11,-310.2],[20.4,-311.2],[32.8,-317],[40.3,-325.3],[45.7,-334.3],[48.8,-342.1],[49.6,-352.7],[48.4,-363.2],[43.9,-373.1],[38.2,-381],[-61,-460.8],[-79.2,-477.5],[-84.5,-486.5],[-88.5,-499.1],[-90.3,-513.8],[-89,-527.3],[-84.5,-538.9],[-79.2,-549.9],[-70.8,-559.4],[-57,-568.3],[-42.8,-574.1],[-27.2,-576.2],[-10.8,-574.1],[3.9,-568.3],[17.7,-558.9]] },
  }
  );
})();
