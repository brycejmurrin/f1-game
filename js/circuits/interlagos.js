/* Apex 26 — INTERLAGOS circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "interlagos",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    sceneryCoordinates: "racing",
    // startFrac defaults to 0 — Already correct per docs/tracks/START-LINES.md
    name: "INTERLAGOS",
    gp: "São Paulo GP",
    country: "Brazil",
    night: false,
    theme: "green",
    lengthKm: 4.3,
    baseHW: 7,
    terrainOuter: 45,
    dressingExclusions: [
      { kind: "city", s0: 0, s1: 1 },
      { kinds: ["foliage", "lighting"], s0: 0.30, s1: 0.42, side: -1 },
    ],
    pal: { zenith: [0.34, 0.54, 0.78], horizon: [0.64, 0.72, 0.62], grass: [0.30, 0.55, 0.26], fog: [0.56, 0.62, 0.56], fogDensity: 0.0018, sunDir: [0.18032487743269374, 0.8214799971933825, 0.5409746322980812], sun: [1, 0.96, 0.84], sunColor: [1, 0.94, 0.82] },
    segs: [
      { t: 0, l: 240, h: 8 }, { t: -55, l: 100, h: -10 }, { t: 40, l: 90, h: -6 }, { t: -20, l: 400, h: -4 }, { t: -60, l: 110 }, { t: -50, l: 100, h: 6 },
      { t: 70, l: 100 }, { t: -80, l: 110 }, { t: 0, l: 160 }, { t: -90, l: 100 }, { t: 60, l: 90 }, { t: -70, l: 100 },
      { t: -110, l: 140, h: 6 }, { t: -20, l: 440, h: 18 },
    ],
    elevations: [{ s: 0.97, halfM: 650, rise: 43 }],
    bankZones: [
      { frac: 0.0663, angleDeg: 3.5, widthM: 120 },   // Senna S, first apex
      { frac: 0.1167, angleDeg: 7.0, widthM: 240 },   // Curva do Sol
      { frac: 0.4547, angleDeg: 4.0, widthM: 200 },   // Ferradura
      { frac: 0.6265, angleDeg: 3.0, widthM: 160 },   // Bico de Pato
      { frac: 0.6629, angleDeg: 4.0, widthM: 180 },   // Mergulho
      { frac: 0.7414, angleDeg: 3.5, widthM: 90 },    // Junção
      { frac: 0.8375, angleDeg: 6.0, widthM: 160 },   // Arquibancadas
    ],
  }
  );
})();
