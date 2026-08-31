/* Apex 26 — MONTREAL circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "montreal",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.1 m off centreline, 2 nodes past vertex 0.
    // Was 0.9150. That already measured straight (mean |k| 0.00003 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.0198,
    sceneryStartFrac: 0.9150,
    name: "MONTREAL",
    gp: "Canadian GP",
    country: "Canada",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      // Bespoke parkland below owns Montreal's foliage; avoid a duplicate shared row.
      { kind: "foliage", s0: 0, s1: 1 },
      // Foldbacks need a furniture-free envelope on both sides.
      { kinds: ["lighting"], s0: 0.19, s1: 0.23 },
      { kinds: ["lighting"], s0: 0.69, s1: 0.73 },
    ],
    pal: { zenith: [0.30, 0.50, 0.82], horizon: [0.74, 0.80, 0.86], grass: [0.24, 0.50, 0.20], runoff: [0.18, 0.38, 0.16], fogDensity: 0.0014, sunDir: [0.5134360308102702, 0.6067880364121376, 0.6067880364121376], sun: [1, 0.92, 0.78], sunColor: [1, 0.9, 0.76] },
    segs: [
      { t: 0, l: 380 }, { t: 80, l: 90 }, { t: -90, l: 100 }, { t: 0, l: 300 }, { t: 90, l: 90 }, { t: 0, l: 420 },
      { t: -80, l: 90 }, { t: 60, l: 70 }, { t: -60, l: 70 }, { t: 0, l: 220 }, { t: 100, l: 110 }, { t: -100, l: 110 },
    ],
    bankZones: [
      { frac: 0.2171, angleDeg: 3.0, widthM: 120 },
      { frac: 0.3698, angleDeg: 3.0, widthM: 120 },
      { frac: 0.4443, angleDeg: 3.0, widthM: 110 },
      { frac: 0.6136, angleDeg: 3.0, widthM: 90 },
      { frac: 0.7599, angleDeg: 3.0, widthM: 80 },    // the hairpin
    ],
    elevations: [
      { s: 0.52, halfM: 220, rise: 1.25 },
      { s: 0.115, halfM: 300, rise: 2.2 },
      { s: 0.755, halfM: 260, rise: -1.0 },
    ],
    flatTerrain: true,
    terrainOuter: 70,
  }
  );
})();
