/* Apex 26 — ABU DHABI circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "abudhabi",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.2 m off centreline; = trace vertex 0.
    // Was 0.0750, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.0750,
    name: "ABU DHABI",
    gp: "Abu Dhabi GP",
    country: "UAE",
    night: true,
    theme: "desert",
    lengthKm: 5.3,
    baseHW: 8,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.50, s1: 0.76 },
      { kinds: ["city", "foliage"], s0: 0.76, s1: 0.92 },
      { kinds: ["foliage", "lighting"], s0: 0.44, s1: 0.50 },
      { kinds: ["city", "foliage"], s0: 0.14, s1: 0.23, side: 1 },
      { kinds: ["city", "foliage"], s0: 0.97, s1: 0.08, side: 1 },
      { kind: "lamps", s0: 0.855, s1: 0.895 },
    ],
    pal: { horizon: [0.32, 0.16, 0.08], zenith: [0.10, 0.06, 0.24], sunColor: [0.90, 0.68, 0.38], ambientSky: [0.36, 0.28, 0.24], ambientGround: [0.32, 0.20, 0.12], fogColor: [0.22, 0.12, 0.06], fogDensity: 0.0020, sunDir: [0.55, 0.15, 0.32], concrete: [0.28, 0.27, 0.26], runoff: [0.24, 0.23, 0.22], grass: [0.20, 0.18, 0.14] },
    bankZones: [
      { frac: 0.0425, angleDeg: 3.0, widthM: 180 },   // T1 opening right
      { frac: 0.1509, angleDeg: 3.0, widthM: 120 },   // T2 left
      { frac: 0.5777, angleDeg: 5.0, widthM: 240 },   // the banked long left
      { frac: 0.7453, angleDeg: 3.0, widthM: 110 },   // hotel-section left
      { frac: 0.8446, angleDeg: 3.0, widthM: 100 },   // marina right
      { frac: 0.9500, angleDeg: 2.5, widthM: 90 },    // final left onto the straight
    ],
    elevations: [
      { s: 0.230, halfM: 460, rise: 3.5 },
      { s: 0.635, halfM: 700, rise: 7.5 },
      { s: 0.945, halfM: 300, rise: -1.5 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.32, 0.68],
    turns: [0.0515, 0.0975, 0.2440, 0.2510, 0.4800, 0.4920, 0.6695, 0.6795, 0.7080, 0.7530, 0.7780, 0.8040, 0.8250, 0.8470, 0.9035, 0.9460],
    // Yas Marina: teal / magenta / amber accents on pale rails
    barrier: { a: [0.90, 0.92, 0.94], b: [0.00, 0.72, 0.68], c: [0.92, 0.18, 0.55], night: [0.10, 0.18, 0.22], tyre: [1.00, 0.62, 0.18] },
    furniture: { tree: "palm",  fol: [0.26, 0.42, 0.20], lamp: "arm",   lc: [1.0, 0.82, 0.50] },
    kit: { marshal: "kiosk",     rail: "safer",       fence: "panelled",  tyre: "airfence", board: "led",      gantry: "truss",      camera: "monopole",  hoarding: "led" },
    standSet: ["darkSteel", "teal", "sandstone"],
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 5299, pts: [[13,68.8],[-226.8,101.3],[-239.5,105.5],[-249,115.4],[-255.6,129.1],[-256.8,142.7],[-253.3,156.9],[-214.9,320.1],[-208.3,337.9],[-199.3,351.1],[-184.3,363.7],[-171.7,369.9],[-103.7,391],[-81.1,402.5],[-64.3,414],[-49.1,428.3],[-37.7,441.8],[-29.2,453],[-18.8,477.8],[-15.1,496.6],[-14.8,517.1],[-18.9,541.3],[-26.6,566.8],[-43.5,631.7],[-49.5,679.8],[-50.1,714],[-47.1,743.6],[-28.3,895.9],[-15.9,991.8],[-13.5,1003],[-11.1,1012],[-3.9,1021.2],[8.3,1031.4],[15.7,1033.9],[24.2,1034.8],[32.3,1033.5],[41.1,1030],[47.5,1023.4],[51.5,1017.3],[56.5,1007.1],[71.4,962.8],[85.5,898.7],[205.5,541],[252.3,402.5],[278.2,325.2],[297.7,265.4],[318,191],[360.8,54.1],[401.7,-69.3],[406.4,-81.3],[407.6,-90.3],[406.4,-95.5],[401.9,-100.8],[391.5,-101.1],[353.3,-96.5],[344.9,-96.5],[338.1,-104.7],[316.4,-187],[312,-202.5],[298.3,-236.7],[285.8,-261.2],[259,-300.3],[228.4,-335.9],[189.9,-368.9],[26.7,-497.7],[-10.5,-527.9],[-39.8,-548.8],[-78.9,-574.1],[-112.4,-593.5],[-166.7,-619.6],[-216.2,-641.9],[-289.9,-676.7],[-321.4,-689.4],[-339.1,-689.5],[-357.8,-685.8],[-375,-675.9],[-384.1,-667.1],[-390.2,-658.4],[-396.2,-645.6],[-399.7,-633.1],[-401.7,-621.5],[-400.1,-602.4],[-396.2,-588.5],[-390.8,-575],[-382.8,-563],[-371.4,-552.1],[-357.3,-542.6],[-342.4,-536],[-320.8,-532.9],[-148.9,-519.1],[-127.7,-516.3],[-118.6,-514.3],[-109,-510.9],[-16.7,-453.2],[-7.4,-446.2],[-1.1,-438.2],[5.6,-421],[27.1,-320.5],[25.7,-312.6],[20.7,-307.3],[13.2,-305.2],[-63.4,-293.7],[-72.4,-289.9],[-78.2,-286.9],[-84.3,-280.7],[-90.4,-269.2],[-91.8,-255.1],[-92,-185.5],[-86.4,-173.6],[-79.5,-166.5],[-69.1,-162.4],[-54.8,-159.3],[-42.3,-157.7],[-25.7,-157.1],[-9.3,-158.3],[150.6,-182.9],[164.4,-183.9],[181.9,-183.3],[199,-180.3],[210.8,-176.4],[218.6,-169.2],[226.7,-160.6],[270.5,-80.8],[293.2,-44.2],[298,-33.4],[301.4,-19.1],[302.5,-6.8],[302.7,7.9],[300.2,17.9],[294.4,25.1],[287.1,28.8],[270.3,31.8]] },
  }
  );
})();
