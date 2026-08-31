/* Apex 26 — SILVERSTONE circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "silverstone",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 1.2 m off centreline at the Wing; vertex 0 is the OLD National pit straight, 1.3 km away.
    // Was 0.6400, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.5224,
    sceneryStartFrac: 0.6400,
    name: "SILVERSTONE",
    gp: "British GP",
    country: "UK",
    night: false,
    theme: "green",
    sceneryTheme: "permanent",
    lengthKm: 5.9,
    sunAzimBias: 0.28,   // high-summer northern sun, gentle SW tilt over the old airfield
    baseHW: 8,
    sceneryCoordinates: "racing",
    terrainOuter: 110,
    flatTerrain: true,
    dressingExclusions: [
      { kinds: ["foliage", "lighting"], s0: 0.18, s1: 0.28 },
      { kinds: ["foliage"], s0: 0.42, s1: 0.52, side: 1 },
    ],
    // British overcast (ATM.britishOvercast) — pale grey-blue sky, lush grass, soft fog.
    pal: { zenith: [0.55, 0.62, 0.72], horizon: [0.72, 0.76, 0.82], grass: [0.16, 0.40, 0.18], runoff: [0.48, 0.46, 0.42], fog: [0.68, 0.72, 0.78], fogDensity: 0.0020, sunDir: [0.42010419876354255, 0.5521369469463703, 0.7201786264517872], sun: [0.92, 0.94, 0.96], sunColor: [0.92, 0.94, 0.96], ambientSky: [0.58, 0.62, 0.70], ambientGround: [0.30, 0.34, 0.28] },
    segs: [
      { t: 0, l: 260 }, { t: 60, l: 120 }, { t: -50, l: 90 }, { t: 80, l: 80 }, { t: -150, l: 160 }, { t: 0, l: 120 },
      { t: -70, l: 90 }, { t: 120, l: 150 }, { t: 40, l: 100 }, { t: 0, l: 160 }, { t: 70, l: 130 }, { t: -55, l: 70 },
      { t: 60, l: 70 }, { t: -55, l: 70 }, { t: 50, l: 70 }, { t: 0, l: 300 }, { t: 75, l: 110 }, { t: -40, l: 90 },
      { t: 95, l: 90 }, { t: 60, l: 90 },
    ],
    // Source-trace fractions mapping to racing s≈0.12 (rise) and s≈0.55 (dip).
    elevations: [
      { s: 0.76, halfM: 420, rise: 7 },
      { s: 0.19, halfM: 480, rise: -7 },
    ],
    bankZones: [
      { frac: 0.0267, angleDeg: 4.0, widthM: 110 },   // Copse
      { frac: 0.2122, angleDeg: 3.5, widthM: 190 },   // Becketts
      { frac: 0.3723, angleDeg: 4.5, widthM: 150 },   // Stowe
      { frac: 0.5359, angleDeg: 3.5, widthM: 150 },   // Vale/Club
      { frac: 0.7064, angleDeg: 4.0, widthM: 200 },
      { frac: 0.8001, angleDeg: 3.5, widthM: 200 },   // Luffield
      { frac: 0.9199, angleDeg: 3.0, widthM: 100 },
    ],
  }
  );
})();
