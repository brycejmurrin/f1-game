/* Apex 26 — BAKU circuit definition (data only). */
(function () {
  "use strict";
  (window.TrackDefs = window.TrackDefs || []).push(
  {
    id: "baku",
    reverse: false, // direction switched to real-world CW/CCW (was auto-audit reverse:true)
    // startFrac defaults to 0 — Already correct per docs/tracks/START-LINES.md
    name: "BAKU",
    gp: "Azerbaijan GP",
    country: "Azerbaijan",
    night: true,
    theme: "street_night",
    street: true,
    lengthKm: 6,
    baseHW: 6,
    sceneryCoordinates: "racing",
    dressingExclusions: [
      { kinds: ["city", "foliage", "lighting"], s0: 0.36, s1: 0.56 },
      // Preserve the Caspian void on the left of Neftchilar Avenue.
      { kinds: ["city", "foliage", "lighting"], s0: 0.58, s1: 0.97, side: -1 },
    ],
    pal: { horizon: [0.10, 0.12, 0.22], zenith: [0.04, 0.05, 0.14], sunColor: [0.72, 0.74, 0.88], ambientSky: [0.24, 0.26, 0.36], ambientGround: [0.20, 0.20, 0.28], fogColor: [0.08, 0.10, 0.18], fogDensity: 0.0016 },
    hwZones: [
      { s0: 0.42, s1: 0.50, hw: 3.8, ease: 0.02 },      // Castle Section
      { s0: 0.0874, s1: 0.1194, hw: 5.3, ease: 0.012 },  // T2 tight left
      { s0: 0.2577, s1: 0.3233, hw: 5.4, ease: 0.012 },  // T6/T7 into the Old City
      { s0: 0.8232, s1: 0.8825, hw: 5.4, ease: 0.012 },  // T15/T16 seafront kink
    ],
    segs: [
      { t: 0, l: 200 }, { t: -90, l: 80 }, { t: 80, l: 70 }, { t: 0, l: 725 },
      { t: 0, l: 75, w: 3.8 }, { t: -90, l: 80, w: 3.8 }, { t: 0, l: 50, w: 3.8 }, { t: 0, l: 350 },
      { t: 70, l: 70 }, { t: -60, l: 60 }, { t: 55, l: 60 }, { t: -60, l: 60 }, { t: 0, l: 600 }, { t: 80, l: 80 },
    ],
    elevations: [{ s: 0.46, halfM: 500, rise: 14 }],
  }
  );
})();
