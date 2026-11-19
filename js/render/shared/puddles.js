"use strict";

const Puddles = (function () {
  const K = Object.freeze({
    F1: 0.13, O1: 4.7, W1: 0.70,
    F2: 0.29, O2: 11.3, W2: 0.30,
    EDGE_LO: 0.35, EDGE_HI: 0.95,
    POOL_C: 0.75, POOL_E: 1.25,
    CAMBER: 4.0, CAMBER_LO: 0.5, CAMBER_HI: 1.5,
    WET_ON: 0.6, WET_FULL: 1.0,
    THR: 1.0, THR_GROW: 0.38, SOFT: 0.20,
    ROUGH: 0.02, DARK: 0.40, ENV: 0.90, ENV_KEEP: 0.5,
  });

  const f = Math.fround;
  const fract = (x) => f(x - Math.floor(x));
  function hash21(px, pz) {
    let x = fract(f(px * f(123.34))), y = fract(f(pz * f(456.21)));
    const d = f(f(x * f(x + f(45.32))) + f(y * f(y + f(45.32))));
    x = f(x + d); y = f(y + d);
    return fract(f(x * y));
  }
  const mix = (a, b, t) => a + (b - a) * t;
  const clamp = M4.clamp;
  const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  function vnoise(px, pz) {
    const ix = Math.floor(px), iz = Math.floor(pz);
    let fx = px - ix, fz = pz - iz;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = hash21(ix, iz), b = hash21(ix + 1, iz), c = hash21(ix, iz + 1), d = hash21(ix + 1, iz + 1);
    return mix(mix(a, b, fx), mix(c, d, fx), fz);
  }

  function field(x, z) {
    return vnoise(x * K.F1 + K.O1, z * K.F1 + K.O1) * K.W1 + vnoise(x * K.F2 + K.O2, z * K.F2 + K.O2) * K.W2;
  }
  function pool(lat, downhill) {
    if (lat == null) return 1;
    lat = clamp(lat, -1, 1);
    return mix(K.POOL_C, K.POOL_E, smoothstep(K.EDGE_LO, K.EDGE_HI, Math.abs(lat)))
      * clamp(1 + (downhill || 0) * lat * K.CAMBER, K.CAMBER_LO, K.CAMBER_HI);
  }
  function growth(wetness, amount) {
    return clamp(smoothstep(K.WET_ON, K.WET_FULL, wetness) * (amount == null ? 1 : amount), 0, 1);
  }
  function mask(x, z, o) {
    o = o || {};
    const g = growth(o.wetness == null ? 1 : o.wetness, o.amount);
    const lo = K.THR - K.THR_GROW * g;
    return smoothstep(lo, lo + K.SOFT, field(x, z) * pool(o.lat == null ? null : o.lat, o.downhill)) * g;
  }

  return { K, hash21, field, pool, mask };
})();
Object.freeze(Puddles);
