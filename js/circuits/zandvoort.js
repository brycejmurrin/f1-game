/* Apex 26 — ZANDVOORT circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "zandvoort",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.4 m off centreline; = trace vertex 0 (timing line).
    // Was 0.3275. That already measured straight (mean |k| 0.00356 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    // Scenery / exclusions / boards are racing-from-THIS line (pits at 0,
    // Tarzan runoff ~0.04, Hugenholtz stand 0.135, Luyendyk 0.915 — T14
    // apex is 0.9105). The old start was 0.3275. Naming that as
    // sceneryStartFrac added _sceneryShift and parked the pit complex on
    // the Hunserug/Scheivlak stretch — same class as the bankZones bug
    // that put 19° on those sweeps while Hugenholtz ran flat. Do not
    // re-add it.
    name: "ZANDVOORT",
    gp: "Dutch GP",
    country: "Netherlands",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0.25, s1: 0.80, side: 1 },
    ],
    // Hugenholtz + Arie Luyendyk: the two steeply banked corners get a raised
    // outer edge. Anchored to CURATED TURN APEXES, not lap fractions: the
    // fractions these were authored at predate the 7a173519 start-line
    // rotation, and compensating them by `_sceneryShift` landed both bowls on
    // the wrong corners — 19° on Scheivlak and 18° on Hunserug, both fast
    // sweeps, while Hugenholtz (28 m left hairpin) and Luyendyk (the final
    // corner) ran dead flat. Turn indices re-resolve through any future remap.
    // Real angles per circuitzandvoort.nl: Hugenholtz is T3 ("after two turns
    // that go right, the third corner goes left"), max 18°; Arie Luyendyk is
    // T14, the last corner, 15-18° / 32% max gradient.
    banked: true,
    bankZones: [
      { turn: 3,  angleDeg: 18, widthM: 140 },  // Hugenholtz banked LEFT hairpin
      { turn: 14, angleDeg: 19, widthM: 140 },  // Arie Luyendyk banked final RIGHT
      { turn: 1,  angleDeg: 4.0, widthM: 200 },  // Tarzan
      { turn: 7,  angleDeg: 3.0, widthM: 110 },  // Hunserug-side sweep
      { turn: 11, angleDeg: 3.5, widthM: 140 },  // Hans Ernst chicane
    ],
    hwZones: [
      { s0: 0.7310, s1: 0.8081, hw: 6.0, ease: 0.012 },  // arc 0.395-0.432 infield esses
      { s0: 0.0142, s1: 0.0785, hw: 6.0, ease: 0.012 },  // arc 0.748-0.778 Hans Ernst
      { s0: 0.1745, s1: 0.2287, hw: 6.1, ease: 0.012 },  // arc 0.868-0.898 Kumho
    ],
    pal: { zenith: [0.28, 0.41, 0.60], horizon: [0.82, 0.78, 0.70], grass: [0.42, 0.50, 0.25], runoff: [0.60, 0.52, 0.34], fog: [0.74, 0.73, 0.70], fogDensity: 0.0024, sunDir: [0.5597170785495562, 0.6492718111174852, 0.5149397122655918], sun: [1, 0.94, 0.80], sunColor: [1, 0.9, 0.74] },
    elevations: [{ s: 0.56, halfM: 300, rise: 8 }],

    // ── Per-circuit data (this def is its single home; the engine reads it off the built def) ──
    // sectors/turns: curated FIA-aligned sector splits + turn apexes as RACING-LAP
    // fractions (post startFrac/reverse), never fmap'd — tools/track/rotate-markings.cjs
    // re-seats turns when the start line moves.
    sectors: [0.32, 0.68],
    turns: [0.0860, 0.1667, 0.2084, 0.2957, 0.3953, 0.4219, 0.4845, 0.5338, 0.5889, 0.7312, 0.7558, 0.8327, 0.8744, 0.9105],
    furniture: { tree: "fir",   fol: [0.40, 0.45, 0.29], lamp: "none", sparse: true },  // coastal dune scrub — thin + pale
    kit: { marshal: "cabin",     rail: "armco",       fence: "palisade",  tyre: "stack",   board: "banner",    gantry: "box",        camera: "scaffold",  hoarding: "banner" },
    standSet: ["orange", "alu", "scaffold"],  // Oranje army; two-thirds of capacity is trucked in
    // Real centreline: OSM trace (bacinger/f1-circuits, ODbL) — [x,z] metres,
    // recentred, one lap, open loop. tools/track/import-circuit-path.mjs regenerates it.
    path: { len: 4257, pts: [[367.6,35.7],[258.5,298.8],[217.1,395.4],[207.7,406.1],[195,412.1],[181.2,413.9],[168.3,411.2],[156.2,403],[147.8,392.6],[143.3,379.7],[143,365.4],[155,337.5],[189.6,253.5],[200.7,214.4],[205.2,173.6],[202.8,135.4],[206.4,119.8],[214.9,109.4],[231.9,95.6],[250.2,88.3],[300.7,68.7],[313.6,58.9],[317.2,44.5],[317.7,31.5],[312.4,18.2],[302.6,8.8],[290.4,3.8],[271.7,4.2],[179.2,33.7],[136.3,41.7],[99.2,42.9],[66.5,40.5],[35.5,35.2],[13.4,28.4],[-22.7,20.8],[-56.1,17.9],[-79.7,22.8],[-108.2,30.2],[-142.4,47.5],[-182.7,73.7],[-209.9,86.6],[-234.2,93.6],[-266.2,97.1],[-291.4,96.6],[-396.5,90.1],[-420.7,84.6],[-443.2,73.3],[-459.2,59.7],[-469.4,45.1],[-479.4,28.4],[-484.7,9.2],[-486.4,-11.1],[-484.5,-31],[-478.7,-51.2],[-466,-73.2],[-417.7,-139],[-399.9,-168.3],[-359.6,-255.3],[-340.2,-262],[-316.3,-264.8],[-293.4,-263.7],[-266.4,-259.2],[-238.4,-249.6],[-208.5,-235.3],[-178.8,-214.2],[-160.4,-193.8],[-157.1,-181.4],[-160,-168.3],[-171.4,-151.8],[-187.8,-141.4],[-211.7,-132.6],[-252.7,-126.1],[-292.2,-116.2],[-328.2,-102.5],[-348.1,-88.5],[-355.6,-71.7],[-356.7,-53.3],[-350.2,-35.1],[-333.6,-18.6],[-318.6,-13.3],[-241,-3.9],[-162.8,-4.1],[-79.7,-14.1],[-9.4,-31.8],[34.1,-45.5],[82,-63.2],[127.9,-82.7],[165.3,-104.8],[179,-110.7],[188.8,-108.8],[197.9,-96.1],[207.7,-77.7],[221.2,-69.3],[238.4,-68.7],[255.3,-76.6],[264.3,-88.7],[268.4,-101.7],[264.3,-128.1],[226.6,-347.5],[225.8,-362.2],[229.9,-377.2],[236.6,-389.9],[243.1,-398],[259,-408.7],[276.1,-412.6],[348.4,-413.9],[363.1,-413.1],[384.6,-409.7],[406.8,-402.5],[425.1,-394.2],[449.4,-375.1],[465.2,-354],[476,-335.8],[483.9,-311.4],[486.4,-289.9],[484.2,-254.9],[477.5,-230],[373.2,22.6]] },
  }
  );
})();
