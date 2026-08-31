/* Apex 26 — MONZA circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monza",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 3.9 m off centreline; = trace vertex 0.
    // Was 0.0125, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.0125,
    name: "MONZA",
    gp: "Italian GP",
    country: "Italy",
    night: false,
    theme: "green",
    lengthKm: 5.8,
    sceneryCoordinates: "racing",
    // Keep the royal-park terrain under the deep forest ranks and hero models.
    terrainOuter: 120,
    dressingExclusions: [
      { kind: "foliage", s0: 0.93, s1: 0.07 },          // pits / Tribuna Centrale
      { kinds: ["foliage"], s0: 0.20, s1: 0.27, side: -1 }, // west lake
      { kinds: ["foliage"], s0: 0.37, s1: 0.43, side: 1 },  // Villa lake
      { kind: "foliage", s0: 0.49, s1: 0.59, side: -1 }, // banking ruin sightline
      { kind: "foliage", s0: 0.69, s1: 0.77 },           // flyover approaches
    ],
    sunAzimBias: 0.16,   // royal-park afternoon: western sun raking through the trees onto the Curva Grande
    baseHW: 8,
    ownPitStraight: true,
    pal: {
      zenith:        [0.20, 0.40, 0.70],
      horizon:       [0.76, 0.68, 0.52],
      sun:           [1.0,  0.92, 0.66],
      sunColor:      [1.0,  0.88, 0.58],
      ambientSky:    [0.46, 0.50, 0.56],
      ambientGround: [0.24, 0.23, 0.17],
      fogColor:      [0.68, 0.64, 0.54],
      grass:         [0.20, 0.44, 0.18],
      sunDir:        [0.5, 0.55, 0.3],
    },
    segs: [
      { t: 0, l: 560 }, { t: 70, l: 55 }, { t: -75, l: 60 }, { t: 80, l: 220 }, { t: 0, l: 200 }, { t: -60, l: 55 },
      { t: 70, l: 70 }, { t: 75, l: 130 }, { t: 60, l: 120 }, { t: 0, l: 260 }, { t: -50, l: 55 }, { t: 65, l: 70 },
      { t: 0, l: 360 }, { t: 150, l: 220 },
    ],
    elevations: [
      { s: 0.3125, halfM: 220, rise: -1.5 },
      { s: 0.4925, halfM: 340, rise: 4.5 },
    ],
    hwZones: [
      { s0: 0.0155, s1: 0.0949, hw: 6.8, ease: 0.012 },  // arc 0.003-0.024 Rettifilo
      { s0: 0.2821, s1: 0.3460, hw: 7.0, ease: 0.012 },  // arc 0.212-0.234 Roggia
      { s0: 0.5960, s1: 0.7315, hw: 7.2, ease: 0.012 },  // arc 0.524-0.572 Ascari
    ],
    bankZones: [
      { frac: 0.0769, angleDeg: 3.0, widthM: 240 },   // Curva Grande
      { frac: 0.2964, angleDeg: 6.0, widthM: 140 },   // Lesmo 1
      { frac: 0.3456, angleDeg: 6.0, widthM: 80 },    // Lesmo 2
      { frac: 0.5443, angleDeg: 3.5, widthM: 110 },   // Ascari
      { frac: 0.7355, angleDeg: 4.0, widthM: 300 },   // Parabolica
    ],
  }
  );
})();
