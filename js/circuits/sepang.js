/* Apex 26 — SEPANG INTERNATIONAL CIRCUIT definition (data only).
   Retired circuit (`classic: true`): last Malaysian GP 2017.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "sepang",
    classic: true,
    // Upstream my-1999 runs clockwise, matching the racing direction.
    reverse: false,
    // Sepang's two long straights are separated by the tight T15 hairpin; the
    // shorter of the pair is the pit straight, so the line goes there. Not
    // GPS-calibrated (no OpenF1 coverage for a circuit that left in 2017).
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches the real T1.
    // Was 0.95, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.95,
    name: "SEPANG",
    gp: "Malaysian GP",
    country: "Malaysia",
    night: false,
    theme: "green",
    lengthKm: 5.5,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.90, s1: 0.10 },  // pits + main straight
      { kind: "foliage", s0: 0.30, s1: 0.40 },              // wide open infield
    ],
    // Equatorial haze: white-hot high sun, heavy humidity, saturated jungle.
    pal: {
      zenith:        [0.30, 0.50, 0.76],
      horizon:       [0.86, 0.86, 0.82],
      sun:           [1.0,  0.98, 0.90],
      sunColor:      [1.0,  0.97, 0.88],
      ambientSky:    [0.56, 0.58, 0.60],
      ambientGround: [0.26, 0.28, 0.20],
      fogColor:      [0.82, 0.84, 0.82],
      fogDensity:    0.0034,
      grass:         [0.17, 0.42, 0.17],
      sunDir:        [0.20, 0.90, 0.14],
    },
    elevations: [
      { s: 0.22, halfM: 420, rise: -5.0 },
      { s: 0.46, halfM: 380, rise: 4.5 },
      { s: 0.74, halfM: 460, rise: -4.0 },
    ],
    hwZones: [
      { s0: 0.145, s1: 0.185, hw: 6.8, ease: 0.014 },  // T3-T4
      { s0: 0.560, s1: 0.600, hw: 6.9, ease: 0.014 },  // T9 hairpin
      { s0: 0.865, s1: 0.905, hw: 6.6, ease: 0.012 },  // T15 final hairpin
    ],
    bankZones: [
      { frac: 0.045, angleDeg: 3.5, widthM: 140 },   // T1-T2 loop
      { frac: 0.330, angleDeg: 4.0, widthM: 150 },   // T5-T6 sweep
      { frac: 0.660, angleDeg: 3.0, widthM: 130 },   // T12-T13
    ],
  }
  );
})();
