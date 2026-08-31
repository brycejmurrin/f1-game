/* Apex 26 — MADRID / Madring circuit definition. */
(function () {
  "use strict";

  (window.TrackDefs = window.TrackDefs || []).push({
    id: "madrid",
    name: "MADRID",
    gp: "Spanish GP",
    country: "Spain",
    night: false,
    theme: "modern",
    street: false,
    reverse: false,
    sceneryCoordinates: "racing",
    lengthKm: 5.5,
    baseHW: 7,
    terrainOuter: 56,
    banked: true,
    bankZones: [
      { frac: 0.75, angleDeg: 13.5, widthM: 180 }, // 24% grade = atan(0.24)
      { frac: 0.0524, angleDeg: 3.0, widthM: 180 },
      { frac: 0.3990, angleDeg: 3.5, widthM: 110 },
      { frac: 0.5711, angleDeg: 3.0, widthM: 90 },
      { frac: 0.6557, angleDeg: 3.0, widthM: 180 },
      { frac: 0.9296, angleDeg: 3.0, widthM: 90 },
    ],
    // The generic city/furniture base layer carries most of the circuit's
    // density — the bespoke IFEMA halls and La Monumental bowl layer on top of
    // it, they don't replace it. Only carve their curated sightlines (the
    // exhibition-hall pit straight and the banked bullring sector); the old
    // road-overlap risk is handled by the guarded emitters, not exclusions.
    //
    // The two rules below (s 0.15-0.55, 0.83-0.95) are a later, separate cut:
    // tests/specs/new-hooks.spec.js's prop-vertex budget measured day 621,075 /
    // night 968,561 against 250,000 — not a duplicate-layer bug like
    // Singapore's (CI-3), just this generic layer covering ~74% of a 5.5 km
    // lap at its normal density. Unlike Singapore's cityFront(), the generic
    // city here has no per-circuit along()-step to widen (js/track/tracks.js's
    // every(18)/every(26) is shared by 14 other circuits), so the only
    // Madrid-local lever is exclusion. Cuts lap coverage to ~22%, kept where
    // it was already theme-matched — flanking the two landmark precincts
    // above — rather than spread thin lap-wide. See the budget comment in
    // tests/specs/new-hooks.spec.js for the measured before/after and why 250,000
    // was never reachable (even zero city buildings floors near 435,000, on
    // the required bespoke landmarks alone).
    dressingExclusions: [
      { kinds: ["city", "foliage"], s0: 0.95, s1: 0.06 },
      { kinds: ["city", "foliage", "lighting"], s0: 0.68, s1: 0.83 },
      { kinds: ["city"], s0: 0.15, s1: 0.55 },
      { kinds: ["city"], s0: 0.83, s1: 0.95 },
    ],
    pal: {
      zenith: [0.30, 0.58, 0.90],
      horizon: [0.78, 0.79, 0.78],
      grass: [0.48, 0.48, 0.29],
      sunDir: [0.121, 0.968, 0.222],
      sun: [1.0, 0.91, 0.70],
      sunColor: [1.0, 0.98, 0.94],
    },
    segs: [
      { t: 0, l: 320 }, { t: 70, l: 70 }, { t: -65, l: 70 },
      { t: 50, l: 120 }, { t: 0, l: 360 }, { t: 90, l: 80 },
      { t: -85, l: 70 }, { t: 90, l: 80 }, { t: 0, l: 140 },
      { t: 180, l: 240, w: 9 }, { t: 0, l: 80 },
      { t: -60, l: 90, h: 6 }, { t: 70, l: 90, h: -4 },
      { t: -50, l: 80 }, { t: 80, l: 90 }, { t: 60, l: 130 },
    ],
    elevations: [
      { s: 0.40, halfM: 520, rise: 18 },
      { s: 0.52, halfM: 360, rise: -8 },
    ],

  });
})();
