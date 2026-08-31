/* Apex 26 — AUTÓDROMO INTERNACIONAL NELSON PIQUET (JACAREPAGUÁ) definition (data only). Retired circuit (`classic: true`): last Brazilian GP 1989; the circuit its… */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "jacarepagua",
    classic: true,
    reverse: false,
    startFrac: 0.0,
    name: "JACAREPAGUA",
    gp: "Brazilian GP",
    country: "Brazil",
    night: false,
    theme: "modern",
    lengthKm: 5.0,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 120,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },
      { kind: "foliage", s0: 0.36, s1: 0.50 },   // the lagoon frontage
    ],
    pal: {
      zenith:        [0.24, 0.48, 0.80],
      horizon:       [0.86, 0.86, 0.82],
      sun:           [1.0,  0.97, 0.88],
      sunColor:      [1.0,  0.96, 0.86],
      ambientSky:    [0.56, 0.58, 0.62],
      ambientGround: [0.32, 0.30, 0.22],
      fogColor:      [0.84, 0.85, 0.84],
      fogDensity:    0.0034,
      grass:         [0.24, 0.44, 0.20],
      runoff:        [0.72, 0.68, 0.54],   // pale coastal sand
      sunDir:        [0.24, 0.86, 0.20],
    },
    elevations: [
      { s: 0.28, halfM: 380, rise: 2.0 },
      { s: 0.70, halfM: 360, rise: -1.8 },
    ],
    hwZones: [
      { s0: 0.180, s1: 0.225, hw: 6.3, ease: 0.012 },
      { s0: 0.600, s1: 0.645, hw: 6.2, ease: 0.012 },
      { s0: 0.860, s1: 0.905, hw: 6.4, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.075, angleDeg: 3.5, widthM: 120 },
      { frac: 0.470, angleDeg: 4.5, widthM: 200 },   // the long lagoon-side sweep
    ],
  }
  );
})();
