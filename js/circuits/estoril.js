/* Apex 26 — AUTÓDROMO DO ESTORIL circuit definition (data only).
   Retired circuit (`classic: true`): last Portuguese GP 1996.
   Geometry from the OSM trace in js/track/geo-paths.js. */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "estoril",
    classic: true,
    // Upstream pt-1972 already runs clockwise, matching the racing direction.
    reverse: false,
    // The pit straight is Estoril's long one, famous for the slipstreaming drag
    // to the line, and the trace's first vertex opens it.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches the real T1.
    // Was 0.96, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.96,
    name: "ESTORIL",
    gp: "Portuguese GP",
    country: "Portugal",
    night: false,
    theme: "modern",
    lengthKm: 4.3,
    baseHW: 7,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.92, s1: 0.10 },
      { kind: "foliage", s0: 0.34, s1: 0.46 },
    ],
    pal: {
      zenith:        [0.24, 0.46, 0.78],
      horizon:       [0.82, 0.82, 0.76],
      sun:           [1.0,  0.96, 0.82],
      sunColor:      [1.0,  0.95, 0.80],
      ambientSky:    [0.54, 0.56, 0.60],
      ambientGround: [0.32, 0.29, 0.22],
      fogColor:      [0.80, 0.80, 0.76],
      fogDensity:    0.0030,
      grass:         [0.31, 0.40, 0.20],
      runoff:        [0.62, 0.52, 0.38],
      sunDir:        [0.40, 0.70, 0.30],
    },
    elevations: [
      { s: 0.09, halfM: 280, rise: 7.0 },
      { s: 0.32, halfM: 320, rise: -8.0 },
      { s: 0.58, halfM: 300, rise: 6.5 },
      { s: 0.84, halfM: 320, rise: -6.0 },
    ],
    hwZones: [
      { s0: 0.190, s1: 0.230, hw: 6.0, ease: 0.012 },
      { s0: 0.480, s1: 0.520, hw: 6.0, ease: 0.012 },
      { s0: 0.760, s1: 0.800, hw: 6.1, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.075, angleDeg: 3.5, widthM: 110 },
      { frac: 0.420, angleDeg: 3.0, widthM: 110 },
      // Parabolica Ayrton Senna — the long final right onto the pit straight.
      { frac: 0.900, angleDeg: 5.0, widthM: 200 },
    ],
  }
  );
})();
