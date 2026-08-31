/* Apex 26 — CIRCUIT DE NEVERS MAGNY-COURS definition (data only).
   Retired circuit (`classic: true`): last French GP 2008.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "magny_cours",
    classic: true,
    // Upstream fr-1960 already runs clockwise, matching the racing direction.
    reverse: false,
    startFrac: 0.99,
    name: "MAGNY-COURS",
    gp: "French GP",
    country: "France",
    night: false,
    theme: "green",
    lengthKm: 4.4,
    baseHW: 7.5,
    sceneryCoordinates: "racing",
    terrainOuter: 115,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.93, s1: 0.08 },
      { kind: "foliage", s0: 0.40, s1: 0.50 },
    ],
    // Central-French farmland: soft, cool, slightly overcast light over green
    // fields — Magny-Cours never looked exotic and shouldn't here.
    pal: {
      zenith:        [0.32, 0.48, 0.70],
      horizon:       [0.74, 0.76, 0.72],
      sun:           [0.98, 0.96, 0.86],
      sunColor:      [0.98, 0.96, 0.86],
      ambientSky:    [0.50, 0.53, 0.57],
      ambientGround: [0.27, 0.29, 0.22],
      fogColor:      [0.72, 0.74, 0.72],
      grass:         [0.22, 0.44, 0.20],
      sunDir:        [0.42, 0.62, 0.36],
    },
    elevations: [
      { s: 0.24, halfM: 360, rise: 5.0 },
      { s: 0.52, halfM: 340, rise: -6.0 },
      { s: 0.80, halfM: 320, rise: 4.5 },
    ],
    hwZones: [
      { s0: 0.150, s1: 0.195, hw: 6.3, ease: 0.012 },  // Estoril
      { s0: 0.560, s1: 0.600, hw: 6.2, ease: 0.012 },  // Adelaide hairpin
      { s0: 0.900, s1: 0.945, hw: 6.4, ease: 0.012 },  // Lycée
    ],
    bankZones: [
      { frac: 0.060, angleDeg: 3.0, widthM: 110 },
      { frac: 0.400, angleDeg: 3.5, widthM: 130 },
      { frac: 0.780, angleDeg: 3.0, widthM: 120 },
    ],
  }
  );
})();
