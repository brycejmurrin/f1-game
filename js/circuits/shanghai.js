/* Apex 26 — SHANGHAI circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "shanghai",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: v0; the researched coord snaps 2 nodes earlier but lands IN A CORNER (mean |k| 0.0057), and its sources disagree by 175 m.
    // Was 0.1525, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.1525,
    name: "SHANGHAI",
    gp: "Chinese GP",
    country: "China",
    night: false,
    theme: "modern",
    lengthKm: 5.5,
    baseHW: 8,
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 120,
    dressingExclusions: [
      { kind: "city", s0: 0, s1: 1 },
      { kind: "foliage", s0: 0.425, s1: 0.445 },
      { kind: "foliage", s0: 0.720, s1: 0.765 },
    ],
    pal: { zenith: [0.28, 0.4, 0.58], horizon: [0.64, 0.66, 0.66], grass: [0.26, 0.42, 0.22], runoff: [0.4, 0.4, 0.4], fog: [0.64, 0.66, 0.66], fogDensity: 0.002, sunDir: [0.597109775827013, 0.7349043394794006, 0.3215206485222378], sun: [0.96, 0.92, 0.84], sunColor: [0.94, 0.9, 0.82] },
    segs: [
      { t: 0, l: 400 }, { t: 50, l: 130 }, { t: 180, l: 200 }, { t: 50, l: 100 }, { t: 0, l: 250 }, { t: -90, l: 100 },
      { t: 0, l: 550 }, { t: -60, l: 90 }, { t: 60, l: 80 }, { t: -70, l: 90 }, { t: 70, l: 80 }, { t: 0, l: 200 },
    ],
    bankZones: [
      { frac: 0.0133, angleDeg: 5.0, widthM: 200 },   // T1-2-3 spiral
      { frac: 0.1433, angleDeg: 3.0, widthM: 110 },
      { frac: 0.2134, angleDeg: 4.0, widthM: 250 },
      { frac: 0.2888, angleDeg: 3.5, widthM: 180 },
      { frac: 0.4431, angleDeg: 4.0, widthM: 300 },   // the long left onto the back straight
      { frac: 0.7326, angleDeg: 3.0, widthM: 100 },   // T13 hairpin
      { frac: 0.9985, angleDeg: 4.0, widthM: 280 },   // final corner onto the pit straight
    ],
    // Elevations use source-trace fractions. The Jiading site is reclaimed marsh
    // — flat by F1 standards but engineered with ~6 m of long-wavelength relief
    // (the spiral climbs, the back straight crests). Grades stay under ~1.7 %.
    // The crest keeps the original s=0.4525 anchor and stays at 6.5 m: raising
    // the s=0.2125 bump instead trips the prop-interpenetration ratchet, and a
    // taller crest lifts the ground out from under the far skyline towers.
    elevations: [
      { s: 0.2125, halfM: 105, rise: 0.8 },
      { s: 0.4525, halfM: 600, rise: 6.5 },
      { s: 0.0125, halfM: 350, rise: 2.5 },
    ],
  }
  );
})();
