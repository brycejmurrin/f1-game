/* Apex 26 — TrackRandom: the RANDOMISE button. Gustavo Maciel's method
   (gamedeveloper.com/programming/generating-procedural-racetracks): scatter
   points, take the convex hull, push apart, displace each edge's midpoint, fix
   angles, then spline and resample — scaled to a 3.5–6 km lap and rotated so the
   start line sits on the longest straight. Deterministic per seed
   (TrackShape.rng), so a share code's seed reproduces the same loop and a test
   can pin one. LAZY_EDITOR; needs TrackShape at eval. */
const TrackRandom = (function () {
  "use strict";
  const S = TrackShape;

  function pushApart(pts, min, rnd) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1], d = Math.hypot(dx, dz);
      if (d >= min || d < 1e-9) { if (d < 1e-9) { pts[j][0] += (rnd() - 0.5) * min; pts[j][1] += (rnd() - 0.5) * min; } continue; }
      const push = (min - d) / 2, ux = dx / d, uz = dz / d;
      pts[i][0] -= ux * push; pts[i][1] -= uz * push; pts[j][0] += ux * push; pts[j][1] += uz * push;
    }
  }
  /** Where a vertex turns harder than maxTurn (degrees), relax it toward the neighbours' midpoint. */
  function fixAngles(pts, maxTurn) {
    const N = pts.length, lim = maxTurn * Math.PI / 180;
    let moved = 0;
    for (let i = 0; i < N; i++) {
      const a = pts[S.wrapI(i - 1, N)], b = pts[i], c = pts[S.wrapI(i + 1, N)];
      const h0 = Math.atan2(b[0] - a[0], b[1] - a[1]), h1 = Math.atan2(c[0] - b[0], c[1] - b[1]);
      if (Math.abs(S.wrapAngle(h1 - h0)) <= lim) continue;
      b[0] += ((a[0] + c[0]) / 2 - b[0]) * 0.3; b[1] += ((a[1] + c[1]) / 2 - b[1]) * 0.3; moved++;
    }
    return moved;
  }
  /** Index of the control point where the longest low-curvature run begins + the run's length (m). */
  function longestStraight(pts, kMax = 0.0035) {
    const dense = S.resample(S.catmull(pts, 8), 4, true), n = dense.length;
    const flat = new Uint8Array(n);
    for (let i = 0; i < n; i++) flat[i] = 1 / S.menger(dense[S.wrapI(i - 3, n)], dense[i], dense[S.wrapI(i + 3, n)]) <= kMax ? 1 : 0;
    let best = { start: 0, len: 0 }, run = 0, start = 0;
    for (let i = 0; i < 2 * n; i++) {
      if (flat[i % n]) { if (!run) start = i % n; run++; if (run > best.len) best = { start, len: run }; }
      else run = 0;
      if (run >= n) break;
    }
    return { start: best.start, lenM: best.len * 4, dense };
  }

  /** One loop for a seed: { pts (≈30 m apart, index 0 = start line), seed, targetL }. */
  function generate(seed, opts) {
    opts = opts || {};
    const rnd = S.rng(seed);
    const targetL = opts.targetL || 3500 + rnd() * 2500;
    const box = targetL / 3.4;
    const count = 12 + Math.floor(rnd() * 8);
    let pts = [];
    for (let i = 0; i < count; i++) pts.push([(rnd() - 0.5) * box, (rnd() - 0.5) * box]);
    pts = S.convexHull(pts);
    for (let k = 0; k < 3; k++) pushApart(pts, box * 0.18, rnd);
    // Displaced midpoints give the hull its concave bites.
    const dif = opts.difficulty != null ? opts.difficulty : 1;
    const bitten = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez) || 1;
      const nx = -ez / len, nz = ex / len, disp = Math.pow(rnd(), dif) * (rnd() < 0.5 ? -1 : 1) * len * 0.6;
      bitten.push(a, [(a[0] + b[0]) / 2 + nx * disp, (a[1] + b[1]) / 2 + nz * disp]);
    }
    pts = bitten;
    for (let k = 0; k < 10; k++) { pushApart(pts, box * 0.08, rnd); if (!fixAngles(pts, 100)) break; }
    // Smooth, scale to the target lap, re-space to ~30 m controls.
    let dense = S.resample(S.catmull(pts, 8), 4, true);
    const L = S.polyLen(dense, true), k = targetL / L;
    const c = S.centroid(dense);
    dense = dense.map((p) => [(p[0] - c[0]) * k, (p[1] - c[1]) * k]);
    let ctrl = S.resample(dense, 30, true);
    // Start line on the longest straight, 60 % along it (grid behind, pit entry ahead).
    const ls = longestStraight(ctrl);
    const sIdx = S.project(ctrl, ls.dense[(ls.start + Math.round(Math.min(Math.max(ls.lenM * 0.6, 240), Math.max(ls.lenM - 140, 0)) / 4)) % ls.dense.length][0],
      ls.dense[(ls.start + Math.round(Math.min(Math.max(ls.lenM * 0.6, 240), Math.max(ls.lenM - 140, 0)) / 4)) % ls.dense.length][1]).i;
    ctrl = S.rotate(ctrl, sIdx);
    // Drive direction: a clockwise lap (as most F1 circuits) — flip when the area says left-turning.
    if (S.signedArea(ctrl) > 0) ctrl = [ctrl[0]].concat(ctrl.slice(1).reverse());
    return { pts: ctrl.map((p) => [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]), seed: seed >>> 0, targetL: Math.round(targetL), straightM: ls.lenM };
  }

  /** Generate until `accept(pts)` is true (≤ tries seeds); returns the last attempt either way. */
  function generateValid(seed, accept, tries = 12, opts) {
    let s = seed >>> 0, last = null;
    for (let i = 0; i < tries; i++) {
      last = generate(s, opts);
      if (!accept || accept(last.pts, last)) { last.ok = true; return last; }
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 1) >>> 0;
    }
    last.ok = false;
    return last;
  }

  return { generate, generateValid, pushApart, fixAngles, longestStraight };
})();
Object.freeze(TrackRandom);
