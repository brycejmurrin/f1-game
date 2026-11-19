const TrackSpline = (function () {
  "use strict";

  const SCALE = 1.45;
  const lerp = M4.lerp;

  function centerline(segs, baseHW) {
    Log.info("track", "centerline segs=" + (segs && segs.length));
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
    const target = 360 * (totalDeg >= 0 ? 1 : -1);
    const corr = (target - totalDeg) / steps.length;
    const pts = [];
    let x = 0, z = 0, y = 0, th = 0;
    for (const st of steps) {
      th += (st.deg + corr) * Math.PI / 180;
      x += Math.sin(th) * st.dl; z += Math.cos(th) * st.dl; y += st.dy;
      pts.push([x, y, z, st.w, st.b]);
    }
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

  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

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

  function sampleXZ(track, s, out) {
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    out.p[0] = lerp(track.px[i], track.px[j], f); out.p[2] = lerp(track.pz[i], track.pz[j], f);
    out.r[0] = lerp(track.rx[i], track.rx[j], f); out.r[2] = lerp(track.rz[i], track.rz[j], f);
    return out;
  }

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

  function curvature(track, s) {
    const cv = track.curv;
    if (!cv) return curvatureRaw(track, s);
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    return cv[i] + (cv[j] - cv[i]) * f;
  }

  const SEG_CELL = 32, SEG_MIN_N = 64;
  function segGrid(track) {
    const g = track._segGrid, n = track.n, px = track.px, pz = track.pz;
    if (g && g.px === px && g.pz === pz && g.n === n) return g;
    if (!Object.isExtensible(track)) return null;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (px[i] < x0) x0 = px[i]; if (px[i] > x1) x1 = px[i];
      if (pz[i] < z0) z0 = pz[i]; if (pz[i] > z1) z1 = pz[i];
    }
    if (!(x1 - x0 < 1e6 && z1 - z0 < 1e6)) return null;
    const C = SEG_CELL, gnx = Math.floor((x1 - x0) / C) + 1, gnz = Math.floor((z1 - z0) / C) + 1;
    const span = new Int32Array(n * 4), start = new Int32Array(gnx * gnz + 1);
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1, o = i * 4;
      const i0 = span[o] = Math.floor((Math.min(px[i], px[j]) - x0) / C), i1 = span[o + 1] = Math.floor((Math.max(px[i], px[j]) - x0) / C);
      const j0 = span[o + 2] = Math.floor((Math.min(pz[i], pz[j]) - z0) / C), j1 = span[o + 3] = Math.floor((Math.max(pz[i], pz[j]) - z0) / C);
      for (let b = j0; b <= j1; b++) for (let a = i0; a <= i1; a++) start[b * gnx + a + 1]++;
    }
    for (let c = 0; c < gnx * gnz; c++) start[c + 1] += start[c];
    const list = new Int32Array(start[gnx * gnz]), fill = start.slice(0, gnx * gnz);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      for (let b = span[o + 2]; b <= span[o + 3]; b++) for (let a = span[o]; a <= span[o + 1]; a++) list[fill[b * gnx + a]++] = i;
    }
    return (track._segGrid = { px, pz, n, x0, z0, gnx, gnz, start, list });
  }

  function project(track, wx, wz, hint, wy) {
    const n = track.n, L = track.total, ds = L / n;
    const px = track.px, pz = track.pz, rx = track.rx, rz = track.rz, tx = track.tx, tz = track.tz;
    const py = track.py;
    const useY = (wy != null && isFinite(wy) && py && py.length === n);
    let bestD2 = Infinity, bestCost = Infinity, bestK = 0, bestT = 0, bestCx = 0, bestCz = 0;
    const hs = (hint != null && isFinite(hint)) ? (((hint % L) + L) % L) : -1;
    const CONT = 0.08;
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
      if (cost < bestCost || (lowest && cost === bestCost && i < bestK)) { bestCost = cost; bestD2 = d2; bestK = i; bestT = t; bestCx = cx; bestCz = cz; }
    }
    let lowest = false;
    const G = (hint == null || !isFinite(hint)) && n >= SEG_MIN_N && isFinite(wx) && isFinite(wz) ? segGrid(track) : null;
    if (hint != null && isFinite(hint)) {
      const h = ((Math.round(hint / ds) % n) + n) % n;
      const W = 16;
      for (let d = -W; d <= W; d++) evalSeg(((h + d) % n + n) % n);
    } else if (G) {
      lowest = true;
      const C = SEG_CELL, gnx = G.gnx, gnz = G.gnz, start = G.start, list = G.list;
      const ci = Math.floor((wx - G.x0) / C), cj = Math.floor((wz - G.z0) / C);
      const rMin = Math.max(ci < 0 ? -ci : ci >= gnx ? ci - gnx + 1 : 0, cj < 0 ? -cj : cj >= gnz ? cj - gnz + 1 : 0);
      const rMax = Math.max(Math.abs(ci), Math.abs(gnx - 1 - ci), Math.abs(cj), Math.abs(gnz - 1 - cj));
      const cellSegs = (a, b) => {
        const c = b * gnx + a;
        for (let q = start[c], e = start[c + 1]; q < e; q++) evalSeg(list[q]);
      };
      for (let r = rMin; r <= rMax; r++) {
        const lb = (r - 1) * C - 0.01;
        if (lb > 0 && lb * lb > bestCost) break;
        const a0 = Math.max(ci - r, 0), a1 = Math.min(ci + r, gnx - 1);
        const b0 = Math.max(cj - r + 1, 0), b1 = Math.min(cj + r - 1, gnz - 1);
        if (cj - r >= 0 && cj - r < gnz) for (let a = a0; a <= a1; a++) cellSegs(a, cj - r);
        if (r > 0 && cj + r >= 0 && cj + r < gnz) for (let a = a0; a <= a1; a++) cellSegs(a, cj + r);
        if (r > 0 && ci - r >= 0 && ci - r < gnx) for (let b = b0; b <= b1; b++) cellSegs(ci - r, b);
        if (r > 0 && ci + r >= 0 && ci + r < gnx) for (let b = b0; b <= b1; b++) cellSegs(ci + r, b);
      }
    } else {
      for (let i = 0; i < n; i++) evalSeg(i);
    }
    const j = (bestK + 1) % n;
    const s = ((bestK + bestT) * ds) % L;
    let r0 = rx[bestK] + (rx[j] - rx[bestK]) * bestT;
    let r2 = rz[bestK] + (rz[j] - rz[bestK]) * bestT;
    const rl = Math.hypot(r0, r2) || 1; r0 /= rl; r2 /= rl;
    const lat = (wx - bestCx) * r0 + (wz - bestCz) * r2;
    const h0 = tx[bestK] + (tx[j] - tx[bestK]) * bestT;
    const h2 = tz[bestK] + (tz[j] - tz[bestK]) * bestT;
    const heading = Math.atan2(h0, h2);
    return { s, lat, k: bestK, heading, dist: Math.sqrt(bestD2) };
  }

  function wallAt(track, s, sideSign) {
    const arr = sideSign >= 0 ? track.barR : track.barL;
    const n = track.n, L = track.total;
    if (!arr) {
      const i0 = (((Math.round(s / L * n) % n) + n) % n);
      return track.hw[i0] + (track.def && track.def.street ? -0.8 : 9);
    }
    let f = (((s % L) + L) % L) / L * n;
    const i = Math.floor(f) % n, j = (i + 1) % n;
    return Math.min(arr[i], arr[j]);
  }

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

  return { centerline, cr, crc, sample, sampleXZ, curvatureRaw, curvature, project, wallAt, postLimits, surfaceFolds };
})();
Object.freeze(TrackSpline);
