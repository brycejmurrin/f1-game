/* Apex 26 — TrackSpline: pure centreline / spline math for the tracks engine. centerline() integrates an authored segment list into closed control points, cr() is… */
const TrackSpline = (function () {
  "use strict";

  const SCALE = 1.45;            // scale authored lengths for arcade racing
  const lerp = M4.lerp;

  // seg = {t:turnDeg(+left), l:len m, h:hillDelta m, b:bank rad, w:halfWidth}
  // Integrates a heading where direction = (sin t, cos t); +turn = LEFT —
  // the same measured convention curvatureRaw() documents below (a zero-steer
  // run through a +k corner drifts wide to the right).
  // A real circuit must net ~±360°; we distribute any deficit as gentle
  // curvature across the whole lap so corner character is preserved and the
  // loop closes without squashing.
  function centerline(segs, baseHW) {
    Log.info("track", "centerline segs=" + (segs && segs.length));
    // pass 1: break into fine steps (cap degrees-per-step to avoid Catmull overshoot)
    const steps = [];
    let totalDeg = 0;
    for (const s of segs) {
      const len = s.l * SCALE;
      const nst = Math.max(1, Math.ceil(Math.max(len / 14, Math.abs(s.t || 0) / 13)));
      const dlDeg = (s.t || 0) / nst;
      for (let i = 0; i < nst; i++) {
        steps.push({ dl: len / nst, deg: dlDeg, dy: (s.h || 0) / nst, w: s.w || baseHW, b: s.b || 0 });
        totalDeg += dlDeg;
      }
    }
    // closure curvature: bend the whole lap toward net ±360
    const target = 360 * (totalDeg >= 0 ? 1 : -1);
    const corr = (target - totalDeg) / steps.length;
    // pass 2: integrate
    const pts = [];
    let x = 0, z = 0, y = 0, th = 0;
    for (const st of steps) {
      th += (st.deg + corr) * Math.PI / 180;
      x += Math.sin(th) * st.dl; z += Math.cos(th) * st.dl; y += st.dy;
      pts.push([x, y, z, st.w, st.b]);
    }
    // distribute residual position + elevation so the loop closes seamlessly
    const N = pts.length;
    const ex = pts[N - 1][0], ez = pts[N - 1][2], ey = pts[N - 1][1];
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      pts[i][0] -= ex * f; pts[i][2] -= ez * f; pts[i][1] -= ey * f;
    }
    for (let it = 0; it < 2; it++) {
      const sx = pts.map((p) => p[0]), sz = pts.map((p) => p[2]);
      const L = 0.18;
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N, b = (i + 1) % N;
        pts[i][0] = sx[i] + L * ((sx[a] + sx[b]) * 0.5 - sx[i]);
        pts[i][2] = sz[i] + L * ((sz[a] + sz[b]) * 0.5 - sz[i]);
      }
    }
    return pts;
  }

  // Catmull-Rom for one component. UNIFORM: the parameter t is per control INDEX,
  // not per chord length, so irregular control spacing (a 260 m chord next to a
  // 13 m one at a hairpin) overshoots. crc() below is the opt-in centripetal form.
  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  // Opt-in Catmull-Rom with chord-length knots (def.splineAlpha: 0.5 =
  // centripetal, 1 = chordal; Barry-Goldman pyramid) for the segment b->c of
  // control points a,b,c,d (arrays, x/y/z at [0..2]); writes x/y/z to out. Knot
  // spacing is |chord|^alpha, so it tracks irregular control spacing and does not
  // overshoot at a hairpin — but it moves the whole path (median ~9.5 m at alpha
  // 0.5), so it is per-circuit and off by default (buildCenterline calls cr()).
  function crc(a, b, c, d, t, alpha, out) {
    const EPS = 1e-6;
    const k1 = Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + EPS, alpha);
    const k2 = k1 + Math.pow(Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]) + EPS, alpha);
    const k3 = k2 + Math.pow(Math.hypot(d[0] - c[0], d[1] - c[1], d[2] - c[2]) + EPS, alpha);
    const u = k1 + t * (k2 - k1);
    for (let i = 0; i < 3; i++) {
      const a1 = ((k1 - u) * a[i] + u * b[i]) / k1;
      const a2 = ((k2 - u) * b[i] + (u - k1) * c[i]) / (k2 - k1);
      const a3 = ((k3 - u) * c[i] + (u - k2) * d[i]) / (k3 - k2);
      const b1 = ((k2 - u) * a1 + u * a2) / k2;
      const b2 = ((k3 - u) * a2 + (u - k1) * a3) / (k3 - k1);
      out[i] = ((k2 - u) * b1 + (u - k1) * b2) / (k2 - k1);
    }
    return out;
  }

  function sample(track, s, out) {
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    out.p[0] = lerp(track.px[i], track.px[j], f);
    out.p[1] = lerp(track.py[i], track.py[j], f);
    out.p[2] = lerp(track.pz[i], track.pz[j], f);
    out.t[0] = lerp(track.tx[i], track.tx[j], f);
    out.t[1] = lerp(track.ty[i], track.ty[j], f);
    out.t[2] = lerp(track.tz[i], track.tz[j], f);
    out.r[0] = lerp(track.rx[i], track.rx[j], f);
    out.r[1] = lerp(track.ry[i], track.ry[j], f);
    out.r[2] = lerp(track.rz[i], track.rz[j], f);
    out.hw = lerp(track.hw[i], track.hw[j], f);
    return out;
  }

  // Direct curvature from the centreline heading over a ±12 m window. This is a
  // STATIC per-position quantity, so it's baked once into track.curv at build
  // (see buildCenterline) and read via O(1) index+lerp in curvature() below.
  // Kept as the source of the LUT and as a fallback for tracks built before the
  // field existed.
  function curvatureRaw(track, s) {
    const n = track.n, L = track.total, w = 12;
    const tx = track.tx, tz = track.tz;
    let fi = (((s + w) % L + L) % L) / L * n;
    let i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    const h1 = Math.atan2(tx[i] + (tx[j] - tx[i]) * f, tz[i] + (tz[j] - tz[i]) * f);
    fi = (((s - w) % L + L) % L) / L * n;
    i = Math.floor(fi) % n; j = (i + 1) % n; f = fi - Math.floor(fi);
    const h2 = Math.atan2(tx[i] + (tx[j] - tx[i]) * f, tz[i] + (tz[j] - tz[i]) * f);
    let d = h1 - h2;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d / (2 * w);
  }

  // Hot path: the AI calls this ~500× per physics substep. Curvature is static,
  // so read the baked per-node LUT (track.curv) with the same index+lerp math as
  // sample()/bankAngle() — no atan2s and no object/array allocation (the returned
  // double is still boxed: ~16 B per non-inlined call, ~10-15 KB/frame at 22 cars;
  // an AI look-ahead bake would remove the three per-car reads). Node-aligned samples (k*ds,
  // e.g. findCorners) return the exact baked value. Falls back to the direct
  // computation for any track built before the LUT existed. Signature unchanged.
  function curvature(track, s) {
    const cv = track.curv;
    if (!cv) return curvatureRaw(track, s);
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    return cv[i] + (cv[j] - cv[i]) * f;
  }

  // Project a world ground point (wx, wz) onto the centreline polyline and return
  // its arc-length s, signed lateral offset (along the local `right`, matching the
  // (s,x) model's x), the nearest node index, the tangent heading, and the
  // perpendicular distance. This is the inverse of sample()+offset and the bridge
  // that lets the car physics live in world space while gameplay still reasons in
  // (s, lateral). `hint` (an arc-length s from last frame) restricts the search to
  // a small window of segments so it's O(1) per car; omit it for a full search.
  // `wy` (optional) is the query point's HEIGHT, and it exists for one reason:
  // this search is otherwise purely XZ, so on a track that crosses ITSELF it
  // cannot tell the two legs apart even in principle. Suzuka is the case:
  // measured, its legs pass 1.43 m apart in XZ and 8.07 m apart in Y (s=2529
  // over s=4893), so the bridge deck and the road beneath it are the same point
  // to a flat search. Without a hint the nearest-in-XZ answer is a coin toss
  // between them — 41 verdict flips and 8.47 m of road-height drift when the
  // debris sweep hit it.
  //
  // Passing wy adds a height term to the cost, which separates them. Omitting
  // it gives the pure XZ search, so every existing caller is unchanged. The
  // player's physics path does not come through here at all (see js/game.js
  // — progress is integrated, not re-projected, precisely so it cannot snap
  // onto the wrong leg), so this serves the agent view and the debris fallback.
  function project(track, wx, wz, hint, wy) {
    const n = track.n, L = track.total, ds = L / n;
    const px = track.px, pz = track.pz, rx = track.rx, rz = track.rz, tx = track.tx, tz = track.tz;
    // Height is only usable when BOTH the query carries one and the track has a
    // profile; a track built without py must behave exactly as before.
    const py = track.py;
    const useY = (wy != null && isFinite(wy) && py && py.length === n);
    let bestD2 = Infinity, bestCost = Infinity, bestK = 0, bestT = 0, bestCx = 0, bestCz = 0;
    const hs = (hint != null && isFinite(hint)) ? (((hint % L) + L) % L) : -1;
    const CONT = 0.08;                    // weight of the arc-length penalty
    function evalSeg(i) {
      const j = (i + 1) % n;
      const ax = px[i], az = pz[i];
      const dx = px[j] - ax, dz = pz[j] - az;
      const len2 = dx * dx + dz * dz || 1e-6;
      let t = ((wx - ax) * dx + (wz - az) * dz) / len2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = ax + t * dx, cz = az + t * dz;
      const ex = wx - cx, ez = wz - cz;
      const d2 = ex * ex + ez * ez;
      let cost = d2;
      if (hs >= 0) {
        let da = Math.abs(((i + t) * ds) - hs); da = Math.min(da, L - da);
        cost += CONT * da * da;
      }
      if (useY) {
        const cy = py[i] + (py[j] - py[i]) * t;
        const ey = wy - cy;
        cost += ey * ey;
      }
      if (cost < bestCost) { bestCost = cost; bestD2 = d2; bestK = i; bestT = t; bestCx = cx; bestCz = cz; }
    }
    if (hint != null && isFinite(hint)) {
      const h = ((Math.round(hint / ds) % n) + n) % n;
      const W = 16;                       // ±16 nodes around last position
      for (let d = -W; d <= W; d++) evalSeg(((h + d) % n + n) % n);
    } else {
      for (let i = 0; i < n; i++) evalSeg(i);
    }
    const j = (bestK + 1) % n;
    const s = ((bestK + bestT) * ds) % L;
    // signed lateral offset along the interpolated right vector (ground plane)
    let r0 = rx[bestK] + (rx[j] - rx[bestK]) * bestT;
    let r2 = rz[bestK] + (rz[j] - rz[bestK]) * bestT;
    const rl = Math.hypot(r0, r2) || 1; r0 /= rl; r2 /= rl;
    const lat = (wx - bestCx) * r0 + (wz - bestCz) * r2;
    // tangent heading (same convention as centreline: dir = (sin θ, cos θ))
    const h0 = tx[bestK] + (tx[j] - tx[bestK]) * bestT;
    const h2 = tz[bestK] + (tz[j] - tz[bestK]) * bestT;
    const heading = Math.atan2(h0, h2);
    return { s, lat, k: bestK, heading, dist: Math.sqrt(bestD2) };
  }

  // Driving boundary (max |lateral| from the centreline) at arc-length s on a
  // side (sideSign >= 0 = right/+x, < 0 = left). Derived from where solid barriers
  // were placed (see buildProps), so the car stops just before a model. Uses the
  // tighter of the two bracketing nodes — conservative, never lets the car past a
  // barrier at a node transition.
  function wallAt(track, s, sideSign) {
    const arr = sideSign >= 0 ? track.barR : track.barL;
    const n = track.n, L = track.total;
    if (!arr) {                                   // pre-build fallback
      const i0 = (((Math.round(s / L * n) % n) + n) % n);
      return track.hw[i0] + (track.def && track.def.street ? -0.8 : 9);
    }
    let f = (((s % L) + L) % L) / L * n;
    const i = Math.floor(f) % n, j = (i + 1) % n;
    return Math.min(arr[i], arr[j]);
  }

  // POSTS (buildProps `post`, a gantry leg): a thin solid limits a car on EACH
  // side of it without walling off the ground beyond. A car inside the post
  // (nearer the road) gets its wall brought in to the post's inner face; a car
  // outside it (on the run-off) is kept beyond its outer face. Fills `out` —
  // { r, l: wall caps per side, minOut: least |x| on the `side` it sits } —
  // so the per-car call allocates nothing. POST_CLEAR is the barrier clamp's
  // own car-half-width margin (buildProps WALL_CLEAR, the pit wall's 1.1).
  const POST_CLEAR = 1.1;
  function postLimits(track, s, x, out) {
    out.r = Infinity; out.l = Infinity; out.minOut = 0; out.side = 0;
    const P = track.posts;
    if (!P || !P.length) return out;
    const L = track.total;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      let d = s - p.s;
      d -= L * Math.round(d / L);
      if (d > p.halfS || d < -p.halfS) continue;
      if (x * p.side < p.lat) {
        const lim = p.lat - p.halfX - POST_CLEAR;
        if (p.side > 0) { if (lim < out.r) out.r = lim; } else if (lim < out.l) out.l = lim;
      } else {
        const lim = p.lat + p.halfX + POST_CLEAR;
        if (lim > out.minOut) { out.minOut = lim; out.side = p.side; }
      }
    }
    return out;
  }

  // Centreline kink diagnostic (verify-track + track.geometryDiagnostics "centreline"
  // row). minNodeRadius = tightest chord-to-chord turn radius over the baked nodes;
  // a surface FOLD node is a span where the half-width rail runs (near) backwards,
  // hw·|d(right)/dt| > 0.97·|dP| — the road quads there invert on the inside edge
  // (buildRoad's fold clamp only hides it) and world→(s,x) reads a wrong s/x. Pure
  // read of px/pz/rx/rz/hw; nothing here reaches the driver.
  function surfaceFolds(track) {
    const n = track.n, px = track.px, pz = track.pz, rx = track.rx, rz = track.rz, hw = track.hw;
    let minR = Infinity, minK = -1;
    const folds = [];
    let foldCount = 0;
    for (let k = 0; k < n; k++) {
      const a = (k - 1 + n) % n, b = (k + 1) % n;
      const ix = px[k] - px[a], iz = pz[k] - pz[a], ox = px[b] - px[k], oz = pz[b] - pz[k];
      const Li = Math.hypot(ix, iz), Lo = Math.hypot(ox, oz);
      const dth = Math.abs(Math.atan2(ix * oz - iz * ox, ix * ox + iz * oz));
      if (dth > 1e-9) {
        const R = 0.5 * (Li + Lo) / dth;
        if (R < minR) { minR = R; minK = k; }
      }
      if (Lo > 1e-9) {
        const drt = ((rx[b] - rx[k]) * ox + (rz[b] - rz[k]) * oz) / Lo;
        if (Math.max(hw[k], hw[b]) * Math.abs(drt) > 0.97 * Lo) { foldCount++; if (folds.length < 16) folds.push(k); }
      }
    }
    return {
      minNodeRadius: minK < 0 ? null : Math.round(minR * 100) / 100,
      minNodeRadiusNode: minK, minNodeRadiusHw: minK < 0 ? null : Math.round(hw[minK] * 100) / 100,
      foldCount, foldNodes: folds,
    };
  }

  return { SCALE, centerline, cr, crc, sample, curvatureRaw, curvature, project, wallAt, postLimits, surfaceFolds };
})();
Object.freeze(TrackSpline);
