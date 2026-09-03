/* Apex 26 — SILVERSTONE circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "silverstone",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.2 m off centreline at the Wing; vertex 0 is the OLD National pit straight, 1.3 km away.
    // Was 0.6400, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.5224,
    sceneryStartFrac: 0.6400,
    name: "SILVERSTONE",
    gp: "British GP",
    country: "UK",
    night: false,
    theme: "green",
    sceneryTheme: "permanent",
    lengthKm: 5.9,
    sunAzimBias: 0.28,   // high-summer northern sun, gentle SW tilt over the old airfield
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    flatTerrain: true,
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0.18, s1: 0.28 },
      { kinds: ["foliage"], s0: 0.42, s1: 0.52, side: 1 },
    ],
    // British overcast (ATM.britishOvercast) — pale grey-blue sky, lush grass, soft fog.
    pal: { zenith: [0.55, 0.62, 0.72], horizon: [0.72, 0.76, 0.82], grass: [0.16, 0.40, 0.18], runoff: [0.48, 0.46, 0.42], fog: [0.68, 0.72, 0.78], fogDensity: 0.0020, sunDir: [0.42010419876354255, 0.5521369469463703, 0.7201786264517872], sun: [0.92, 0.94, 0.96], sunColor: [0.92, 0.94, 0.96], ambientSky: [0.58, 0.62, 0.70], ambientGround: [0.30, 0.34, 0.28] },
    // Source-trace fractions mapping to racing s≈0.12 (rise) and s≈0.55 (dip).
    elevations: [
      { s: 0.76, halfM: 420, rise: 7 },
      { s: 0.19, halfM: 480, rise: -7 },
    ],
    bankZones: [
      { frac: 0.0267, angleDeg: 4.0, widthM: 110 },   // Copse
      { frac: 0.2122, angleDeg: 3.5, widthM: 190 },   // Becketts
      { frac: 0.3723, angleDeg: 4.5, widthM: 150 },   // Stowe
      { frac: 0.5359, angleDeg: 3.5, widthM: 150 },   // Vale/Club
      { frac: 0.7064, angleDeg: 4.0, widthM: 200 },
      { frac: 0.8001, angleDeg: 3.5, widthM: 200 },   // Luffield
      { frac: 0.9199, angleDeg: 3.0, widthM: 100 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.3, 0.62],
    turns: [0.0701, 0.1098, 0.1536, 0.1769, 0.2104, 0.3412, 0.3624, 0.3815, 0.4199, 0.4418, 0.5253, 0.6321, 0.6608, 0.6861, 0.7115, 0.8566, 0.9387, 0.9805],
    furniture: { tree: "broad", fol: [0.28, 0.45, 0.22], lamp: "none", treeCrown: "vase" },  // English oak copses, mid-green
    kit: { marshal: "cabin",     rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "truss",      camera: "lattice",   hoarding: "panel" },
    standSet: ["navy", "steel", "alu"],  // Silverstone blue
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    path: { len: 5879, pts: [[-97.6,840.8],[-284.3,857],[-317.5,855],[-343,846.5],[-359.6,835.5],[-379.5,812.5],[-392,786.3],[-402.1,753.3],[-416.4,697.3],[-430.9,642.3],[-439.4,581.5],[-443.1,543.3],[-447.9,450.6],[-450,371.5],[-453.2,340.6],[-465,311.7],[-487.2,271.3],[-496.6,248.3],[-496.2,231],[-492,210.7],[-460.5,127.3],[-458.5,93.7],[-463.3,69.7],[-474.7,49.3],[-505.9,5.8],[-513.1,-14.2],[-513.9,-37.7],[-508.7,-59.2],[-489.7,-82.7],[-465.4,-100.1],[-432.1,-119.4],[-406.2,-134.6],[-388,-152.4],[-367,-187.5],[-325.6,-265],[-98.4,-682.5],[-23.9,-798.3],[-2.8,-826.7],[14.2,-841.8],[34,-851.8],[54.7,-857],[73.7,-855.4],[94.8,-850.7],[112.6,-842.9],[128.4,-830.3],[141.8,-810.3],[145.8,-802.5],[166.1,-758.5],[188.7,-719.2],[213,-686.7],[229.6,-666.8],[248.2,-646.4],[281.1,-612.8],[354.4,-525.4],[361.7,-520.7],[371.8,-519.6],[381.9,-524.4],[412.7,-552.2],[423.2,-555.8],[433.7,-554.7],[442.6,-551],[455.2,-539],[468.6,-525.4],[485.2,-503.4],[497.3,-479.8],[505.9,-455.7],[513.1,-428.5],[513.9,-417.5],[511.9,-406.5],[505.9,-396],[491.3,-372.9],[267.7,-81.7],[217.5,-17.3],[207,-5.2],[188.7,6.8],[166.9,12.1],[149,12.6],[124.3,10.5],[55.5,0.1],[32.8,-2.6],[9.3,-3.6],[-17.4,0.1],[-41.7,6.3],[-63.6,18.4],[-206.2,131.5],[-215.5,137.7],[-226.8,143.5],[-238.5,144.6],[-247.4,141.4],[-255.6,134.1],[-260.4,125.7],[-284.7,40.8],[-292,28.8],[-302.1,21.5],[-313.9,20.9],[-326.9,26.7],[-334.9,37.2],[-340.2,48.2],[-350.3,76],[-358.4,99.5],[-364.5,122.6],[-367.7,145.1],[-369.8,168.8],[-368.1,193.3],[-363.3,204.3],[-350.7,218.4],[111.4,639.6],[123.9,647.5],[141.4,656.4],[162.8,659.5],[185.1,657],[207.7,646],[215.9,636],[221.6,621.3],[230.9,544.8],[236.1,529.2],[247.4,516.5],[264.5,508.2],[283.1,505.5],[303.7,510.8],[318.3,520.7],[327.2,532.3],[334.1,545.8],[335.4,560.5],[332.5,576.3],[321.2,601.9],[261.7,719.7],[242.6,742.3],[224,761.2],[197.2,784.2],[175.4,799.4],[147.8,811],[123.9,818.8],[73.3,825.1]] },
  }
  );
})();
