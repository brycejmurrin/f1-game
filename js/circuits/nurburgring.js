/* Apex 26 — NÜRBURGRING (GP-Strecke) circuit definition (data only). Retired circuit (`classic: true`): last hosted the 2020 Eifel GP and is not on the current ca… */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "nurburgring",
    classic: true,
    reverse: false,
    startFrac: 0.02,
    name: "NURBURGRING",
    gp: "Eifel GP",
    country: "Germany",
    night: false,
    theme: "green",
    lengthKm: 5.1,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 100,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.94, s1: 0.10 },  // pit straight + Arena
      { kind: "foliage", s0: 0.60, s1: 0.68 },              // Dunlop-Kehre runoff
    ],
    pal: {
      zenith:        [0.38, 0.48, 0.60],
      horizon:       [0.66, 0.70, 0.72],
      sun:           [0.92, 0.93, 0.92],
      sunColor:      [0.92, 0.93, 0.92],
      ambientSky:    [0.50, 0.54, 0.58],
      ambientGround: [0.26, 0.28, 0.24],
      fogColor:      [0.62, 0.66, 0.68],
      fogDensity:    0.0030,
      grass:         [0.16, 0.36, 0.17],
      sunDir:        [0.50, 0.52, 0.42],
    },
    elevations: [
      { s: 0.18, halfM: 340, rise: -8.0 },   // drop out of the Mercedes-Arena
      { s: 0.42, halfM: 460, rise: -12.0 },  // low ground through the back loop
      { s: 0.66, halfM: 380, rise: 6.0 },    // Dunlop-Kehre rise
      { s: 0.86, halfM: 420, rise: 11.0 },   // climb back to Veedol / the pits
    ],
    hwZones: [
      { s0: 0.100, s1: 0.180, hw: 6.2, ease: 0.012 },  // Mercedes-Arena complex
      { s0: 0.630, s1: 0.690, hw: 6.4, ease: 0.012 },  // Dunlop-Kehre
      { s0: 0.910, s1: 0.955, hw: 6.3, ease: 0.012 },  // Veedol chicane
    ],
    bankZones: [
      { frac: 0.055, angleDeg: 3.5, widthM: 110 },   // Castrol-S
      { frac: 0.300, angleDeg: 4.5, widthM: 140 },   // Ford Kurve
      { frac: 0.520, angleDeg: 3.0, widthM: 120 },   // Bit-Kurve
      { frac: 0.780, angleDeg: 4.0, widthM: 130 },   // Schumacher-S
    ],
  }
  );
})();
