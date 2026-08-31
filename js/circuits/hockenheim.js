/* Apex 26 — HOCKENHEIMRING circuit definition (data only). Retired circuit (`classic: true`): last German GP 2019, not on the current calendar, so it is playable … */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "hockenheim",
    classic: true,
    reverse: false,
    startFrac: 0.0,
    name: "HOCKENHEIM",
    gp: "German GP",
    country: "Germany",
    night: false,
    theme: "green",
    lengthKm: 4.6,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.78, s1: 0.06 },   // Motodrom + pits
      { kind: "foliage", s0: 0.40, s1: 0.50 },               // Spitzkehre runoff
    ],
    // Baden pine forest under a hazy continental summer sky.
    pal: {
      zenith:        [0.26, 0.44, 0.72],
      horizon:       [0.74, 0.76, 0.72],
      sun:           [1.0,  0.95, 0.78],
      sunColor:      [1.0,  0.94, 0.76],
      ambientSky:    [0.48, 0.52, 0.58],
      ambientGround: [0.24, 0.25, 0.20],
      fogColor:      [0.70, 0.72, 0.70],
      grass:         [0.19, 0.42, 0.19],
      sunDir:        [0.42, 0.62, 0.36],
    },
    elevations: [
      { s: 0.26, halfM: 380, rise: -3.5 },  // drift down through the forest loop
      { s: 0.46, halfM: 300, rise: -5.0 },  // Spitzkehre sits in the low corner
      { s: 0.70, halfM: 420, rise: 4.0 },   // climb back toward the Motodrom
    ],
    hwZones: [
      { s0: 0.435, s1: 0.480, hw: 6.2, ease: 0.012 },  // Spitzkehre hairpin
      { s0: 0.815, s1: 0.960, hw: 6.6, ease: 0.015 },  // Motodrom stadium loop
    ],
    bankZones: [
      { frac: 0.055, angleDeg: 3.0, widthM: 110 },   // Nordkurve
      { frac: 0.335, angleDeg: 2.5, widthM: 90 },    // Ostkurve entry
      { frac: 0.880, angleDeg: 4.0, widthM: 120 },   // Sachskurve
    ],
  }
  );
})();
