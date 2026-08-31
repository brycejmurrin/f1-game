/* Apex 26 — INDIANAPOLIS MOTOR SPEEDWAY (road course) definition (data only). Retired circuit (`classic: true`): last United States GP 2007. This is the F1 ROAD C… */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "indianapolis",
    classic: true,
    // Upstream us-1909 already runs clockwise, matching the F1 lap.
    reverse: false,
    // The 647 m run opening the trace is the oval front straight — the pit
    // straight for the Grand Prix — and its first vertex is the line.
    // Start/finish line. Snapped to the real one: v0 convention; T1 measured RIGHT, matches the real T1.
    // Was 0.05, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.05,
    name: "INDIANAPOLIS",
    gp: "United States GP",
    country: "USA",
    night: false,
    theme: "modern",
    lengthKm: 4.2,
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 90,
    dressingExclusions: [
      { kinds: ["foliage"], s0: 0.86, s1: 0.22 },
      { kind: "foliage", s0: 0.30, s1: 0.70 },
    ],
    // Flat Midwestern summer: high hazy sun, humid white horizon.
    pal: {
      zenith:        [0.28, 0.48, 0.76],
      horizon:       [0.84, 0.84, 0.80],
      sun:           [1.0,  0.97, 0.86],
      sunColor:      [1.0,  0.96, 0.84],
      ambientSky:    [0.54, 0.56, 0.60],
      ambientGround: [0.28, 0.28, 0.24],
      fogColor:      [0.82, 0.82, 0.80],
      grass:         [0.24, 0.44, 0.20],
      sunDir:        [0.34, 0.78, 0.26],
    },
    elevations: [
      { s: 0.40, halfM: 300, rise: 1.8 },
      { s: 0.68, halfM: 280, rise: -1.5 },
    ],
    hwZones: [
      { s0: 0.240, s1: 0.700, hw: 6.4, ease: 0.020 },
      { s0: 0.760, s1: 0.820, hw: 6.6, ease: 0.012 },
    ],
    bankZones: [
      { frac: 0.115, angleDeg: 9.0, widthM: 320 },
      { frac: 0.880, angleDeg: 6.0, widthM: 200 },
    ],
  }
  );
})();
