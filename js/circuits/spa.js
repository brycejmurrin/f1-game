/* Apex 26 — SPA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "spa",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.9 m off centreline; = trace vertex 0.
    // Was 0.9875, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.9875,
    name: "SPA",
    gp: "Belgian GP",
    country: "Belgium",
    night: false,
    theme: "green",
    lengthKm: 7,
    sunAzimBias: 0.44,   // afternoon sun swings SW over the Ardennes ridge — long shadows down the Kemmel straight
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 90,
    dressingExclusions: [{ kind: "foliage", s0: 0, s1: 1 }],
    // Cool damp Ardennes overcast (ATM.dampArdennes) — grey sky/fog, no warm sun.
    pal: { zenith: [0.42, 0.48, 0.52], horizon: [0.58, 0.62, 0.64], grass: [0.14, 0.28, 0.16], runoff: [0.40, 0.38, 0.34], fog: [0.55, 0.60, 0.62], fogDensity: 0.0032, sunDir: [0.7141470886878855, 0.44326371022006683, 0.5417667569356373], sun: [0.88, 0.90, 0.92], sunColor: [0.88, 0.90, 0.92], ambientSky: [0.50, 0.54, 0.58], ambientGround: [0.28, 0.30, 0.26] },
    segs: [
      { t: 0, l: 120 }, { t: 170, l: 80, h: -4 }, { t: 0, l: 140, h: -18 }, { t: -40, l: 60, h: 6 }, { t: 50, l: 60, h: 14 }, { t: -30, l: 80, h: 16 },
      { t: 0, l: 480, h: 18 }, { t: 70, l: 90 }, { t: -60, l: 90, h: -6 }, { t: 50, l: 140, h: -12 }, { t: -90, l: 160, h: -10 }, { t: 40, l: 90 },
      { t: -50, l: 90 }, { t: 70, l: 110 }, { t: 0, l: 320, h: -6 }, { t: -30, l: 180 }, { t: 80, l: 70 }, { t: -85, l: 70 },
      { t: 30, l: 120 },
    ],
    elevations: [
      { s: 0.075, halfM: 360, rise: -18 }, // Eau Rouge compression
      { s: 0.155, halfM: 920, rise: 84 },  // Raidillon crest / Kemmel plateau
      { s: 0.46, halfM: 760, rise: 24 },   // rolling high ground before the descent
      { s: 0.72, halfM: 680, rise: -18 },  // Stavelot valley
    ],
    bankZones: [
      { frac: 0.1854, angleDeg: 5.0, widthM: 130 },   // Raidillon
      { frac: 0.3685, angleDeg: 3.0, widthM: 80 },    // Les Combes
      { frac: 0.4531, angleDeg: 4.0, widthM: 170 },   // Bruxelles
      { frac: 0.5648, angleDeg: 6.0, widthM: 160 },   // Pouhon
      { frac: 0.6626, angleDeg: 3.5, widthM: 140 },   // Fagnes
      { frac: 0.7277, angleDeg: 3.5, widthM: 100 },   // Campus
      { frac: 0.7576, angleDeg: 6.0, widthM: 150 },   // Stavelot
      { frac: 0.8572, angleDeg: 4.0, widthM: 140 },   // Blanchimont
    ],
  }
  );
})();
