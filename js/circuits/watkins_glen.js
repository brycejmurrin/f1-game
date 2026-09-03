/* Apex 26 — WATKINS GLEN INTERNATIONAL circuit definition (data only).
   Retired circuit (`classic: true`): last United States GP 1980.
   Geometry from the OSM trace in `path` below. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "watkins_glen",
    classic: true,
    // Upstream us-1956 already runs clockwise, matching the racing direction.
    reverse: false,
    startFrac: 0.0,
    name: "WATKINS GLEN",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "green",
    lengthKm: 5.4,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },
      { kind: "foliage", s0: 0.24, s1: 0.34 },
    ],
    pal: {
      zenith:        [0.28, 0.46, 0.72],
      horizon:       [0.76, 0.74, 0.66],
      sun:           [1.0,  0.94, 0.78],
      sunColor:      [1.0,  0.93, 0.76],
      ambientSky:    [0.48, 0.52, 0.56],
      ambientGround: [0.28, 0.26, 0.19],
      fogColor:      [0.72, 0.72, 0.68],
      grass:         [0.20, 0.42, 0.19],
      sunDir:        [0.46, 0.58, 0.36],
    },
    elevations: [
      { s: 0.11, halfM: 320, rise: 9.0 },    // climb out of Turn 1
      { s: 0.30, halfM: 380, rise: -12.0 },  // down through the Esses
      { s: 0.52, halfM: 340, rise: -8.0 },   // into the Boot
      { s: 0.70, halfM: 360, rise: 13.0 },   // the climb back out
      { s: 0.90, halfM: 300, rise: -5.0 },   // drop to the front straight
    ],
    hwZones: [
      { s0: 0.070, s1: 0.115, hw: 6.3, ease: 0.012 },  // Turn 1 / the 90
      { s0: 0.430, s1: 0.480, hw: 6.2, ease: 0.012 },  // the Boot entry
      { s0: 0.880, s1: 0.925, hw: 6.4, ease: 0.012 },  // the Anvil
    ],
    bankZones: [
      { frac: 0.240, angleDeg: 4.5, widthM: 150 },   // the Esses
      { frac: 0.620, angleDeg: 3.5, widthM: 130 },   // Toe of the Boot
      { frac: 0.900, angleDeg: 4.0, widthM: 130 },   // the Anvil
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/rotate-markings.cjs
    // re-seats turns when the start line moves.
    // turns: the N strongest curvature peaks of THIS centreline in lap order, N = the
    // researched real turn count. No researched sectors — consumers fall back to thirds.
    turns: [0.0645, 0.5055, 0.5255, 0.5970, 0.6245, 0.7335, 0.7920, 0.8035, 0.8665, 0.9255, 0.9320],
    furniture: { tree: "broadleafFall", fol: [0.56, 0.30, 0.13], lamp: "none" },  // turning scarlet-brown — the fall reads or it doesn't
    kit: { marshal: "cabin",     rail: "armco",       fence: "mesh",      tyre: "stack",   board: "panel",     gantry: "box",        camera: "lattice",   hoarding: "panel" },
    standSet: ["scaffold", "alu", "concrete"],  // club-built timber/steel, no colour at all
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/import-circuit-path.mjs regenerates it.
    // Watkins Glen International — Dix. Upstream us-1956, stated 5430 m, projected 5454 m, trace winding CCW.
    path: { len: 5454, pts: [[337.5,518.8],[315.7,850.3],[309.7,864.2],[295.6,875.9],[275.1,879.3],[255.8,878.5],[22.1,834.7],[-8.2,821.1],[-34.3,804.3],[-58.2,778.3],[-76.4,748.5],[-87.5,721.5],[-94.8,694.5],[-97.7,674.7],[-104.2,612.4],[-111.8,588],[-122.4,564.2],[-141.1,535.5],[-163.8,511.1],[-238.8,449.5],[-268.6,414.6],[-290.2,383.3],[-306.4,351.3],[-325.6,296.5],[-332.4,251.6],[-335.3,211.3],[-361.4,-567.8],[-359.7,-587.6],[-353.8,-608.3],[-345.5,-625.7],[-333,-643.3],[-318,-658.1],[-295.3,-672.5],[-270.3,-681],[-247,-683.6],[-220.9,-682.4],[-196.8,-675.1],[-172.9,-661.2],[-152.2,-642.7],[13.7,-440.9],[33.5,-429.5],[49.9,-425],[74.1,-425.2],[102,-435.4],[117.5,-448.6],[129.8,-466.2],[135.4,-479.7],[138.2,-511],[122.7,-821.4],[126.3,-837.7],[134.5,-854.8],[143.7,-864.5],[157.8,-873.8],[177.4,-879.3],[197.9,-878.4],[216.9,-870.5],[232,-858.2],[243.9,-840.6],[252.7,-823.6],[255.5,-802.9],[300.7,-267.1],[296.7,-249.5],[286.4,-236.7],[270.6,-226.1],[254.4,-223.6],[231.6,-225.9],[206.4,-233.8],[22.5,-321],[3.4,-322.4],[-11.6,-319.7],[-29.2,-308],[-42.9,-292.6],[-52.5,-271.7],[-53.1,-253.2],[13.1,32.8],[24.1,51.2],[37.4,66.5],[55.6,79.9],[75.2,86.1],[87.5,89.2],[305.8,102.9],[329.1,115],[345.3,133],[358,156.6],[361.4,183.5]] },
  }
  );
})();
