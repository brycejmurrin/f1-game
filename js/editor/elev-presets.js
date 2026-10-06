/* Apex 26 — ElevPresets: Flat / Rolling / Hilly node-height profiles for the
   track designer. Control points stay [x, z]; heights[] is parallel metres on
   the 0.25 m lattice (CustomTracks.LIMITS.rise). Presets sample a smooth
   cosine-bump mix onto each node so the Catmull-Rom centreline stays driveable.
   Pure; no DOM. LAZY_EDITOR (before profile.js / designer.js). */
const ElevPresets = (function () {
  "use strict";
  const UNIT = 4; // 0.25 m lattice
  const q = (v) => Math.round(v * UNIT) / UNIT;
  const lim = () => (typeof CustomTracks !== "undefined" && CustomTracks.LIMITS) || { rise: 60 };
  const NAMES = Object.freeze(["flat", "rolling", "hilly"]);

  /** Clamp one height onto the lattice inside ±rise. */
  function clampH(h) {
    const cap = lim().rise;
    const v = Number.isFinite(+h) ? +h : 0;
    return q(Math.min(cap, Math.max(-cap, v))) || 0;
  }

  /** Parallel heights for pts.length. Missing / short / garbage → zeros (flat).
   *  Longer lists are truncated. Always returns a fresh array. */
  function sanitize(pts, heights) {
    const n = Array.isArray(pts) ? pts.length : 0;
    const out = new Array(n);
    const src = Array.isArray(heights) ? heights : null;
    for (let i = 0; i < n; i++) out[i] = src && i < src.length ? clampH(src[i]) : 0;
    return out;
  }

  /** True when every height is 0 (or the list is empty). */
  function isFlat(heights) {
    if (!Array.isArray(heights) || !heights.length) return true;
    for (let i = 0; i < heights.length; i++) if (heights[i]) return false;
    return true;
  }

  /** Control-polygon arc lengths (closing chord included). */
  function arcs(pts) {
    const n = pts.length, c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      c[i + 1] = c[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return c;
  }

  /** Cosine bump height at arc metres s along lap L for {sFrac, halfM, rise}. */
  function bumpAt(sM, L, b) {
    if (!b || !(L > 0) || !(b.halfM > 0)) return 0;
    let d = Math.abs(sM - b.sFrac * L);
    d = Math.min(d, L - d);
    if (d >= b.halfM) return 0;
    return b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM));
  }

  /** Sample bumps onto every control point; return lattice heights. */
  function sample(pts, bumps) {
    const n = pts.length;
    if (!n) return [];
    const c = arcs(pts), L = c[n] || 1;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let y = 0;
      for (let k = 0; k < bumps.length; k++) y += bumpAt(c[i], L, bumps[k]);
      out[i] = clampH(y);
    }
    // Close the loop: pin start height, blend the last few metres into it.
    out[0] = 0;
    if (n > 2) {
      const blend = Math.min(3, n - 1);
      for (let j = 1; j <= blend; j++) {
        const i = n - j;
        const t = j / (blend + 1);
        out[i] = clampH(out[i] * (1 - t));
      }
    }
    return out;
  }

  /** Deterministic [0,1) from seed + salt (same family as TrackRandom). */
  function rnd(seed, salt) {
    let x = Math.sin(((seed >>> 0) + salt * 78.233) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  /** Build a bump list for style; empty for flat. */
  function plan(style, seed, L) {
    const s = String(style || "flat").toLowerCase();
    if (s === "flat" || !(L > 0)) return [];
    const hilly = s === "hilly";
    const n = hilly ? 3 + Math.floor(rnd(seed, 1) * 4) : 2 + Math.floor(rnd(seed, 1) * 3); // 3–6 / 2–4
    const riseLo = hilly ? 12 : 4, riseHi = hilly ? 25 : 8;
    const halfLo = hilly ? 180 : 200, halfHi = hilly ? 420 : 400;
    const out = [];
    for (let i = 0; i < n; i++) {
      const sFrac = (i + 0.35 + rnd(seed, 10 + i) * 0.4) / n;
      const rise = (riseLo + rnd(seed, 20 + i) * (riseHi - riseLo)) * (rnd(seed, 30 + i) < 0.35 ? -1 : 1);
      const halfM = halfLo + rnd(seed, 40 + i) * (halfHi - halfLo);
      // Keep grade under ~8 %: |rise| ≤ halfM / 19.6
      const cap = halfM / 19.6;
      out.push({ sFrac: ((sFrac % 1) + 1) % 1, halfM, rise: Math.sign(rise) * Math.min(Math.abs(rise), cap) });
    }
    return out;
  }

  /** Apply a named preset onto pts. Returns { heights, style }. One UNDO entry
   *  at the screen. Unknown style → flat. */
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
    NAMES, clampH, sanitize, isFlat, apply, arcs, sample, plan,
  });
})();
Object.freeze(ElevPresets);
