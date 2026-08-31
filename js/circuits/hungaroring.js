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
    segs: [
      { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -50, l: 80 }, { t: 60, l: 80 }, { t: 0, l: 200 }, { t: -80, l: 100 },
      { t: 50, l: 80 }, { t: -60, l: 80 }, { t: 60, l: 80 }, { t: 70, l: 90 }, { t: 0, l: 200 }, { t: -90, l: 100 },
      { t: 70, l: 90 },
    ],
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
  }
  );
})();
