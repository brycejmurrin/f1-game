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
  /** The engine's two Laplacian passes over the controls (TrackDef.realPoints,
   *  weight 0.25): the built road is that much straighter than the raw loop. */
  function engineSmooth(pts) {
    let p = pts.map((q) => [q[0], q[1]]);
    const N = p.length;
    for (let it = 0; it < 2; it++) {
      const src = p;
      p = src.map((q, i) => { const a = src[S.wrapI(i - 1, N)], b = src[S.wrapI(i + 1, N)]; return [q[0] + 0.25 * ((a[0] + b[0]) / 2 - q[0]), q[1] + 0.25 * ((a[1] + b[1]) / 2 - q[1])]; });
    }
    return p;
  }
  /** Where the longest low-curvature run begins on a 4 m loop (`dense`, index
   *  0 at control 0) + the run's length (m), measured on the road the engine
   *  would build (its smoothing, its ±12 m window, TrackPit.PIT_K). */
  function longestStraight(pts, kMax = 0.0035) {
    const dense = S.resample(S.catmull(engineSmooth(pts), 8), 4, true), n = dense.length;
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
    // On the storage lattice (0.25 m) BEFORE the start is measured, so the loop
    // the straight was judged on is the loop that is returned.
    let ctrl = S.resample(dense, 30, true).map((p) => [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]);
    // Drive direction FIRST: a clockwise lap (as most F1 circuits), i.e. the
    // BUILT curvature sums to −2π (+k = LEFT turn). In this (x, z) frame a
    // left-turning loop has a NEGATIVE signedArea (TrackShape.signedArea), so
    // flip when it is negative. Flipping before the start is placed keeps the
    // "60 % along" measured in the direction the cars drive.
    if (S.signedArea(ctrl) < 0) ctrl = ctrl.slice().reverse();
    // Start line on the longest straight, 60 % along it (grid behind, pit entry
    // ahead). Twice: the 4 m resample starts at control 0, so rotating the loop
    // re-phases it, and a straight whose curvature sits near PIT_K can read as
    // one run from the new origin where it read as two from the old.
    let ls = null;
    for (let pass = 0; pass < 2; pass++) {
      ls = longestStraight(ctrl);
      const at = ls.dense[(ls.start + Math.round(Math.min(Math.max(ls.lenM * 0.6, 240), Math.max(ls.lenM - 140, 0)) / 4)) % ls.dense.length];
      const j = S.project(ctrl, at[0], at[1]).i;
      if (!j) break;
      ctrl = S.rotate(ctrl, j);
    }
    return { pts: ctrl, seed: seed >>> 0, targetL: Math.round(targetL), straightM: ls.lenM };
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

  // ── DESIGNED RANDOMISE: many seeds, judged and ranked for a style ─────────
  /** The style weights TrackInsight.score reads (named, not pinned by a test). */
  const STYLES = Object.freeze({
    FAST: Object.freeze({ F: 2, P: 0.5, Hv: 0.5, A: -0.3, C: -0.2, cFree: 3 }),     // flat out, a place to pass, a varied speed trace
    TECHNICAL: Object.freeze({ Hc: 1.5, C: 0.4, F: -1, P: 0.2, A: -0.3 }),          // many corners of many radii
    MIXED: Object.freeze({ Hc: 1, Hv: 1, P: 0.3, A: -0.3 }),                         // the variety of both
  });
  /** A well-spread uint32 (Hash32.mix; its murmur finaliser inline when Hash32 is not loaded). */
  function mix32(h) {
    if (typeof Hash32 !== "undefined" && Hash32.mix) return Hash32.mix(h >>> 0);
    h >>>= 0; h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return h >>> 0;
  }
  /** The i-th candidate seed of a design run (golden-ratio stride, then mixed). */
  const designSeed = (baseSeed, i) => mix32((baseSeed + Math.imul(i + 1, 0x9e3779b9)) >>> 0);
  /** One candidate of a design run: generateValid(seed_i) judged by opts.check
   *  (a design → verdict; the caller's validator), scored by opts.score(verdict,
   *  style) → a number or { score, feats }. The verdict's tr / stats / issues
   *  ride along so nothing rebuilds. null when no try was green. opts.base is
   *  the look of the circuit only (theme, baseHW, kerbs…): the old loop's heights,
   *  bridges and zones would be judged against a road they do not belong to. */
  function designOne(baseSeed, i, style, opts) {
    const base = opts.base || {};
    let last = null;
    const r = generateValid(designSeed(baseSeed, i), (pts) => (last = opts.check(Object.assign({}, base, { pts }))).ok, opts.tries || 3);
    if (!r.ok || !last || !last.ok) return null;
    const sc = opts.score ? opts.score(last, style) : 0, num = typeof sc === "number" ? sc : sc && sc.score;
    return { seed: r.seed, pts: r.pts, score: Number.isFinite(num) ? num : -Infinity, feats: sc && typeof sc === "object" ? sc.feats : undefined, tr: last.tr, stats: last.stats, issues: last.issues, amber: last.amber, turns: last.turns };
  }
  /** Unique by seed, best score first (ties: the lower seed), the top `keep`. */
  function rank(list, keep = 4) {
    const seen = new Set(), out = [];
    for (const c of list) if (c && !seen.has(c.seed)) { seen.add(c.seed); out.push(c); }
    out.sort((a, b) => (b.score - a.score) || (a.seed - b.seed));
    return out.slice(0, keep);
  }
  /** DESIGNED RANDOMISE: opts.n (16) seeds from baseSeed, opts.tries (3) each,
   *  the green ones ranked by opts.score for `style` → the top 4
   *  [{ seed, pts, score, feats, tr, stats, issues }]. Deterministic per
   *  (baseSeed, style); the validator and the scorer are passed IN. */
  function design(baseSeed, style, opts) {
    opts = Object.assign({ n: 16, tries: 3 }, opts);
    if (typeof opts.check !== "function") throw new Error("TrackRandom.design needs opts.check");
    const list = [];
    for (let i = 0; i < opts.n; i++) list.push(designOne(baseSeed >>> 0, i, style, opts));
    return rank(list, opts.keep || 4);
  }
  /** MORE LIKE THIS: 2–3 controls more than 300 m from the start line (both
   *  ways round, so the start straight survives) each moved up to 60 m at a
   *  random angle, re-spaced (8 m) and on the lattice; up to 8 attempts, the
   *  first that opts.check(pts).ok accepts. { pts, ok, seed, verdict }. */
  function mutate(pts, seed, opts) {
    opts = opts || {};
    const rnd = S.rng((seed ^ 0x5bd1e995) >>> 0), N = pts.length;
    const arc = [0];
    for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; arc.push(arc[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const L = arc[N], keepM = opts.keepM != null ? opts.keepM : 300, maxM = opts.maxM != null ? opts.maxM : 60;
    const free = [];
    for (let i = 1; i < N; i++) if (arc[i] > keepM && L - arc[i] > keepM) free.push(i);
    let last = { pts: pts.map((p) => [p[0], p[1]]), ok: false, seed: seed >>> 0, verdict: null, moved: [] };
    if (free.length < 3) return last;
    for (let attempt = 0; attempt < (opts.attempts || 8); attempt++) {
      const k = 2 + (rnd() < 0.5 ? 1 : 0), pick = new Set();
      while (pick.size < k) pick.add(free[Math.floor(rnd() * free.length)]);
      const next = pts.map((p) => [p[0], p[1]]);
      for (const i of pick) {
        const rho = (maxM - 0.25) * (0.25 + 0.75 * rnd()), th = rnd() * 2 * Math.PI;
        next[i] = [next[i][0] + rho * Math.cos(th), next[i][1] + rho * Math.sin(th)];
      }
      // Lattice first (ρ stops 0.25 m short of maxM, so the snap stays inside it), then the spacing floor.
      const out = S.enforceSpacing(next.map((p) => [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]), 8);
      const verdict = opts.check ? opts.check(out) : null;
      last = { pts: out, ok: !opts.check || !!(verdict && verdict.ok), seed: seed >>> 0, verdict, moved: [...pick].sort((a, b) => a - b) };
      if (last.ok) return last;
    }
    return last;
  }

  return { generate, generateValid, pushApart, fixAngles, longestStraight, STYLES, designSeed, designOne, rank, design, mutate };
})();
Object.freeze(TrackRandom);
