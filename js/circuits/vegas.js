/* Apex 26 — LAS VEGAS circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "vegas",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.3 m off centreline, 1 node before vertex 0 (timing line).
    // Was 0.8575, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.9899,
    sceneryStartFrac: 0.8575,
    name: "LAS VEGAS",
    gp: "Las Vegas GP",
    country: "USA",
    night: true,
    theme: "street_night",
    lengthKm: 6.2,
    baseHW: 7,
    street: true,
    sceneryCoordinates: "racing",
    terrainOuter: 26,
    barrierGap: 1.0,
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.36, s1: 0.47 },
      { kind: "lamps", s0: 0.27, s1: 0.36, side: -1 },
      { kind: "lamps", s0: 0.65, s1: 0.71, side: 1 },
    ],
    pal: { horizon: [0.28, 0.12, 0.32], zenith: [0.08, 0.04, 0.14], sunColor: [0.65, 0.50, 0.88], ambientSky: [0.42, 0.28, 0.50], ambientGround: [0.50, 0.25, 0.38], fogColor: [0.22, 0.10, 0.26], fogDensity: 0.0030, sunDir: [0.75, 0.20, 0.12] },
    segs: [
      { t: 0, l: 140 }, { t: -90, l: 70 }, { t: 60, l: 60 }, { t: -60, l: 60 }, { t: 0, l: 120 }, { t: 60, l: 60 },
      { t: -70, l: 60 }, { t: 55, l: 60 }, { t: 0, l: 360 }, { t: -90, l: 80 }, { t: 50, l: 70 }, { t: 0, l: 900, t2: 0 },
      { t: 20, l: 200 }, { t: -90, l: 90 }, { t: 60, l: 60 }, { t: -70, l: 70 }, { t: -65, l: 120 },
    ],
    elevations: [{ s: 0.2075, halfM: 130, rise: -1.2 }],
    hwZones: [
      { s0: 0.2164, s1: 0.2374, hw: 6.2, ease: 0.012 },  // arc 0.400-0.432 T7
      { s0: 0.3139, s1: 0.4596, hw: 6.1, ease: 0.012 },  // arc 0.478-0.532 T9-T10
      { s0: 0.5623, s1: 0.6186, hw: 6.3, ease: 0.012 },  // arc 0.665-0.695 T13
      { s0: 0.8221, s1: 0.8832, hw: 6.3, ease: 0.012 },  // arc 0.985-0.012 T17
    ],
    // Public roads, so crown rather than banking: 2.5-3° on the sweeps only.
    bankZones: [
      { frac: 0.2080, angleDeg: 3.0, widthM: 190 },
      { frac: 0.2664, angleDeg: 3.0, widthM: 180 },
      { frac: 0.4893, angleDeg: 3.0, widthM: 220 },
      { frac: 0.5949, angleDeg: 2.5, widthM: 130 },
      { frac: 0.6481, angleDeg: 2.5, widthM: 130 },
    ],
  }
  );
})();
