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
    segs: [
      { t: 0, l: 260 }, { t: 75, l: 120, b: 0.16 }, { t: -50, l: 90 }, { t: 130, l: 150, b: 0.3 }, { t: 0, l: 180, h: 8 }, { t: 40, l: 110, h: -8 },
      { t: 60, l: 100 }, { t: -50, l: 90, h: 4 }, { t: 70, l: 90 }, { t: -60, l: 90 }, { t: 90, l: 90 }, { t: -50, l: 90 },
      { t: 50, l: 90 }, { t: 160, l: 160, b: 0.31, w: 8 },
    ],
    elevations: [{ s: 0.56, halfM: 300, rise: 8 }],
  }
  );
})();
