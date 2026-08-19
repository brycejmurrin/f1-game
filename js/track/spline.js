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

  // Catmull-Rom (centripetal-ish uniform) for one component
  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
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
  // sample()/bankAngle() — zero garbage, no atan2s. Node-aligned samples (k*ds,
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
  // it keeps the old behaviour exactly, so every existing caller is unchanged;
  // this is a capability, not a policy change. The player's physics path does
  // not come through here at all (see js/game.js — progress is integrated, not
  // re-projected, precisely so it cannot snap onto the wrong leg), so this
  // serves the agent view and the debris fallback.
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

  return { SCALE, centerline, cr, sample, curvatureRaw, curvature, project, wallAt };
})();
