/* Apex 26 — CIRCUIT PAUL RICARD definition (data only).
   Retired circuit (`classic: true`): last French GP 2022.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "paul_ricard",
    classic: true,
    reverse: true,
    // The trace's first vertex opens the pit straight and IS the start line; the
    // 1044 m run at source 0.52-0.70 is the Mistral, not the start.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured LEFT, matches the Verrerie left-right.
    // Was 0.03, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.03,
    name: "PAUL RICARD",
    gp: "French GP",
    country: "France",
    night: false,
    theme: "modern",
    lengthKm: 5.8,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 130,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },  // pits
      { kind: "foliage", s0: 0.20, s1: 0.44 },
      { kind: "foliage", s0: 0.60, s1: 0.78 },
      { kind: "city", s0: 0, s1: 1 },
    ],
    // High Provençal plateau: hard white light, bleached limestone, dry scrub.
    pal: {
      zenith:        [0.22, 0.44, 0.78],
      horizon:       [0.84, 0.82, 0.74],
      sun:           [1.0,  0.97, 0.84],
      sunColor:      [1.0,  0.96, 0.82],
      ambientSky:    [0.54, 0.56, 0.60],
      ambientGround: [0.34, 0.31, 0.24],
      fogColor:      [0.80, 0.78, 0.70],
      grass:         [0.34, 0.40, 0.21],
      runoff:        [0.42, 0.44, 0.62],   // the famous blue-tinted abrasive runoff
      sunDir:        [0.34, 0.78, 0.24],
    },
    elevations: [
      { s: 0.30, halfM: 460, rise: 3.0 },
      { s: 0.66, halfM: 420, rise: -3.5 },
      { s: 0.88, halfM: 380, rise: 2.5 },
    ],
    hwZones: [
      { s0: 0.415, s1: 0.455, hw: 6.8, ease: 0.014 },  // Mistral chicane
      { s0: 0.700, s1: 0.745, hw: 6.6, ease: 0.012 },  // Le Beausset
      { s0: 0.880, s1: 0.930, hw: 6.6, ease: 0.012 },  // Pont / Le Village
    ],
    bankZones: [
      { frac: 0.070, angleDeg: 3.0, widthM: 130 },   // Verrerie
      { frac: 0.560, angleDeg: 4.0, widthM: 170 },   // Signes
      { frac: 0.640, angleDeg: 3.5, widthM: 160 },   // Bosch curve
    ],
  }
  );
})();
