/* Apex 26 — AUTÓDROMO DO ESTORIL circuit definition (data only).
   Retired circuit (`classic: true`): last Portuguese GP 1996.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "estoril",
    classic: true,
    // Upstream pt-1972 already runs clockwise, matching the racing direction.
    reverse: false,
    // The pit straight is Estoril's long one, famous for the slipstreaming drag
    // to the line, and the trace's first vertex opens it.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches the real T1.
    // Was 0.96, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.96,
    name: "ESTORIL",
    gp: "Portuguese GP",
    country: "Portugal",
    night: false,
    theme: "modern",
    lengthKm: 4.3,
    baseHW: 7,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },
      { kind: "foliage", s0: 0.34, s1: 0.46 },
    ],
    pal: {
      zenith:        [0.24, 0.46, 0.78],
      horizon:       [0.82, 0.82, 0.76],
      sun:           [1.0,  0.96, 0.82],
      sunColor:      [1.0,  0.95, 0.80],
      ambientSky:    [0.54, 0.56, 0.60],
      ambientGround: [0.32, 0.29, 0.22],
      fogColor:      [0.80, 0.80, 0.76],
      fogDensity:    0.0030,
      grass:         [0.31, 0.40, 0.20],
      runoff:        [0.62, 0.52, 0.38],
      sunDir:        [0.40, 0.70, 0.30],
    },
    elevations: [
      { s: 0.09, halfM: 280, rise: 7.0 },
      { s: 0.32, halfM: 320, rise: -8.0 },
      { s: 0.58, halfM: 300, rise: 6.5 },
      { s: 0.84, halfM: 320, rise: -6.0 },
    ],
    hwZones: [
      { s0: 0.190, s1: 0.230, hw: 6.0, ease: 0.012 },
      { s0: 0.480, s1: 0.520, hw: 6.0, ease: 0.012 },
      { s0: 0.760, s1: 0.800, hw: 6.1, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.075, angleDeg: 3.5, widthM: 110 },
      { frac: 0.420, angleDeg: 3.0, widthM: 110 },
      // Parabolica Ayrton Senna — the long final right onto the pit straight.
      { frac: 0.900, angleDeg: 5.0, widthM: 200 },
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.1132, 0.1752, 0.2322, 0.2417, 0.2892, 0.3062, 0.4922, 0.4997, 0.5187, 0.6117, 0.6187, 0.6902, 0.7637],
    furniture: { tree: "broad", fol: [0.29, 0.36, 0.19], lamp: "none", sparse: true, treeCrown: "vase" },  // grey-olive cork oak between the parasol pines
    kit: { marshal: "cabin",     rail: "armco",       fence: "mesh",      tyre: "stack",   board: "trivision", gantry: "box",        camera: "scaffold",  hoarding: "panel" },
    standSet: ["scaffold", "terracotta", "pastel"],  // period tube stands + one masonry terrace
    // Estoril: Atlantic resort town — whitewash and terracotta, low and bright.
    // cityStyle: neon / dayPal name TrackSceneryData.NC / .DC colours
    cityStyle: { neon: ["white", "gold", "teal", "rose"], bias: 0.12, fh: [8, 16], bh: [12, 26],
                 kinds: ["setback", "chevron", "hall", "podium", "dome", "tiered"], neonKinds: [], tone: { n: [0.21, 0.20, 0.18], d: [0.86, 0.82, 0.72] },
                 dayPal: ["white", "cream", "peach", "terra", "sand", "paleblue", "pink"] },
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    // Autódromo do Estoril — Estoril. Upstream pt-1972, stated 4349 m, projected 4171 m, trace winding CCW.
    path: { len: 4171, pts: [[-61.9,-156.5],[109.4,-534.2],[116.5,-541.2],[128.8,-544],[139.5,-541.5],[149.5,-533.6],[184.2,-476.9],[247.2,-421.3],[298,-380.5],[308.4,-367.6],[312.1,-355.7],[310.5,-338.9],[285.1,-253.4],[252.4,-159.8],[244.1,-149.1],[231,-143.3],[214.7,-145.1],[200.7,-153.3],[190.9,-167.5],[187.8,-184.8],[191.2,-216.5],[216.6,-322],[215.3,-335.5],[213.2,-346.8],[204.1,-359.6],[190.7,-366.7],[179.4,-369.1],[162.6,-367],[149.4,-358.2],[139.9,-344.9],[135.6,-331.8],[88.8,-102.1],[84.5,-92],[76.3,-81.3],[-208.1,278.8],[-213.9,292.6],[-213.9,303.6],[-210.8,315.5],[-201.6,329],[-192.4,336.4],[-176.2,342.8],[-159.3,345.8],[-142.2,345.8],[-128.2,342.8],[-112.2,335.8],[-99.7,326.6],[110,65.1],[120.5,58.9],[135.2,55.6],[146.5,56.5],[159.1,60.2],[168.2,66.8],[178.4,77.6],[185.4,92.6],[190.3,109.1],[215.1,318.2],[214.7,331.3],[212.3,344.3],[207.1,357.9],[193.9,371.8],[174.4,384.7],[117.4,406.4],[46.7,426],[14.9,425.1],[-44.1,407.3],[-61.2,406.8],[-75.2,413.3],[-86.9,430.4],[-109.2,492.5],[-122.6,510.9],[-143.8,528],[-164.6,539.1],[-195.5,544],[-220.9,540],[-249.6,528.9],[-272.6,512.1],[-291,491],[-302.9,470.8],[-310.2,442.7],[-312.1,420],[-308.8,393],[-299.2,367.3]] },
  }
  );
})();
