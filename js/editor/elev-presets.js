const ElevPresets = (function () {
  "use strict";
  const UNIT = 4;
  const q = (v) => Math.round(v * UNIT) / UNIT;
  const lim = () => (typeof CustomTracks !== "undefined" && CustomTracks.LIMITS) || { rise: 60 };
  const NAMES = Object.freeze(["flat", "rolling", "hilly"]);

  function clampH(h) {
    const cap = lim().rise;
    const v = Number.isFinite(+h) ? +h : 0;
    return q(Math.min(cap, Math.max(-cap, v))) || 0;
  }

  function sanitize(pts, heights) {
    const n = Array.isArray(pts) ? pts.length : 0;
    const out = new Array(n);
    const src = Array.isArray(heights) ? heights : null;
    for (let i = 0; i < n; i++) out[i] = src && i < src.length ? clampH(src[i]) : 0;
    return out;
  }

  function isFlat(heights) {
    if (!Array.isArray(heights) || !heights.length) return true;
    for (let i = 0; i < heights.length; i++) if (heights[i]) return false;
    return true;
  }

  function arcs(pts) {
    const n = pts.length, c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      c[i + 1] = c[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return c;
  }

  function bumpAt(sM, L, b) {
    if (!b || !(L > 0) || !(b.halfM > 0)) return 0;
    let d = Math.abs(sM - b.sFrac * L);
    d = Math.min(d, L - d);
    if (d >= b.halfM) return 0;
    return b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM));
  }

  function sample(pts, bumps) {
    const n = pts.length;
    if (!n) return [];
    const c = arcs(pts), L = c[n] || 1;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let y = 0;
      for (let k = 0; k < bumps.length; k++) y += bumpAt(c[i], L, bumps[k]);
      out[i] = y;
    }
    const base = out[0];
    for (let i = 0; i < n; i++) out[i] = clampH(out[i] - base);
    return out;
  }

  function rnd(seed, salt) {
    let x = Math.sin(((seed >>> 0) + salt * 78.233) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function plan(style, seed, L) {
    const s = String(style || "flat").toLowerCase();
    if (s === "flat" || !(L > 0)) return [];
    const hilly = s === "hilly";
    const n = hilly ? 3 + Math.floor(rnd(seed, 1) * 4) : 2 + Math.floor(rnd(seed, 1) * 3);
    const riseLo = hilly ? 12 : 4, riseHi = hilly ? 25 : 8;
    const halfLo = hilly ? 180 : 200, halfHi = hilly ? 420 : 400;
    const out = [];
    for (let i = 0; i < n; i++) {
      const sFrac = (i + 0.35 + rnd(seed, 10 + i) * 0.4) / n;
      const rise = (riseLo + rnd(seed, 20 + i) * (riseHi - riseLo)) * (rnd(seed, 30 + i) < 0.35 ? -1 : 1);
      const halfM = halfLo + rnd(seed, 40 + i) * (halfHi - halfLo);
      const cap = halfM / 19.6;
      out.push({ sFrac: ((sFrac % 1) + 1) % 1, halfM, rise: Math.sign(rise) * Math.min(Math.abs(rise), cap) });
    }
    return out;
  }

  function apply(style, pts, opts) {
    const name = NAMES.includes(String(style || "").toLowerCase()) ? String(style).toLowerCase() : "flat";
    const seed = opts && Number.isFinite(+opts.seed) ? (+opts.seed >>> 0) : 1;
    if (name === "flat" || !Array.isArray(pts) || pts.length < 3) {
      return { heights: sanitize(pts, null), style: "flat" };
    }
    const c = arcs(pts), L = c[pts.length] || 0;
    return { heights: sample(pts, plan(name, seed, L)), style: name };
  }

  return Object.freeze({
    clampH, sanitize, isFlat, apply, plan,
  });
})();
Object.freeze(ElevPresets);
