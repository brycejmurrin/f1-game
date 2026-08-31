/* Apex 26 — IMOLA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "imola",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 6.3 m off centreline; = trace vertex 0 (timing line).
    // Was 0.4950, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.4950,
    sceneryCoordinates: "racing",
    name: "IMOLA",
    gp: "Emilia Romagna GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 4.9,
    baseHW: 7,
    terrainOuter: 120,
    dressingExclusions: [
      // Bespoke parkland and selective lamps below own the full circuit.
      { kinds: ["foliage", "lighting"], s0: 0, s1: 1 },
    ],
    pal: { zenith: [0.24, 0.44, 0.74], horizon: [0.80, 0.72, 0.56], grass: [0.24, 0.46, 0.16], runoff: [0.44, 0.42, 0.36], sunDir: [0.7874615506676528, 0.5468482990747588, 0.2843611155188746], sun: [1, 0.9, 0.65], sunColor: [1, 0.88, 0.62] },
    segs: [
      { t: 0, l: 450 }, { t: 90, l: 100 }, { t: -60, l: 90 }, { t: 0, l: 300 }, { t: 70, l: 90 }, { t: -60, l: 80 },
      { t: -80, l: 100 }, { t: 0, l: 400 }, { t: -80, l: 100 }, { t: 60, l: 80 }, { t: 0, l: 180 }, { t: -80, l: 90 },
      { t: 100, l: 110 },
    ],
    elevations: [
      { s: 0.835, halfM: 380, rise: 14 },
      { s: 0.975, halfM: 260, rise: -10 },
      { s: 0.135, halfM: 360, rise: 16 },
      { s: 0.295, halfM: 320, rise: -14 },
    ],
    bankZones: [
      { frac: 0.1905, angleDeg: 3.0, widthM: 60 },    // Villeneuve/Tosa link
      { frac: 0.3440, angleDeg: 4.0, widthM: 90 },    // Piratella
      { frac: 0.3703, angleDeg: 3.5, widthM: 90 },    // Acque Minerali
      { frac: 0.7874, angleDeg: 4.0, widthM: 70 },    // Rivazza 1
      { frac: 0.8456, angleDeg: 4.0, widthM: 110 },   // Rivazza 2
      { frac: 0.9737, angleDeg: 3.0, widthM: 120 },   // final sweep to the line
    ],
  }
  );
})();
