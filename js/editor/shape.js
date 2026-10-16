/* Apex 26 — TrackShape: the track designer's 2D geometry kit. Pure functions over
   [x, z] control points (metres, +Y up world; a loop is implicitly closed) in the
   engine's heading convention — direction (sin θ, cos θ), +θ turns LEFT
   (js/track/core/spline.js centerline()). Arcs and straights sampled exactly, a
   Dubins planner (six words, r ≥ the hairpin floor) to rejoin a stamped span to
   the loop with no global closure solver, Ramer-Douglas-Peucker for freehand
   strokes, arc-length resampling, a Catmull-Rom densifier that matches the
   engine's uniform spline, Menger radius, and the grid-hashed crossing and
   clearance scans the validator reads. LAZY_EDITOR: no eval-time dependencies. */
const TrackShape = (function () {
  "use strict";
  const TAU = Math.PI * 2;
  const hyp = Math.hypot;
  const wrapI = (i, N) => ((i % N) + N) % N;
  const mod2pi = (a) => ((a % TAU) + TAU) % TAU;
  const wrapAngle = (a) => { a = mod2pi(a); return a > Math.PI ? a - TAU : a; };

  /** Heading at control point i by centred difference over the closed loop. */
  function heading(pts, i) {
    const N = pts.length, a = pts[wrapI(i - 1, N)], b = pts[wrapI(i + 1, N)];
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
  function polyLen(pts, closed = true) {
    let L = 0;
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; L += hyp(q[0] - p[0], q[1] - p[1]); }
    return L;
  }
  function centroid(pts) {
    let x = 0, z = 0;
    for (const p of pts) { x += p[0]; z += p[1]; }
    return [x / pts.length, z / pts.length];
  }
  /** Signed area (shoelace over x, z): < 0 when the loop turns LEFT overall
   *  (built Σk = +2π, +k = LEFT), > 0 when it turns RIGHT (clockwise as a
   *  circuit map reads). Measured through the engine: a loop built to Σk = −2π
   *  reads positive here, and its reverse negative (track-randomise.test.mjs). */
  function signedArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  }

  // ── exact primitives ────────────────────────────────────────────────────
  /** Straight of L metres from pose {x, z, th}; points every ≤ h m, start excluded. */
  function straightPts(pose, L, h) {
    const n = Math.max(1, Math.ceil(L / (h || 25))), out = [];
    const sx = Math.sin(pose.th), cz = Math.cos(pose.th);
    for (let i = 1; i <= n; i++) out.push([pose.x + sx * L * i / n, pose.z + cz * L * i / n]);
    return { pts: out, end: { x: pose.x + sx * L, z: pose.z + cz * L, th: pose.th } };
  }
  /** Arc of radius R sweeping `sweep` radians (+ = left) from pose; start excluded.
   *  `n` steps when given (arcSteps), else ≤ h m and ≤ 10° per step. Each point is
   *  the exact chord from the start, so the last one IS the analytic end pose. */
  function arcPts(pose, R, sweep, h, n) {
    const len = Math.abs(sweep) * R;
    n = n || Math.max(1, Math.ceil(Math.max(len / (h || 8), Math.abs(sweep) / (10 * Math.PI / 180))));
    const out = [], dth = sweep / n;
    for (let i = 1; i <= n; i++) {
      // the chord to step i leaves at the mean heading: exact for a circle
      const a = i * dth, c = 2 * R * Math.sin(Math.abs(a) / 2), mid = pose.th + a / 2;
      out.push([pose.x + Math.sin(mid) * c, pose.z + Math.cos(mid) * c]);
    }
    const e = out[out.length - 1];
    return { pts: out, end: { x: e[0], z: e[1], th: pose.th + sweep } };
  }
  /** Steps for an arc of radius R: ≈ `step` rad each (default 10°), but chords never
   *  above cMax (n ≥ ⌈RΘ/cMax⌉) and never below cMin (2R sin(Θ/2n) ≥ cMin wins). */
  function arcSteps(R, sweep, cMin, cMax, step) {
    const A = Math.abs(sweep), chord = (n) => 2 * R * Math.sin(A / (2 * n));
    let n = Math.max(Math.ceil(A / (step || 10 * Math.PI / 180)), Math.ceil(R * A / cMax), 1);
    while (n > 1 && chord(n) < cMin) n--;
    return n;
  }

  /** A clothoid (Euler spiral) of length L from pose: curvature runs linearly
   *  k0 → k1 (both ≥ 0, `dir` +1 LEFT / −1 RIGHT), so θ(s) = θ0 + dir·(k0·s +
   *  ½·c·s²) with c = (k1 − k0) / L — c = 1/(Rc·Ls) for a spiral into an arc of
   *  Rc (https://en.wikipedia.org/wiki/Euler_spiral). Integrated by midpoint
   *  steps of 0.5 m and emitted at EQUAL arc steps of ≈ clamp(cMin, cMax,
   *  stepMax / k) at the sharp end — the chord of the arc it meets, so the
   *  engine's uniform spline sees even spacing (a chord grown per-point from
   *  the straight end measured a ripple at every change). Chords stay ≥ cMin;
   *  the last point is the end: { pts (start excluded), end } with end.th analytic. */
  function clothoidPts(pose, k0, k1, L, dir, cMin, cMax, stepMax) {
    const sg = dir < 0 ? -1 : 1, c = L > 0 ? (k1 - k0) / L : 0, H = 0.5;
    const th = (s) => pose.th + sg * (k0 * s + 0.5 * c * s * s);
    const kMax = Math.max(Math.abs(k0), Math.abs(k1));
    const step = Math.min(cMax, Math.max(cMin, kMax > 1e-12 ? stepMax / kMax : cMax));
    let n = Math.max(1, Math.round(L / step));
    while (n > 1 && (L / n) * (1 - Math.pow(L / n * kMax, 2) / 24) < cMin) n--;   // chord ≥ cMin
    const out = [];
    let x = pose.x, z = pose.z, s = 0;
    for (let i = 1; i <= n; i++) {
      const to = L * i / n;
      while (s < to - 1e-9) { const h = Math.min(H, to - s), t = th(s + h / 2); x += h * Math.sin(t); z += h * Math.cos(t); s += h; }
      out.push([x, z]);
    }
    return { pts: out, end: { x, z, th: th(L) } };
  }

  // ── Dubins (shortest CSC/CCC path between two poses, turning radius r) ──
  // Computed in the textbook frame (heading φ with direction (cos φ, sin φ),
  // L = +φ) over X = x, Y = z. Our θ maps to φ = π/2 − θ, so the geometry is
  // the same curve and only the letters swap meaning; callers never see them.
  function dubinsWords(d, al, be) {
    const sa = Math.sin(al), sb = Math.sin(be), ca = Math.cos(al), cb = Math.cos(be), cab = Math.cos(al - be);
    const out = [];
    let p2, p, t, q, tmp;
    // LSL
    p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb);
    if (p2 >= 0) { tmp = Math.atan2(cb - ca, d + sa - sb); t = mod2pi(-al + tmp); p = Math.sqrt(p2); q = mod2pi(be - tmp); out.push({ w: "LSL", t, p, q }); }
    // RSR
    p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa);
    if (p2 >= 0) { tmp = Math.atan2(ca - cb, d - sa + sb); t = mod2pi(al - tmp); p = Math.sqrt(p2); q = mod2pi(-be + tmp); out.push({ w: "RSR", t, p, q }); }
    // LSR
    p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb);
    if (p2 >= 0) { p = Math.sqrt(p2); tmp = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p); t = mod2pi(-al + tmp); q = mod2pi(-mod2pi(be) + tmp); out.push({ w: "LSR", t, p, q }); }
    // RSL
    p2 = d * d - 2 + 2 * cab - 2 * d * (sa + sb);
    if (p2 >= 0) { p = Math.sqrt(p2); tmp = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p); t = mod2pi(al - tmp); q = mod2pi(be - tmp); out.push({ w: "RSL", t, p, q }); }
    // RLR
    tmp = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8;
    if (Math.abs(tmp) <= 1) { p = mod2pi(TAU - Math.acos(tmp)); t = mod2pi(al - Math.atan2(ca - cb, d - sa + sb) + mod2pi(p / 2)); q = mod2pi(al - be - t + mod2pi(p)); out.push({ w: "RLR", t, p, q }); }
    // LRL
    tmp = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8;
    if (Math.abs(tmp) <= 1) { p = mod2pi(TAU - Math.acos(tmp)); t = mod2pi(-al - Math.atan2(ca - cb, d + sa - sb) + p / 2); q = mod2pi(mod2pi(be) - al - t + mod2pi(p)); out.push({ w: "LRL", t, p, q }); }
    for (const o of out) o.len = o.t + o.p + o.q;
    return out;
  }
  /** Integrate one word from pose q0 (our frame) and return the points + end pose.
   *  Straights every ≤ h m; arcs ≤ 10° per step, and ≤ h m — or, with `chord` =
   *  [min, max, step], chords kept inside [min, max] m (arcSteps) at ≈ 10° on the
   *  word's FIRST piece (what meets the caller's road) and ≈ `step` rad after it. */
  function dubinsSample(q0, word, r, h, chord) {
    // standard frame
    let X = q0.x, Y = q0.z, phi = Math.PI / 2 - q0.th;
    const out = [];
    const segs = [[word.w[0], word.t], [word.w[1], word.p], [word.w[2], word.q]];
    for (const [si, [kind, lenU]] of segs.entries()) {
      const len = lenU * r;
      if (len < 1e-9) continue;
      const n = kind === "S" ? Math.max(1, Math.ceil(len / (h || 25))) : chord ? arcSteps(r, lenU, chord[0], chord[1], si ? chord[2] : 0)
        : Math.max(1, Math.ceil(Math.max(len / (h || 8), lenU / (10 * Math.PI / 180))));
      const dl = len / n;
      for (let i = 0; i < n; i++) {
        if (kind === "S") { X += Math.cos(phi) * dl; Y += Math.sin(phi) * dl; }
        else {
          const sgn = kind === "L" ? 1 : -1, dphi = sgn * dl / r, mid = phi + dphi / 2, chord = 2 * r * Math.sin(Math.abs(dphi) / 2);
          X += Math.cos(mid) * chord; Y += Math.sin(mid) * chord; phi += dphi;
        }
        out.push([X, Y]);
      }
    }
    return { pts: out, end: { x: X, z: Y, th: wrapAngle(Math.PI / 2 - phi) }, len: word.len * r };
  }
  /** Shortest Dubins path q0 → q1 at radius r: { pts, end, len, word } or null
   *  (h, chord: the sampling, as dubinsSample). */
  function dubins(q0, q1, r, h, chord) {
    const dx = q1.x - q0.x, dy = q1.z - q0.z, D = hyp(dx, dy);
    const psi = Math.atan2(dy, dx), d = D / r;
    const al = mod2pi((Math.PI / 2 - q0.th) - psi), be = mod2pi((Math.PI / 2 - q1.th) - psi);
    const words = dubinsWords(d, al, be).filter((w) => Number.isFinite(w.len)).sort((a, b) => a.len - b.len);
    for (const w of words) {
      const s = dubinsSample(q0, w, r, h, chord);
      // The closed forms have sign corners; only trust a word whose integration lands.
      if (hyp(s.end.x - q1.x, s.end.z - q1.z) < 0.02 * r + 0.05 && Math.abs(wrapAngle(s.end.th - q1.th)) < 0.02) return Object.assign(s, { word: w.w });
    }
    return null;
  }

  // ── polyline tools ──────────────────────────────────────────────────────
  /** Ramer-Douglas-Peucker on an OPEN polyline; eps in metres. */
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const A = pts[a], B = pts[b], ex = B[0] - A[0], ez = B[1] - A[1], l2 = ex * ex + ez * ez;
      let best = -1, bd = 0;
      for (let i = a + 1; i < b; i++) {
        const P = pts[i];
        let dist;
        if (l2 < 1e-12) dist = hyp(P[0] - A[0], P[1] - A[1]);
        else { const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * ex + (P[1] - A[1]) * ez) / l2)); dist = hyp(P[0] - (A[0] + ex * t), P[1] - (A[1] + ez * t)); }
        if (dist > bd) { bd = dist; best = i; }
      }
      if (best >= 0 && bd > eps) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }
  /** Equal-spacing resample of a polyline (closed by default); the first point is kept. */
  function resample(pts, spacing, closed = true) {
    const N = pts.length, segs = closed ? N : N - 1, L = polyLen(pts, closed);
    const n = Math.max(closed ? 8 : 2, Math.round(L / spacing)), step = L / (closed ? n : n - 1), out = [];
    let seg = 0, acc = 0, segLen = 0;
    const segAt = (k) => { const p = pts[k % N], q = pts[(k + 1) % N]; return [p, q, hyp(q[0] - p[0], q[1] - p[1])]; };
    let [p, q, sl] = segAt(0); segLen = sl;
    for (let k = 0; k < n; k++) {
      const target = k * step;
      while (acc + segLen < target - 1e-9 && seg < segs - 1) { acc += segLen; seg++; [p, q, sl] = segAt(seg); segLen = sl; }
      const f = segLen > 0 ? Math.min(1, (target - acc) / segLen) : 0;
      out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
    }
    return out;
  }
  /** Uniform Catmull-Rom (the engine's, spline.js cr) densified `sub` per segment over a closed loop. */
  function catmull(pts, sub = 8) {
    const N = pts.length, out = [];
    const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
    for (let i = 0; i < N; i++) {
      const a = pts[wrapI(i - 1, N)], b = pts[i], c = pts[wrapI(i + 1, N)], d = pts[wrapI(i + 2, N)];
      for (let j = 0; j < sub; j++) { const t = j / sub; out.push([cr(a[0], b[0], c[0], d[0], t), cr(a[1], b[1], c[1], d[1], t)]); }
    }
    return out;
  }
  /** Circumradius of three points (Menger); Infinity on a straight. */
  function menger(a, b, c) {
    const ab = hyp(b[0] - a[0], b[1] - a[1]), bc = hyp(c[0] - b[0], c[1] - b[1]), ca = hyp(a[0] - c[0], a[1] - c[1]);
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    return area2 < 1e-9 ? Infinity : (ab * bc * ca) / (2 * area2);
  }
  /** Rotate so index j becomes 0. */
  function rotate(pts, j) { j = wrapI(j, pts.length); return pts.slice(j).concat(pts.slice(0, j)); }
  /** Nearest point on the closed polyline to (x, z): { i, f, x, z, d, s } with s the arc from index 0. */
  function project(pts, x, z) {
    const N = pts.length;
    let best = null, acc = 0;
    for (let i = 0; i < N; i++) {
      const p = pts[i], q = pts[(i + 1) % N], ex = q[0] - p[0], ez = q[1] - p[1], l2 = ex * ex + ez * ez || 1e-12;
      const t = Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[1]) * ez) / l2));
      const px = p[0] + ex * t, pz = p[1] + ez * t, d = hyp(x - px, z - pz), sl = Math.sqrt(l2);
      if (!best || d < best.d) best = { i, f: t, x: px, z: pz, d, s: acc + t * sl };
      acc += sl;
    }
    return best;
  }
  /** Merge control points closer than `min` to their predecessor (index 0 always
   *  kept). A `protect`ed input index (a stamp's tangent point) evicts unprotected
   *  predecessors that crowd it instead of being dropped; spacing ≥ min always holds. */
  function enforceSpacing(pts, min, protect) {
    const out = [pts[0]], prot = [true];
    const near = (a, b) => hyp(a[0] - b[0], a[1] - b[1]) < min;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], keep = !!(protect && protect.has(i));
      if (keep) while (out.length > 1 && !prot[prot.length - 1] && near(out[out.length - 1], p)) { out.pop(); prot.pop(); }
      if (near(out[out.length - 1], p)) continue;
      out.push(p); prot.push(keep);
    }
    // …and the seam back to index 0.
    while (out.length > 3 && near(out[out.length - 1], out[0])) out.pop();
    return out;
  }
  function convexHull(pts) {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  // ── intersection + clearance scans (on the engine's dense 4 m nodes) ────
  /** Segment AB × CD, endpoints included (a crossing that lands on a node still counts); null when parallel or apart. */
  function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
    const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    if (d1 * d2 <= 0 && d3 * d4 <= 0 && !(d1 === 0 && d2 === 0)) {
      const t = d1 === d2 ? 0 : d1 / (d1 - d2);
      return [ax + (bx - ax) * t, az + (bz - az) * t];
    }
    return null;
  }
  /** Every crossing of the closed node polyline (px, pz, n) with itself, wrapped
   *  index gap > `gap` nodes: [{ i, j, x, z }] with i < j. Grid-hashed, 32 m cells. */
  function crossings(px, pz, n, gap = 3, cell = 32) {
    const grid = new Map();
    const key = (cx, cz) => cx + "," + cz;
    const bounds = (i) => { const j = (i + 1) % n; return [Math.floor(Math.min(px[i], px[j]) / cell), Math.floor(Math.max(px[i], px[j]) / cell), Math.floor(Math.min(pz[i], pz[j]) / cell), Math.floor(Math.max(pz[i], pz[j]) / cell)]; };
    for (let i = 0; i < n; i++) { const [x0, x1, z0, z1] = bounds(i); for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { const k = key(cx, cz); (grid.get(k) || grid.set(k, []).get(k)).push(i); } }
    const seen = new Set(), out = [];
    for (const list of grid.values()) {
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const i = Math.min(list[a], list[b]), j = Math.max(list[a], list[b]);
        const dg = Math.min(j - i, n - (j - i));
        if (dg <= Math.max(gap, 1)) continue;   // adjacent segments share a node: never a crossing
        const sk = i + ":" + j; if (seen.has(sk)) continue; seen.add(sk);
        const hit = segIntersect(px[i], pz[i], px[(i + 1) % n], pz[(i + 1) % n], px[j], pz[j], px[(j + 1) % n], pz[(j + 1) % n]);
        if (hit) out.push({ i, j, x: hit[0], z: hit[1] });
      }
    }
    out.sort((p, q) => p.i - q.i || p.j - q.j);
    // A crossing on a node is seen by both segments that share it: one report per place.
    const uniq = [];
    for (const c of out) { const last = uniq[uniq.length - 1]; if (last && Math.abs(c.i - last.i) <= 1 && Math.abs(c.j - last.j) <= 1 && hyp(c.x - last.x, c.z - last.z) < 6) continue; uniq.push(c); }
    return uniq;
  }
  /** Closest approach between non-adjacent spans: for each node the nearest node
   *  more than `minArc` away along the lap (and within `vSep` m vertically when py
   *  is given). Returns the worst K pairs: [{ i, j, dist, dy }]. */
  function clearance(px, pz, py, n, minArc, vSep, cell = 24, keep = 8) {
    const grid = new Map(), key = (cx, cz) => cx + "," + cz;
    for (let i = 0; i < n; i++) { const k = key(Math.floor(px[i] / cell), Math.floor(pz[i] / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
    const worst = [];
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(px[i] / cell), cz = Math.floor(pz[i] / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const list = grid.get(key(cx + ox, cz + oz)); if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const dg = Math.min(j - i, n - (j - i));
          if (dg <= minArc) continue;
          const dy = py ? Math.abs(py[i] - py[j]) : 0;
          if (dy >= vSep) continue;
          const dist = hyp(px[i] - px[j], pz[i] - pz[j]);
          if (worst.length < keep || dist < worst[worst.length - 1].dist) {
            worst.push({ i, j, dist, dy }); worst.sort((a, b) => a.dist - b.dist); if (worst.length > keep) worst.pop();
          }
        }
      }
    }
    return worst;
  }

  /** mulberry32: a tiny seeded stream for the randomiser and fixAngles jitter. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** Control indices from `a` to `b` inclusive, walking forward around the loop.
   *  One point when `b` is missing / equal; empty when `a` is out of range. The
   *  designer uses this for a selected SPAN: move, elevate or stamp the group. */
  function spanIndices(a, b, N) {
    N = N | 0;
    if (!(N > 0) || !Number.isInteger(a) || a < 0 || a >= N) return [];
    if (!Number.isInteger(b) || b < 0 || b >= N || b === a) return [a];
    const out = [a];
    for (let i = a, n = 0; n < N && i !== b; n++) { i = (i + 1) % N; out.push(i); }
    return out;
  }
  /** True when index `i` lies on the forward span from `a` to `b` (inclusive). */
  function inSpan(i, a, b, N) {
    if (!Number.isInteger(i) || i < 0 || i >= N) return false;
    const g = spanIndices(a, b, N);
    for (let k = 0; k < g.length; k++) if (g[k] === i) return true;
    return false;
  }

  return { TAU, wrapI, mod2pi, wrapAngle, heading, polyLen, centroid, signedArea, straightPts, arcPts, arcSteps, clothoidPts, dubins, dubinsWords, dubinsSample,
    rdp, resample, catmull, menger, rotate, project, enforceSpacing, convexHull, segIntersect, crossings, clearance, rng, spanIndices, inSpan };
})();
Object.freeze(TrackShape);
