/* Apex 26 — QATAR circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "qatar",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // Start/finish line. Snapped to the real one: coord 0.3 m off centreline; = trace vertex 0.
    // Was 0.8000, which put the line inside a corner — a start line is
    // always on a straight. See docs/tracks/START-LINES.md.
    startFrac: 0.0000,
    sceneryStartFrac: 0.8000,
    name: "QATAR",
    gp: "Qatar GP",
    country: "Qatar",
    night: true,
    theme: "desert",
    sceneryTheme: "night-event",
    sceneryCoordinates: "racing",
    flatTerrain: true,
    terrainOuter: 120,
    dressingExclusions: [
      // Qatar owns its sparse palms/scrub; generic foliage muddies the open desert.
      { kind: "foliage", s0: 0, s1: 1 },
      // One lighting system: the ~200 Musco masts below (floodMastRing + S/F +
      // TV corners) own BOTH the look and the night pools. Suppress the generic
      // mast pass so short duplicate poles do not sit under the tall banks.
      { kind: "lamps", s0: 0, s1: 1 },
    ],
    lengthKm: 5.4,
    sunAzimBias: -0.30,   // Losail's late-afternoon sun hangs low to the NE-facing main straight
    baseHW: 8,
    // Warm pal.runoff = tan sand beyond the green verge (brief / COL.desertSand)
    pal: { horizon: [0.08, 0.10, 0.14], zenith: [0.03, 0.04, 0.09], ambientSky: [0.15, 0.16, 0.20], ambientGround: [0.12, 0.12, 0.14], fogColor: [0.10, 0.12, 0.16], fogDensity: 0.0015, concrete: [0.17, 0.17, 0.19], runoff: [0.72, 0.58, 0.38], grass: [0.48, 0.36, 0.22] },
    bankZones: [
      { frac: 0.0415, angleDeg: 3.0, widthM: 90 },
      { frac: 0.1914, angleDeg: 3.5, widthM: 110 },
      { frac: 0.4199, angleDeg: 4.0, widthM: 170 },
      { frac: 0.4636, angleDeg: 4.0, widthM: 140 },
      { frac: 0.6217, angleDeg: 3.0, widthM: 110 },
      { frac: 0.7404, angleDeg: 4.0, widthM: 180 },
      { frac: 0.8487, angleDeg: 3.5, widthM: 150 },
    ],
    elevations: [
      { s: 0.05, halfM: 550, rise: 3.5 },
      { s: 0.42, halfM: 700, rise: 5.5 },
      { s: 0.68, halfM: 350, rise: -1.0 },
    ],
    segs: [
      { t: 0, l: 300 }, { t: -60, l: 90 }, { t: 80, l: 100 }, { t: -70, l: 90 }, { t: 60, l: 90 }, { t: 0, l: 300 },
      { t: -80, l: 100 }, { t: 70, l: 90 }, { t: 0, l: 400 }, { t: -60, l: 90 }, { t: 70, l: 90 }, { t: 0, l: 300 },
    ],
  }
  );
})();
