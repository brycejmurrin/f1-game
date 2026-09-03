/* Apex 26 — SEPANG INTERNATIONAL CIRCUIT definition (data only).
   Retired circuit (`classic: true`): last Malaysian GP 2017.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "sepang",
    classic: true,
    // Upstream my-1999 runs clockwise, matching the racing direction.
    reverse: false,
    // Sepang's two long straights are separated by the tight T15 hairpin; the
    // shorter of the pair is the pit straight, so the line goes there. Not
    // GPS-calibrated (no OpenF1 coverage for a circuit that left in 2017).
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches the real T1.
    // Was 0.95, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.95,
    name: "SEPANG",
    gp: "Malaysian GP",
    country: "Malaysia",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.90, s1: 0.10 },  // pits + main straight
      { kind: "foliage", s0: 0.30, s1: 0.40 },              // wide open infield
    ],
    // Equatorial haze: white-hot high sun, heavy humidity, saturated jungle.
    pal: {
      zenith:        [0.30, 0.50, 0.76],
      horizon:       [0.86, 0.86, 0.82],
      sun:           [1.0,  0.98, 0.90],
      sunColor:      [1.0,  0.97, 0.88],
      ambientSky:    [0.56, 0.58, 0.60],
      ambientGround: [0.26, 0.28, 0.20],
      fogColor:      [0.82, 0.84, 0.82],
      fogDensity:    0.0034,
      grass:         [0.17, 0.42, 0.17],
      sunDir:        [0.20, 0.90, 0.14],
    },
    elevations: [
      { s: 0.22, halfM: 420, rise: -5.0 },
      { s: 0.46, halfM: 380, rise: 4.5 },
      { s: 0.74, halfM: 460, rise: -4.0 },
    ],
    hwZones: [
      { s0: 0.145, s1: 0.185, hw: 6.8, ease: 0.014 },  // T3-T4
      { s0: 0.560, s1: 0.600, hw: 6.9, ease: 0.014 },  // T9 hairpin
      { s0: 0.865, s1: 0.905, hw: 6.6, ease: 0.012 },  // T15 final hairpin
    ],
    bankZones: [
      { frac: 0.045, angleDeg: 3.5, widthM: 140 },   // T1-T2 loop
      { frac: 0.330, angleDeg: 4.0, widthM: 150 },   // T5-T6 sweep
      { frac: 0.660, angleDeg: 3.0, widthM: 130 },   // T12-T13
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.0712, 0.0822, 0.0997, 0.2457, 0.3632, 0.4257, 0.4437, 0.5312, 0.5537, 0.5967, 0.6552, 0.7027, 0.7207, 0.8852, 0.8947],
    furniture: { tree: "palm",  fol: [0.16, 0.40, 0.18], lamp: "arm",   lc: [1.0, 0.94, 0.72] },  // ordered oil-palm plantation
    kit: { marshal: "kiosk",     rail: "armco",       fence: "mesh",  tyre: "stack",   board: "monopole",  gantry: "portal",     camera: "monopole",  hoarding: "panel" },
    standSet: ["alu", "teal", "concrete"],  // aluminium under the fabric canopies
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    // Sepang International Circuit — Sepang. Upstream my-1999, stated 5543 m, projected 5555 m, trace winding CCW.
    path: { len: 5555, pts: [[240.7,-38.9],[540.8,-63.6],[554.6,-62.5],[567.1,-56.2],[575.6,-47.2],[580.3,-35],[580.9,-21.2],[575.9,-6.7],[564.2,4.2],[548.4,9.2],[529.9,5.6],[495.7,-6.7],[484.2,-4.8],[474.6,4.8],[471.4,16.5],[474.6,31.8],[484.8,47.4],[508.1,76],[518,93.5],[524.5,114.2],[527.6,135],[527.6,158.6],[521.9,216.7],[512.8,244],[498.5,271.8],[484,289.8],[461.8,309.9],[438.4,325.3],[414,334.3],[276.5,379.2],[173.7,419.7],[104.9,449.5],[60.5,469.7],[45.1,475.9],[33.7,475.4],[23.8,469.2],[20.2,456.7],[1.1,350],[-10.6,295],[-27,228.3],[-39,202.6],[-52.5,184.2],[-75.6,165.8],[-98.5,153.5],[-121.3,147.8],[-143.7,146.8],[-169.1,150.7],[-195.1,160.9],[-213.6,174.1],[-249.6,212.7],[-267.3,223.4],[-295.1,233],[-318.8,233.8],[-342.1,230.7],[-361,222.9],[-377.9,209.4],[-579.7,-20.8],[-580.9,-32.1],[-576.2,-44.9],[-541.8,-122],[-531.5,-129.2],[-519.3,-132.1],[-335,-142.8],[-162,-163.1],[-67.2,-178.7],[-58.2,-186],[-55.3,-198.1],[-63.3,-211.7],[-130.9,-249.1],[-145.7,-264],[-156,-286.1],[-161.2,-309],[-160.4,-341.8],[-156,-369.2],[-149.9,-396.1],[-133.8,-430.4],[-109.6,-465.4],[-96.4,-473.8],[-83.7,-475.9],[-69.4,-473.2],[-57.9,-465.8],[153.4,-291.5],[168.2,-286.1],[187.2,-285],[208,-290.2],[285.1,-329.7],[305.7,-336.2],[330.1,-339.5],[351.6,-339.3],[391.6,-332.1],[418.9,-320.8],[436.5,-306.8],[460.2,-275.6],[468.6,-252.2],[469.8,-238],[459.9,-222],[438.6,-213.2],[-399.6,-59],[-411.6,-48.4],[-420.4,-28.2],[-416,-11.2],[-400.7,4.6],[-375.7,8.5]] },
  }
  );
})();
