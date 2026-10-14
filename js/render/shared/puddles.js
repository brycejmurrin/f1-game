/* Apex 26 — Puddles: the ONE reference for the standing-water mask the three lit shaders hand-mirror (GLX glsl-lit.js, TLX tsl-lit.js, WGX wgsl-chunks.js). */
"use strict";

// STANDING-WATER PUDDLES (2026-10-14). A world-space mask, stable under the
// camera (never screen-space), that the wet block of every lit shader computes
// with these constants and this math. Nothing here is read by a shader: the
// GLSL/TSL/WGSL copies are hand-ported and tests/unit/puddles.test.mjs pins
// each literal against K, plus sample values of mask() itself.
//
// Research (docs/notes/WEATHER-ROADMAP-2026-10-14.md):
//  - GT7 keeps puddles at FIXED real locations and dries the racing line first
//    (https://traxion.gg/gran-turismo-7-features-detailed-dynamic-weather-but-not-at-every-track/):
//    a world-keyed mask, not a per-frame random one. The racing line itself is
//    not an input here (the arc must not reach the driver — AGENTS.md §Physics);
//    the crown-drains / gutter-holds weighting carries the same read.
//  - iRacing Tempest: rough surface texture fills first
//    (https://www.iracing.com/?p=272386) — the edges and kerb hollows hold water.
//  - The cheap technique: a low-frequency procedural mask that fades in with
//    wetness; inside it roughness near zero, a darker albedo and a strong
//    Fresnel mirror. SSR is shed on phones, so the puddle must read through
//    the analytic sky/env reflection alone (the shaders raise envBlend in it).
//
// Shape: two octaves of the SURFACE value noise (hash21 / vnoise — the same
// family as the procedural materials), ~7.7 m and ~3.4 m features. On the road
// ribbon the field is weighted toward the EDGES (the crown drains into the
// gutters and kerb hollows) and toward the low side of a camber (lateral
// downhill from the geometry). No track curvature, no racing line.
//
// Growth: nothing below road wetness 0.6 ("wet" weather is a damp road, not a
// flooded one); from 0.6 to 1.0 the threshold falls so pools spread out of the
// deepest spots, and the amount fades in. Drying runs the same curve backwards,
// so puddles SHRINK to their deepest spots first, then vanish. The PUDDLES
// tuner knob (js/lighting/knobs.js, def 1) scales the growth.
const Puddles = (function () {
  const K = Object.freeze({
    F1: 0.13, O1: 4.7, W1: 0.70,         // octave 1: frequency (1/m), offset, weight
    F2: 0.29, O2: 11.3, W2: 0.30,        // octave 2
    EDGE_LO: 0.35, EDGE_HI: 0.95,        // |lat| smoothstep: where the gutter starts holding water
    POOL_C: 0.75, POOL_E: 1.25,          // pool weight at the crown / at the edge
    CAMBER: 4.0, CAMBER_LO: 0.5, CAMBER_HI: 1.5,   // low side of a banked section pools
    WET_ON: 0.6, WET_FULL: 1.0,          // road wetness where puddles start / are fully grown
    THR: 1.0, THR_GROW: 0.38, SOFT: 0.20,          // threshold falls 1.0 → 0.62; soft edge width
    ROUGH: 0.02, DARK: 0.40, ENV: 0.90, ENV_KEEP: 0.5,   // inside a puddle: roughness, albedo ×, env mirror floor, sky-dim relief
  });

  // f32 emulation so the reference tracks the GPU's precision on the hash.
  const f = Math.fround;
  const fract = (x) => f(x - Math.floor(x));
  function hash21(px, pz) {
    let x = fract(f(px * f(123.34))), y = fract(f(pz * f(456.21)));
    const d = f(f(x * f(x + f(45.32))) + f(y * f(y + f(45.32))));
    x = f(x + d); y = f(y + d);
    return fract(f(x * y));
  }
  const mix = (a, b, t) => a + (b - a) * t;
  const clamp = M4.clamp;   // js/core/mat4.js (HARD_EDGES: bound at eval)
  const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  function vnoise(px, pz) {
    const ix = Math.floor(px), iz = Math.floor(pz);
    let fx = px - ix, fz = pz - iz;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = hash21(ix, iz), b = hash21(ix + 1, iz), c = hash21(ix, iz + 1), d = hash21(ix + 1, iz + 1);
    return mix(mix(a, b, fx), mix(c, d, fx), fz);
  }

  /** The noise field (0..1) at world (x, z). */
  function field(x, z) {
    return vnoise(x * K.F1 + K.O1, z * K.F1 + K.O1) * K.W1 + vnoise(x * K.F2 + K.O2, z * K.F2 + K.O2) * K.W2;
  }
  /** The road-shape weight: lat = lateral / half-width (-1..1), or null off the
   *  ribbon (weight 1); downhill = + when the +x side lies lower. */
  function pool(lat, downhill) {
    if (lat == null) return 1;
    lat = clamp(lat, -1, 1);
    return mix(K.POOL_C, K.POOL_E, smoothstep(K.EDGE_LO, K.EDGE_HI, Math.abs(lat)))
      * clamp(1 + (downhill || 0) * lat * K.CAMBER, K.CAMBER_LO, K.CAMBER_HI);
  }
  /** Growth 0..1 from road wetness and the PUDDLES knob (def 1). */
  function growth(wetness, amount) {
    return clamp(smoothstep(K.WET_ON, K.WET_FULL, wetness) * (amount == null ? 1 : amount), 0, 1);
  }
  /** The puddle amount 0..1 the shaders compute (before the porous and
   *  up-face gates, which multiply it). */
  function mask(x, z, o) {
    o = o || {};
    const g = growth(o.wetness == null ? 1 : o.wetness, o.amount);
    const lo = K.THR - K.THR_GROW * g;
    return smoothstep(lo, lo + K.SOFT, field(x, z) * pool(o.lat == null ? null : o.lat, o.downhill)) * g;
  }

  return { K, hash21, vnoise, field, pool, growth, mask };
})();
Object.freeze(Puddles);
