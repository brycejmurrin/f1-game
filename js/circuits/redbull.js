/* Apex 26 — RED BULL RING circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "redbull",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 2.3 m off centreline; = trace vertex 0 (timing line).
    // Was 0.1875, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    // No sceneryStartFrac: the dressing is authored against THIS line. The Wing,
    // motorhomes and paddock towers sit at K(0)±0.04 and the T1 tyre wall at
    // 0.08-0.13 (T1 apex 0.0851). The old 0.1875 (shift 0.295) stood the paddock
    // at Remus and grew 105 trees along the pit lane — docs/notes/DEFECT-LEDGER.md.
    sceneryCoordinates: "racing",
    // The Wing (K(0), right, 38 m: behind the garages, pit side +1) and the
    // pit-straight stands (left, opposite the pits, as at the real ring) own
    // this straight; the engine's generic 7-box stand (k 0-24, left, 14 m)
    // stood inside the Wing: a 4.00 m / 1005 m3 box-vs-box clip at frac 0.000.
    ownPitStraight: true,
    name: "RED BULL RING",
    gp: "Austrian GP",
    country: "Austria",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    // TYRE SEVERITY: what the SURFACE and the speeds do to a tyre, on top of the
    // work the LAYOUT already makes it do (js/physics/tyre-model.js derives that
    // emergently from the forces the car made). Real 2026 rate / the 0.0493 s/lap
    // mean of the seven measured circuits — docs/research/TYRE-STRATEGY-DESIGN.md §5.5.
    tyreSeverity: 1.97,  // Austria 0.097 s/lap — the calendar's outlier, on a layout that emerges LOW
    baseHW: 7,
    terrainOuter: 48,
    dressingExclusions: [
      // Preserve clean sightlines to The Wing, the bull plaza and pit gantries.
      { kinds: ["foliage", "lighting"], s0: 0.96, s1: 0.14 },
      // Bespoke stands and forest rims own the Remus amphitheatre.
      { kind: "foliage", s0: 0.18, s1: 0.38, side: 1 },
    ],
    pal: { zenith: [0.22, 0.48, 0.82], horizon: [0.55, 0.72, 0.88], grass: [0.14, 0.44, 0.18], runoff: [0.34, 0.50, 0.26], fogDensity: 0.0016, sunDir: [0.59693248550091, 0.6446870843409829, 0.47754598840072804], sun: [1, 0.96, 0.84], sunColor: [1, 0.96, 0.88] },
    // Engine-frame fractions (post-startFrac arc), re-keyed when the 0.1875
    // sceneryStartFrac went: an elevation read as (s - 0.1875) + 0.2952 and a
    // bank as frac + 0.2952, so each now carries that offset and the road
    // surface is unchanged (banks bit-identical; py within the 0.21 m the
    // shift-phased ripple moves). WHERE they land is a separate question: the
    // old "T1 climb / Remus crest" labels never matched — the bumps sit at
    // 0.415 / 0.515 / 0.715 and each bank on a curated apex (turns[i] noted).
    elevations: [
      { s: 0.41525, halfM: 360, rise: 22 },
      { s: 0.51525, halfM: 430, rise: 32 },
      { s: 0.71525, halfM: 430, rise: -28 },
    ],
    bankZones: [
      { frac: 0.49135, angleDeg: 4.0, widthM: 260 },  // turns[2] 0.4913 Schlossgold
      { frac: 0.60245, angleDeg: 4.0, widthM: 180 },  // turns[3] 0.6024
      { frac: 0.67625, angleDeg: 4.0, widthM: 160 },  // turns[5] 0.6752
      { frac: 0.73225, angleDeg: 3.0, widthM: 120 },  // turns[7] 0.7322
      { frac: 0.85265, angleDeg: 3.5, widthM: 110 },  // turns[8] 0.8526
      { frac: 0.90495, angleDeg: 3.5, widthM: 90 },   // turns[9] 0.9049
    ],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.3, 0.62],
    turns: [0.0851, 0.3036, 0.4913, 0.6024, 0.6267, 0.6752, 0.6958, 0.7322, 0.8526, 0.9049],
    furniture: { tree: "fir",   fol: [0.17, 0.40, 0.22], lamp: "none" },  // lush emerald alpine spruce
    kit: { marshal: "cabin",     rail: "armco",       fence: "mesh",   tyre: "stack",   board: "banner",    gantry: "portal",     camera: "monopole",  hoarding: "banner" },
    standSet: ["crimson", "steel", "alu"],
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 4307, pts: [[-235.4,-377.5],[-149.1,-400.5],[64.8,-458.7],[79.5,-459.8],[89.4,-450.9],[105.9,-418.8],[158.3,-348],[215.2,-267.2],[259.8,-195.9],[300.6,-125.5],[367.3,19.9],[385.6,58.6],[413.8,104.3],[457.2,157.4],[529.3,229.7],[596,296.4],[600,305.3],[599.5,314.8],[591.9,319.4],[574.4,322.6],[519.8,328.9],[465.2,331],[408.8,330.5],[355.2,325.2],[292.9,315.2],[102.8,278.5],[16,267],[-171.5,259.1],[-186.7,253.9],[-196.1,243.4],[-199.7,231.8],[-198.8,219.7],[-193.9,208.2],[-175.1,181.4],[-160.3,163.6],[-133,139.4],[-103.1,123.2],[-66.8,111.2],[-27.4,104.8],[13.8,107.5],[173.5,133.2],[195,130.5],[212.4,124.3],[227.6,113.7],[241.1,99.6],[249.6,82.8],[254.1,64.4],[254.9,47.6],[252.3,29.2],[247.4,15.6],[169.9,-119.7],[156.9,-134],[136.4,-147],[112.6,-152.3],[89.8,-150.2],[65.7,-140.2],[50.9,-128.2],[35.7,-109.3],[21.4,-90.9],[6.1,-75.2],[-12.2,-62.6],[-33.7,-49.9],[-63.7,-38.9],[-95,-32.1],[-342.9,-26.9],[-533.5,-22.2],[-553.6,-22.6],[-573.3,-29.6],[-589.5,-41.6],[-602.4,-57.8],[-612.2,-79.3],[-651.2,-210.6],[-653.4,-222.6],[-651.2,-231.5],[-646.7,-238.4],[-631.5,-250.4],[-611.4,-262.4],[-585.4,-275.6],[-555.9,-288.1],[-521,-299.7]] },
  }
  );
})();
