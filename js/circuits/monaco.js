/* Apex 26 — MONACO circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "monaco",
    name: "MONACO",
    gp: "Monaco GP",
    country: "Monaco",
    night: false,
    theme: "street_day",
    lengthKm: 3.3,
    baseHW: 5,
    street: true,
    terrainOuter: 28,
    sceneryCoordinates: "source",
    barrierGap: 2.0,
    dressingExclusions: [
      // Keep generic city furniture out of the tunnel and the Casino sightline.
      { kinds: ["city", "foliage", "lighting"], s0: 0.50, s1: 0.60 },
      { kind: "city", s0: 0.17, s1: 0.24 },
      { kinds: ["city", "foliage"], s0: 0.29, s1: 0.70, side: 1 },
      { kinds: ["city", "foliage"], s0: 0, s1: 0.14, side: 1 },
    ],
    reverse: true,
    // Rotate the start/finish line onto the main pit/harbour straight so the lap
    // begins on the straight with the first corner at its end (fraction of the
    // original trace; tuned against the reversed layout).
    // Start/finish line. Snapped to the real one: coord 0.5 m off centreline; this trace is stored REVERSED, so its vertex 0 is not the line.
    // Was 0.28. That already measured straight (mean |k| 0.00298 over
    // 120 m) — it was on the wrong PART of the lap, not in a corner.
    // See docs/tracks/START-LINES.md.
    startFrac: 0.2516,
    sceneryStartFrac: 0.28,
    pal: { horizon: [0.55, 0.68, 0.82], grass: [0.36, 0.35, 0.34], runoff: [0.42, 0.41, 0.4], concrete: [0.24, 0.23, 0.22], fogDensity: 0.0014, sunDir: [0.22008805283522467, 0.8803522113408987, 0.4201681008672471], sun: [1, 0.98, 0.93], sunColor: [1, 0.97, 0.9] },
    segs: [
      { t: 0, l: 230 }, { t: -70, l: 75 }, { t: 25, l: 260, h: 14 }, { t: 70, l: 110 }, { t: -80, l: 80, w: 4.8 }, { t: 0, l: 90, h: -6 },
      { t: -80, l: 80, w: 4.8 }, { t: -160, l: 120, w: 4.5, h: -4 }, { t: -55, l: 80 }, { t: -45, l: 80 }, { t: 15, l: 260, h: -4 }, { t: -60, l: 70, w: 4.8 },
      { t: 0, l: 40 }, { t: 65, l: 60 }, { t: -65, l: 60 }, { t: 40, l: 100 }, { t: -70, l: 65, w: 4.8 }, { t: 0, l: 35 },
      { t: 70, l: 65 }, { t: -80, l: 70 }, { t: 70, l: 65 }, { t: -75, l: 70, w: 4.8 }, { t: -40, l: 120 },
    ],
    elevations: [{ s: 0.10, halfM: 340, rise: 30 }, { s: 0.55, halfM: 220, rise: -10 }],
    hwZones: [
      { s0: 0.1524, s1: 0.2131, hw: 4.6, ease: 0.012 },  // arc 0.112-0.150 Massenet/Casino
      { s0: 0.8217, s1: 0.8864, hw: 4.1, ease: 0.012 },  // arc 0.432-0.462 Loews hairpin
      { s0: 0.7430, s1: 0.7741, hw: 4.3, ease: 0.012 },  // arc 0.485-0.510 Portier
      { s0: 0.5579, s1: 0.5879, hw: 4.5, ease: 0.012 },  // arc 0.770-0.792 Tabac
      { s0: 0.4848, s1: 0.5349, hw: 4.4, ease: 0.012 },  // arc 0.815-0.855 swimming pool
      { s0: 0.3488, s1: 0.3918, hw: 4.3, ease: 0.012 },  // arc 0.930-0.955 Rascasse
    ],
    bankZones: [
      { frac: 0.1286, angleDeg: 3.0, widthM: 60 },    // Massenet
      { frac: 0.2961, angleDeg: 3.0, widthM: 160 },   // Mirabeau/descent
      { frac: 0.7791, angleDeg: 3.0, widthM: 120 },   // Tabac
      { frac: 0.8847, angleDeg: 2.5, widthM: 140 },   // swimming pool
      { frac: 0.9417, angleDeg: 2.5, widthM: 100 },   // Rascasse
    ],
  }
  );
})();
