"use strict";
const CarShade = (function () {
  const KEY = "apex26.carSmooth";
  const DEFAULT = "*";
  let _pref;

  function norm(v) {
    const s = v == null ? "" : String(v).trim().toLowerCase();
    if (!s) return DEFAULT;
    if (s === "1" || s === "all" || s === "on" || s === "true") return "*";
    if (s === "0" || s === "off" || s === "false") return null;
    return /^[a-z0-9_-]{1,40}$/.test(s) ? s : DEFAULT;
  }
  function pref() {
    if (_pref !== undefined) return _pref;
    let v = null;
    try {
      const q = typeof location !== "undefined" && location.search ? new URLSearchParams(location.search) : null;
      if (q && q.has("carsmooth")) v = q.get("carsmooth");
      else if (typeof localStorage !== "undefined") v = localStorage.getItem(KEY);
    } catch (_) { v = null; }
    _pref = norm(v);
    return _pref;
  }
  function set(v) {
    _pref = norm(v);
    const empty = v == null || !String(v).trim();
    try {
      if (typeof localStorage !== "undefined") {
        if (empty) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, _pref === "*" ? "1" : _pref || "0");
      }
    } catch (_) {  }
    return _pref;
  }
  function on(teamId) { const p = pref(); return p === "*" || (!!p && p === teamId); }
  function any() { return !!pref(); }

  const RING_N = 24, EXP = 3;
  const EXP_TOP = 6;
  function ringAt(f, a, p, pt) {
    const x0 = f.x || 0, hw = f.w / 2, hh = f.h / 2, t = f.t !== undefined ? f.t : 1;
    const snap = (x) => (Math.abs(x) < 1e-9 ? 0 : x);
    const c = snap(Math.cos(a)), s = snap(Math.sin(a)), e = 2 / (s > 0 ? pt : p);
    const u = Math.sign(c) * Math.pow(Math.abs(c), e), v = Math.sign(s) * Math.pow(Math.abs(s), e);
    return [x0 + u * hw * (1 + (t - 1) * (v + 1) / 2), f.y + v * hh, f.z];
  }
  function ring(f, n, p, pt) {
    n = n || RING_N; p = p || EXP; pt = pt || EXP_TOP;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(ringAt(f, (i / n) * Math.PI * 2, p, pt));
    return pts;
  }
  function sink(st, halfW) {
    const k = Math.min(1, Math.abs(halfW) / st.topSide), hh = (st.top - st.bottom) / 2;
    return hh * (1 - Math.pow(1 - Math.pow(k, EXP_TOP), 1 / EXP_TOP));
  }
  function capLoft(out, front, rear, nf, nr, col, tri) {
    loft(out, Object.assign({}, front, { t: nf.topSide / nf.side }), Object.assign({}, rear, { t: nr.topSide / nr.side }), col, tri);
  }
  function loft(out, front, rear, col, tri, opts) {
    const n = (opts && opts.n) || RING_N, p = (opts && opts.p) || EXP, pt = (opts && opts.pt) || EXP_TOP;
    const sf = opts && opts.surface, fc = (opts && opts.frontCol) || col;
    const F = ring(front, n, p, pt), R = ring(rear, n, p, pt);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(out, F[i], R[i], R[j], col, sf);
      tri(out, F[i], R[j], F[j], col, sf);
    }
    const cf = [front.x || 0, front.y, front.z], cr = [rear.x || 0, rear.y, rear.z];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(out, cf, F[i], F[j], fc, sf);
      tri(out, cr, R[j], R[i], col, sf);
    }
  }

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mid = (r) => r.reduce((m, p) => [m[0] + p[0] / r.length, m[1] + p[1] / r.length, m[2] + p[2] / r.length], [0, 0, 0]);
  function newell(r) {
    const N = [0, 0, 0];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      N[0] += (a[1] - b[1]) * (a[2] + b[2]); N[1] += (a[2] - b[2]) * (a[0] + b[0]); N[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return N;
  }
  function face(out, a, b, c, col, tri, sf) {
    if (len(crs(sub(b, a), sub(c, a))) > 1e-12) tri(out, a, b, c, col, sf);
  }
  function earcut(r) {
    const N = newell(r), A = N.map(Math.abs);
    const ax = A[0] >= A[1] ? (A[0] >= A[2] ? 0 : 2) : (A[1] >= A[2] ? 1 : 2), sg = N[ax] >= 0 ? 1 : -1;
    const P = r.map((p) => [p[(ax + 1) % 3], p[(ax + 2) % 3] * sg]), idx = r.map((_, i) => i), tris = [];
    const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
    while (idx.length > 3) {
      const n = idx.length;
      let cut = 0;
      for (let k = 0; k < n; k++) {
        const a = P[idx[(k + n - 1) % n]], b = P[idx[k]], c = P[idx[(k + 1) % n]];
        if (cr(a, b, c) <= 1e-14) continue;
        const blocked = idx.some((m) => { const q = P[m];
          return !same(q, a) && !same(q, b) && !same(q, c) && cr(a, b, q) > 1e-14 && cr(b, c, q) > 1e-14 && cr(c, a, q) > 1e-14; });
        if (!blocked) { cut = k; break; }
      }
      tris.push([idx[(cut + n - 1) % n], idx[cut], idx[(cut + 1) % n]]);
      idx.splice(cut, 1);
    }
    tris.push(idx);
    return tris;
  }
  function skin(out, rings, col, tri, sf, o) {
    o = o || {};
    const n = rings[0].length, last = rings.length - 1;
    const d0 = sub(mid(rings[1]), mid(rings[0])), d1 = sub(mid(rings[last]), mid(rings[last - 1]));
    const flip = dot(newell(rings[0]), d0) > 0;
    for (let r = 0; r < last; r++) {
      const F = rings[r], R = rings[r + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, c = o.segCol ? o.segCol(i) : col;
        if (flip) { face(out, F[i], R[j], R[i], c, tri, sf); face(out, F[i], F[j], R[j], c, tri, sf); }
        else { face(out, F[i], R[i], R[j], c, tri, sf); face(out, F[i], R[j], F[j], c, tri, sf); }
      }
    }
    if (o.caps === false) return;
    const cap = (ring, c, d) => {
      const keep = dot(newell(ring), d) > 0;
      for (const [a, b, e] of earcut(ring)) face(out, ring[a], keep ? ring[b] : ring[e], keep ? ring[e] : ring[b], c, tri, sf);
    };
    cap(rings[0], o.frontCol || col, d0.map((v) => -v));
    cap(rings[last], col, d1);
  }
  function sect(n, pPos, pNeg) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const p = ringAt({ y: 0, z: 0, w: 2, h: 2 }, (i / n) * Math.PI * 2, pNeg, pPos);
      pts.push([p[0], p[1]]);
    }
    return pts;
  }
  function pipe(out, path, col, tri, sf, o) {
    const n = o.n || 8, S = sect(n, o.pt || o.p || 2, o.p || 2), L = [0];
    for (let i = 1; i < path.length; i++) L.push(L[i - 1] + len(sub(path[i], path[i - 1])));
    const tot = L[L.length - 1] || 1, c1 = o.chord1 != null ? o.chord1 : o.chord, t1 = o.thick1 != null ? o.thick1 : o.thick;
    const off = (U, T) => unit(sub(U, T.map((x) => x * dot(U, T))));
    let U = o.up || [0, 0, 1];
    const rings = path.map((p, i) => {
      const T = unit(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)])) || [0, 0, 1];
      U = off(U, T) || off([0, 1, 0], T) || off([1, 0, 0], T);
      const V = crs(T, U), f = L[i] / tot;
      const ch = (o.chord + (c1 - o.chord) * f) / 2, th = (o.thick + (t1 - o.thick) * f) / 2;
      return S.map(([u, v]) => [0, 1, 2].map((k) => p[k] + U[k] * u * ch + V[k] * v * th));
    });
    skin(out, rings, col, tri, sf, o);
  }
  function strut(out, p0, p1, chord, thick, col, tri, sf, o) {
    o = o || {};
    const k = o.taper == null ? 1 : o.taper;
    pipe(out, [p0, p1], col, tri, sf, Object.assign({}, o, { chord, thick, chord1: chord * k, thick1: thick * k }));
  }
  function fine(path, k, from, to) {
    from = from || 0; to = to == null ? path.length : to;
    const last = path.length - 1;
    const P = (i) => (i < 0 ? mix(path[0], path[1], -1) : i > last ? mix(path[last], path[last - 1], -1) : path[i]);
    const pts = [];
    for (let i = from; i < to - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        pts.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t +
          (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t3)));
      }
    }
    pts.push(path[to - 1].slice());
    return pts;
  }
  function fracs(q, r) {
    const R = Array.isArray(r) ? r : [r, r, r, r];
    return q.map((B, k) => [Math.min(0.5, (R[k] || 0) / (len(sub(q[(k + 3) % 4], B)) || 1)),
                            Math.min(0.5, (R[k] || 0) / (len(sub(q[(k + 1) % 4], B)) || 1))]);
  }
  function rquad(q, fr, seg) {
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const A = q[(k + 3) % 4], B = q[k], C = q[(k + 1) % 4], [fa, fc] = fr[k];
      if (!(fa > 0) && !(fc > 0)) { pts.push(B.slice()); continue; }
      const p0 = mix(B, A, fa), p2 = mix(B, C, fc), meets = fc >= 0.5 - 1e-9 && fr[(k + 1) % 4][0] >= 0.5 - 1e-9;
      for (let j = 0; j <= seg - (meets ? 1 : 0); j++) { const t = j / seg; pts.push(mix(mix(p0, B, t), mix(B, p2, t), t)); }
    }
    return pts;
  }
  function block(out, q, col, tri, sf, o) {
    o = o || {};
    const a = q.slice(0, 4), b = q.slice(4, 8), fr = fracs(a, o.r == null ? Infinity : o.r), seg = o.seg || 3;
    skin(out, [rquad(a, fr, seg), rquad(b, fr, seg)], col, tri, sf, o);
  }
  function box(out, cx, cy, cz, sx, sy, sz, col, tri, sf, o) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, zf = cz + sz / 2, zr = cz - sz / 2;
    block(out, [[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf],
                [x0, y0, zr], [x1, y0, zr], [x1, y1, zr], [x0, y1, zr]], col, tri, sf, o);
  }
  function boxFn(tri, o) { return (out, cx, cy, cz, sx, sy, sz, col, sf) => box(out, cx, cy, cz, sx, sy, sz, col, tri, sf, o); }
  function blockFn(tri, o) { return (out, q, col, colFront, sf) => block(out, q, col, tri, sf, Object.assign({ frontCol: colFront }, o)); }

  function housing(out, q, col, tri, sf) {
    const S = sect(12, 6, 2.6), y0 = q[0][1], y1 = q[3][1];
    skin(out, [[0, 0.80], [0.14, 1], [0.86, 1], [1, 0.90]].map(([f, k]) => {
      const x = q[0][0] + (q[1][0] - q[0][0]) * f;
      const zb = q[0][2] + (q[1][2] - q[0][2]) * f, zf = q[4][2] + (q[5][2] - q[4][2]) * f;
      const cy = (y0 + y1) / 2, hy = (y1 - y0) / 2 * k, cz = (zb + zf) / 2, hz = (zf - zb) / 2 * k;
      return S.map(([u, v]) => [x, cy + u * hy, cz - v * hz]);
    }), col, tri, sf);
  }
  function cTub(out, stations, floorY, col, tri) {
    const M = 22, PT = 10;
    skin(out, stations.map((st) => {
      const bot = st.y - st.h / 2, f = { z: st.z, y: (bot + st.rail) / 2, w: st.w, h: st.rail - bot, t: st.t };
      let lo = 0, hi = Math.PI / 2;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ringAt(f, m, EXP, PT)[0] > st.open) lo = m; else hi = m; }
      const pts = [];
      for (let i = 0; i < M; i++) pts.push(ringAt(f, Math.PI - lo + (i / (M - 1)) * (Math.PI + 2 * lo), EXP, PT));
      return pts.concat([[st.open, floorY - 0.002, st.z], [-st.open, floorY - 0.002, st.z]]);
    }), col, tri);
  }
  function floor(out, fl, cy, edgeAt, col, tri, sf) {
    const zF = fl.cz + fl.sz / 2, zR = fl.cz - fl.sz / 2, y0 = cy - fl.sy / 2, y1 = cy + fl.sy / 2, R = 0.15, TYRE = 0.555;
    const cap = (z) => { const u = Math.max(0, Math.min(1, (-1.15 - z) / 0.15)); return u <= 0 ? TYRE + 0.15 + (z + 1.15) : TYRE + 0.15 * (1 - u * u * (3 - 2 * u)); };
    const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
    const hw = (z) => smin(edgeAt(z), cap(z), 0.04) - (z > zF - R ? R - Math.sqrt(Math.max(0, R * R - (z - zF + R) ** 2)) : 0);
    const zs = [0, 1, 2, 3, 4].map((k) => zF - R * (1 - Math.cos(k * Math.PI / 8)))
      .concat(Array.from({ length: 35 }, (_, k) => Math.round((0.80 - k * 0.10) * 100) / 100),
              Array.from({ length: 9 }, (_, k) => Math.round((-1.125 - k * 0.025) * 1000) / 1000), [zR])
      .filter((z, i, a) => z <= zF && z >= zR && a.indexOf(z) === i);
    const S = zs.sort((a, b) => b - a).map((z) => [z, hw(z)]);
    const q = (a, b, c, d, want) => {
      const k = dot(crs(sub(b, a), sub(c, a)), want) < 0;
      face(out, a, k ? c : b, k ? b : c, col, tri, sf); face(out, a, k ? d : c, k ? c : d, col, tri, sf);
    };
    for (let i = 0; i < S.length - 1; i++) {
      const [za, ha] = S[i], [zb, hb] = S[i + 1];
      q([-ha, y1, za], [ha, y1, za], [hb, y1, zb], [-hb, y1, zb], [0, 1, 0]);
      q([-ha, y0, za], [ha, y0, za], [hb, y0, zb], [-hb, y0, zb], [0, -1, 0]);
      for (const s of [-1, 1]) q([s * ha, y0, za], [s * ha, y1, za], [s * hb, y1, zb], [s * hb, y0, zb], [s * (za - zb), 0, hb - ha]);
    }
    const [zf0, hf] = S[0], [zr0, hr] = S[S.length - 1];
    q([-hf, y0, zf0], [hf, y0, zf0], [hf, y1, zf0], [-hf, y1, zf0], [0, 0, 1]);
    q([-hr, y0, zr0], [hr, y0, zr0], [hr, y1, zr0], [-hr, y1, zr0], [0, 0, -1]);
  }
  function endplate(out, ep, s, col, crownCol, crownSurf, tri) {
    const X0 = 0.488, X1 = 0.521, f = ep.front, r = ep.rear, seg = 4;
    const q = (x, e) => [[s * x, f.bottom, f.z - e], [s * x, f.top, f.z - e], [s * x, r.top, r.z + e], [s * x, r.bottom, r.z + e]];
    const lightLo = 0.603, lightHi = 0.637;
    const rBot = Math.max(0.02, Math.min(0.07, lightLo - r.bottom - 0.01));
    const rTop = Math.max(0.015, Math.min(0.04, r.top - lightHi - 0.01));
    const fr = fracs(q(X1, 0), [0.10, 0.07, rTop, rBot]), CT = 0.018;
    skin(out, [rquad(q(X1, 0), fr, seg), rquad(q(X0, 0), fr, seg)], col, tri);
    pipe(out, rquad(q((X0 + X1) / 2, CT / 2), fr, seg).slice(seg + 1, 3 * (seg + 1)), crownCol, tri, crownSurf,
         { chord: 0.046, thick: CT, n: 6, p: 4, up: [1, 0, 0] });
  }
  function tunnel(out, s, keel, thr, exitHalf, yFloor, yThroat, yExit, inCol, col, tri, sf) {
    const T = 0.03, seg = 5, m = seg + 3;
    const ring = (z, xo, yc) => {
      const A = [s * keel, yc], B = [s * xo, yc], C = [s * xo, yFloor], r = 0.4 * Math.min(xo - keel, yc - yFloor);
      const p0 = [B[0] - s * r, yc], p2 = [B[0], yc - r], P = [A];
      for (let j = 0; j <= seg; j++) { const t = j / seg, u = 1 - t; P.push([u * u * p0[0] + 2 * u * t * B[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * B[1] + t * t * p2[1]]); }
      P.push(C);
      const Q = P.map((p, i) => {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        return [p[0] - s * T * dy / l, p[1] + s * T * dx / l];
      });
      return P.concat(Q.reverse()).map(([x, y]) => [x, y, z]);
    };
    skin(out, [ring(-1.95, thr, yThroat), ring(-2.52, exitHalf, yExit)], col, tri, sf, { segCol: (i) => (i < m - 1 ? inCol : col) });
  }
  function headrest(out, col, tri, sf, style) {
    const st = Math.max(0, Math.min(2, style == null ? 0 : style | 0));
    const half = [[0.205, 0.640, 0.02], [0.208, 0.650, -0.08], [0.196, 0.660, -0.17], [0.150, 0.666, -0.245], [0.078, 0.669, -0.285]];
    const path = half.map(([x, y, z]) => [-x, y, z]).concat([[0, 0.670, -0.298]], half.slice().reverse());
    const chord = st === 0 ? 0.075 : st === 1 ? 0.092 : 0.108;
    const thick = st === 0 ? 0.055 : st === 1 ? 0.068 : 0.082;
    pipe(out, fine(path, 2), col, tri, sf, { chord, thick, n: 8, p: 2.5, up: [0, 1, 0] });
    if (st < 1) return;
    for (const s of [-1, 1]) {
      const wing = st === 1
        ? [[s * 0.200, 0.645, -0.04], [s * 0.200, 0.645, -0.16], [s * 0.200, 0.645, -0.28]]
        : [[s * 0.210, 0.670, -0.05], [s * 0.210, 0.678, -0.18], [s * 0.210, 0.685, -0.30]];
      pipe(out, fine(wing, 2), col, tri, sf, {
        chord: st === 1 ? 0.052 : 0.048, thick: st === 1 ? 0.055 : 0.060, n: 6, p: 2.5, up: [0, 1, 0],
      });
    }
    if (st < 2) return;
    for (const s of [-1, 1]) {
      pipe(out, fine([[s * 0.215, 0.700, -0.08], [s * 0.215, 0.705, -0.18]], 2), col, tri, sf, {
        chord: 0.036, thick: 0.024, n: 6, p: 2.5, up: [0, 1, 0],
      });
    }
  }

  const POD_ARC = 4;
  function podRing(st, side, chine) {
    const w = st.outer - st.inner, hO = st.outerTop - st.outerBottom;
    const rxT = Math.min(0.07, 0.25 * w), ryT = Math.min(0.05, 0.12 * hO);
    const rxB = Math.min(0.06, 0.22 * w), ryB = Math.min(0.035, 0.10 * hO);
    const pts = [[st.inner, st.innerBottom]];
    for (let k = 0; k <= POD_ARC; k++) {
      const a = -Math.PI / 2 + (k / POD_ARC) * Math.PI / 2;
      pts.push([st.outer - rxB + rxB * Math.cos(a), st.outerBottom + ryB + ryB * Math.sin(a)]);
    }
    if (chine != null && typeof CarBodyGeom !== "undefined") {
      const c = CarBodyGeom.chineCut(st.chine || chine, w, hO);
      pts.push([st.outer, st.outerTop - c.y], [st.outer - c.x, st.outerTop]);
    } else for (let k = 0; k <= POD_ARC; k++) {
      const a = (k / POD_ARC) * Math.PI / 2;
      pts.push([st.outer - rxT + rxT * Math.cos(a), st.outerTop - ryT + ryT * Math.sin(a)]);
    }
    pts.push([st.inner, st.innerTop]);
    const ring = pts.map(([x, y]) => [side * x, y, st.z]);
    return side < 0 ? ring.reverse() : ring;
  }
  function loftRings(out, rings, col, frontCol, tri) {
    const n = rings[0].length;
    for (let r = 0; r < rings.length - 1; r++) {
      const F = rings[r], R = rings[r + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        tri(out, F[i], R[i], R[j], col);
        tri(out, F[i], R[j], F[j], col);
      }
    }
    const cap = (ring, c, flip) => {
      const m = [0, 0, 0];
      for (const p of ring) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (flip) tri(out, m, ring[j], ring[i], c); else tri(out, m, ring[i], ring[j], c);
      }
    };
    cap(rings[0], frontCol || col, false);
    cap(rings[rings.length - 1], col, true);
  }
  function podLoft(out, stations, col, frontCol, tri) {
    const chine = stations.some((st) => st.chine != null) ? 0.004 : null;
    for (const side of [-1, 1]) loftRings(out, stations.map((st) => podRing(st, side, chine)), col, frontCol, tri);
  }

  const COVER_Z = Object.freeze([-0.55, -0.66, -0.90, -1.13, -1.28, -1.47, -1.70, -1.90, -2.00]);
  const COVER_Z_NEAR = Object.freeze([
    -0.55, -0.66, -0.90, -1.13, -1.28, -1.47, -1.58, -1.70, -1.80, -1.90, -1.95, -2.00,
  ]);
  function densifyCoverPts(keys, n) {
    n = n == null ? 6 : n;
    const foot = keys[0], shoulder = keys[1], facet = keys[2], crown = keys[3];
    const pts = [foot, shoulder];
    const rx = Math.max(1e-6, (shoulder[0] - crown[0]) * 1.12);
    const ry = Math.max(1e-6, (crown[1] - shoulder[1]) * 1.04);
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1), th = t * Math.PI * 0.5;
      let x = crown[0] + rx * Math.cos(th), y = shoulder[1] + ry * Math.sin(th);
      x = Math.min(shoulder[0], Math.max(crown[0], x));
      y = Math.max(shoulder[1], Math.min(crown[1], y));
      if (t > 0.40 && t < 0.60) {
        const w = 1 - Math.abs(t - 0.5) / 0.10;
        x += (facet[0] - x) * 0.18 * w; y += (facet[1] - y) * 0.18 * w;
      }
      pts.push([x, y]);
    }
    pts.push(crown);
    return pts;
  }
  const RAMP = Object.freeze({ from: -0.38, to: -1.48, coke: 0.95, span: 0.35, outer: 0.75, inner: 0.50, min: 0.03, gap: 0.01 });
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const cokeOf = (c) => Math.max(0.72, Math.min(1.38, c == null ? 1 : c));
  function downwash(stations, coverBottomAt, coke) {
    const r = clamp01((cokeOf(coke) - RAMP.coke) / RAMP.span);
    if (!(r > 0)) return stations;
    return stations.map((st) => {
      const k = r * clamp01((RAMP.from - st.z) / (RAMP.from - RAMP.to));
      if (!(k > 0)) return st;
      const ho = st.outerTop - st.outerBottom, hi = st.innerTop - st.innerBottom;
      const dropped = st.innerBottom + Math.max(RAMP.min, hi * (1 - RAMP.inner * k));
      return Object.assign({}, st, {
        outerTop: st.outerBottom + Math.max(RAMP.min, ho * (1 - RAMP.outer * k)),
        innerTop: Math.max(dropped, Math.min(st.innerTop, coverBottomAt(st.z) + RAMP.gap)),
      });
    });
  }
  function cokeFoot(c, stations, coke) {
    const p = 1 + 2 * Math.max(0, cokeOf(coke) - 0.9);
    if (!(p > 1)) return c;
    const F = stations[0], R = stations[stations.length - 1], t = clamp01((F.z - c.z) / (F.z - R.z));
    const s = 1 - Math.pow(1 - t, p);
    return Object.assign({}, c, { xb: Math.max(0.76 * c.x, F.x * (1 - s) + R.x * s) });
  }
  function coverLoft(out, anchors, profile, zF, zR, col, tri, o) {
    const table = (o && o.zs) || COVER_Z;
    const zs = [zF].concat(table.filter((z) => z < zF && z > zR), [zR]);
    skin(out, zs.map((z) => {
      const p = profile(anchors.coverAt(z)).pts;
      return p.map(([x, y]) => [x, y, z]).concat(p.slice().reverse().map(([x, y]) => [-x, y, z]));
    }), col, tri);
  }

  function vertexNormals(out, from, to) {
    const P = out.pos, N = out.nrm, I = out.idx, acc = new Float64Array((to - from) * 3);
    for (let t = 0; t + 2 < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      if (a < from || a >= to || b < from || b >= to || c < from || c >= to) continue;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (const v of [a, b, c]) { const k = (v - from) * 3; acc[k] += nx; acc[k + 1] += ny; acc[k + 2] += nz; }
    }
    for (let v = from; v < to; v++) {
      const k = (v - from) * 3, l = Math.hypot(acc[k], acc[k + 1], acc[k + 2]);
      if (l > 0) { N[v * 3] = acc[k] / l; N[v * 3 + 1] = acc[k + 1] / l; N[v * 3 + 2] = acc[k + 2] / l; }
    }
  }
  const LOWER = Object.freeze({ frac: 0.80, front: 1.05, rear: -2.00 });
  function heightZone(out, from, to, c1, tintCol, anchors, paint, above) {
    if (!Array.isArray(tintCol) || tintCol.length < 3) return 0;
    const P = out.pos, N = out.nrm, C = out.col, M = out.mat, I = out.idx, nt = Math.floor(I.length / 3), EPS = 1e-7;
    const body = [0, 1, 2].map((k) => Math.min(c1[k], 1)), zone = [0, 1, 2].map((k) => Math.min(tintCol[k], 1));
    const knots = [LOWER.front].concat(anchors.podStations.map((s) => s.z).filter((z) => z < LOWER.front && z > LOWER.rear), [LOWER.rear])
      .map((z) => { const p = anchors.podAt(z); return [z, p.bottom + LOWER.frac * (p.top - p.bottom)]; });
    const line = (z) => {
      for (let i = 1; i < knots.length; i++) {
        const [za, ya] = knots[i - 1], [zb, yb] = knots[i];
        if (z >= zb) return z >= za ? ya : yb + (ya - yb) * (z - zb) / (za - zb);
      }
      return knots[knots.length - 1][1];
    };
    const inZ = (z) => z <= LOWER.front && z >= LOWER.rear, gLine = (x, y, z) => y - line(z);
    const f = (y, z) => (inZ(z) ? y - line(z) : 1);
    const uses = new Uint32Array(Math.max(0, to - from));
    for (let i = 0; i < nt * 3; i++) if (I[i] >= from && I[i] < to) uses[I[i] - from]++;
    const isBody = (v) => v >= from && v < to && uses[v - from] === 1 && M[v] === paint &&
      C[v * 3] === body[0] && C[v * 3 + 1] === body[1] && C[v * 3 + 2] === body[2];
    const tint = (v, c) => { C[v * 3] = c[0]; C[v * 3 + 1] = c[1]; C[v * 3 + 2] = c[2]; };
    const at = (u, w, t, k) => P[u * 3 + k] + (P[w * 3 + k] - P[u * 3 + k]) * t;
    const vert = (u, w, t) => {
      const n = P.length / 3, nrm = [0, 1, 2].map((k) => N[u * 3 + k] + (N[w * 3 + k] - N[u * 3 + k]) * t), l = len(nrm) || 1;
      for (let k = 0; k < 3; k++) { P.push(at(u, w, t, k)); N.push(nrm[k] / l); C.push(body[k]); }
      M.push(M[u]);
      return n;
    };
    function split(q, g) {
      const d = q.map((u) => g(P[u * 3], P[u * 3 + 1], P[u * 3 + 2])), s = d.map((x) => (x < -EPS ? -1 : x > EPS ? 1 : 0));
      if (s.every((x) => x >= 0)) return [[q, 1]];
      if (s.every((x) => x <= 0)) return [[q, -1]];
      const on = s.indexOf(0), k = on >= 0 ? on : s[0] === s[1] ? 2 : s[0] === s[2] ? 1 : 0;
      const a = q[k], b = q[(k + 1) % 3], c = q[(k + 2) % 3], da = d[k], db = d[(k + 1) % 3], dc = d[(k + 2) % 3];
      if (on >= 0) { const t = db / (db - dc); return [[[a, b, vert(b, c, t)], s[(k + 1) % 3]], [[vert(a, a, 0), vert(b, c, t), c], s[(k + 2) % 3]]]; }
      const tb = da / (da - db), tc = da / (da - dc), ab = vert(a, b, tb);
      return [[[a, vert(a, b, tb), vert(a, c, tc)], s[k]], [[ab, b, c], -s[k]], [[ab, c, vert(a, c, tc)], -s[k]]];
    }
    const n0 = P.length / 3;
    const yTop = Math.max(...knots.map(([, y]) => y)), yBot = Math.min(...knots.map(([, y]) => y));
    for (let t = 0; t < nt; t++) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      if (!isBody(a) || !isBody(b) || !isBody(c)) continue;
      const z0 = Math.min(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]), z1 = Math.max(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]);
      if (z1 < LOWER.rear || z0 > LOWER.front) continue;
      if (above) {
        if (Math.max(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]) < yBot - EPS) continue;
      } else if (Math.min(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]) > yTop + EPS) continue;
      const q = [a, b, c];
      const span = knots.map(([z]) => z).filter((z) => z > z0 + EPS && z < z1 - EPS);
      const probe = q.map((u) => f(P[u * 3 + 1], P[u * 3 + 2]));
      for (const z of span) for (let e = 0; e < 3; e++) {
        const u = q[e], w = q[(e + 1) % 3], zu = P[u * 3 + 2], zw = P[w * 3 + 2];
        if ((zu - z) * (zw - z) < 0) probe.push(f(at(u, w, (z - zu) / (zw - zu), 1), z));
      }
      if (above) {
        if (probe.every((d) => d <= EPS)) continue;
        if (probe.every((d) => d >= -EPS)) { for (const u of q) tint(u, zone); continue; }
      } else {
        if (probe.every((d) => d >= -EPS)) continue;
        if (probe.every((d) => d <= EPS)) { for (const u of q) tint(u, zone); continue; }
      }
      let pieces = [q];
      for (const z of span) pieces = pieces.flatMap((p) => split(p, (x, y, zz) => zz - z).map(([p2]) => p2));
      const seen = new Set();
      pieces = pieces.map((p) => p.map((u) => (seen.has(u) ? vert(u, u, 0) : (seen.add(u), u))));
      pieces.flatMap((p) => (inZ((P[p[0] * 3 + 2] + P[p[1] * 3 + 2] + P[p[2] * 3 + 2]) / 3) ? split(p, gLine) : [[p, 1]])).forEach(([p, sd], i) => {
        const take = above ? sd > 0 : sd < 0;
        for (const u of p) tint(u, take ? zone : body);
        if (i) I.push(p[0], p[1], p[2]); else { I[t * 3] = p[0]; I[t * 3 + 1] = p[1]; I[t * 3 + 2] = p[2]; }
      });
    }
    return P.length / 3 - n0;
  }
  function lowerZone(out, from, to, c1, lower, anchors, paint) {
    return heightZone(out, from, to, c1, lower, anchors, paint, false);
  }
  function upperZone(out, from, to, c1, upper, anchors, paint) {
    return heightZone(out, from, to, c1, upper, anchors, paint, true);
  }

  function countSort3(order, k0, k1, k2) {
    const n = order.length, keys = [k0, k1, k2], lo = [0, 0, 0], span = [0, 0, 0];
    if (!n) return true;
    for (let p = 0; p < 3; p++) {
      let a = Infinity, b = -Infinity;
      for (let i = 0; i < n; i++) { const q = keys[p][order[i]]; if (q < a) a = q; if (q > b) b = q; }
      if (!(b - a < 2097152)) return false;
      lo[p] = a; span[p] = b - a + 1;
    }
    let src = order, dst = new Int32Array(n);
    for (let p = 0; p < 3; p++) {
      const key = keys[p], a = lo[p], at = new Uint32Array(span[p] + 1);
      for (let i = 0; i < n; i++) at[key[src[i]] - a + 1]++;
      for (let c = 0; c < span[p]; c++) at[c + 1] += at[c];
      for (let i = 0; i < n; i++) { const v = src[i]; dst[at[key[v] - a]++] = v; }
      const t = src; src = dst; dst = t;
    }
    if (src !== order) order.set(src);
    return true;
  }

  function smooth(out, opts) {
    const crease = Math.cos(((opts && opts.creaseDeg) || 55) * Math.PI / 180);
    const skip = new Set((opts && opts.skip) || []), keep = opts && opts.keep;
    const P = out.pos, N = out.nrm, M = out.mat, I = out.idx, nv = P.length / 3, nt = Math.floor(I.length / 3);
    if (!nv || N.length !== P.length || !nt) return 0;
    const k = keep && keep.vt ? keep : null;
    let fx, fy, fz, fa, cnt, vt, order, runs;
    if (k) ({ fx, fy, fz, fa, cnt, vt, order, runs } = k);
    else {
      fx = new Float64Array(nt); fy = new Float64Array(nt); fz = new Float64Array(nt); fa = new Float64Array(nt);
      cnt = new Uint32Array(nv + 1);
      for (let t = 0; t < nt; t++) {
        const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
        if (!(l > 0)) continue;
        fx[t] = nx / l; fy[t] = ny / l; fz[t] = nz / l; fa[t] = l / 2;
        cnt[I[t * 3] + 1]++; cnt[I[t * 3 + 1] + 1]++; cnt[I[t * 3 + 2] + 1]++;
      }
      for (let v = 0; v < nv; v++) cnt[v + 1] += cnt[v];
      vt = new Uint32Array(cnt[nv]); const fill = cnt.slice(0, nv);
      for (let t = 0; t < nt; t++) if (fa[t] > 0) for (let j = 0; j < 3; j++) vt[fill[I[t * 3 + j]]++] = t;
      const qx = new Int32Array(nv), qy = new Int32Array(nv), qz = new Int32Array(nv);
      order = new Int32Array(nv);
      let no = 0;
      for (let v = 0; v < nv; v++) {
        if (skip.has(M[v]) || cnt[v + 1] === cnt[v]) continue;
        qx[v] = Math.round(P[v * 3] * 1e4); qy[v] = Math.round(P[v * 3 + 1] * 1e4); qz[v] = Math.round(P[v * 3 + 2] * 1e4);
        order[no++] = v;
      }
      order = order.subarray(0, no);
      if (!countSort3(order, qz, qy, qx)) order.sort((u, v) => (qx[u] - qx[v]) || (qy[u] - qy[v]) || (qz[u] - qz[v]));
      runs = [];
      for (let i = 0; i < order.length;) {
        const u0 = order[i];
        let j = i + 1;
        while (j < order.length && qx[order[j]] === qx[u0] && qy[order[j]] === qy[u0] && qz[order[j]] === qz[u0]) j++;
        if (j - i > 1) runs.push(i, j);
        i = j;
      }
      if (keep) Object.assign(keep, { fx, fy, fz, fa, cnt, vt, order, runs });
    }
    const stamp = new Int32Array(nt).fill(-1), tris = [], grp = [], M0 = k && k.mat, N0 = k && k.nrm;
    let moved = 0, gid = 0;
    for (let r = 0; r < runs.length; r += 2) {
      const i = runs[r], j = runs[r + 1];
      if (M0) {
        let same = true;
        for (let a = i; a < j && same; a++) for (let b = a + 1; b < j; b++)
          if ((M[order[a]] === M[order[b]]) !== (M0[order[a]] === M0[order[b]])) { same = false; break; }
        if (same) {
          for (let a = i; a < j; a++) { const v = order[a] * 3; N[v] = N0[v]; N[v + 1] = N0[v + 1]; N[v + 2] = N0[v + 2]; }
          continue;
        }
      }
      for (let a = i; a < j; a++) {
        const m = M[order[a]];
        let first = true;
        for (let b = i; b < a; b++) if (M[order[b]] === m) { first = false; break; }
        if (!first) continue;
        grp.length = 0;
        for (let b = a; b < j; b++) if (M[order[b]] === m) grp.push(order[b]);
        if (grp.length < 2) continue;
        tris.length = 0; gid++;
        for (const u of grp) for (let q = cnt[u]; q < cnt[u + 1]; q++) if (stamp[vt[q]] !== gid) { stamp[vt[q]] = gid; tris.push(vt[q]); }
        for (const v of grp) {
          const ax = N[v * 3], ay = N[v * 3 + 1], az = N[v * 3 + 2];
          let sx = 0, sy = 0, sz = 0, foreign = 0;
          for (const t of tris) {
            if (ax * fx[t] + ay * fy[t] + az * fz[t] < crease) continue;
            sx += fx[t] * fa[t]; sy += fy[t] * fa[t]; sz += fz[t] * fa[t];
            let mine = false;
            for (let q = cnt[v]; q < cnt[v + 1]; q++) if (vt[q] === t) { mine = true; break; }
            if (!mine) foreign++;
          }
          const l = Math.hypot(sx, sy, sz);
          if (!foreign || !(l > 0)) continue;
          sx /= l; sy /= l; sz /= l;
          if (Math.abs(sx - ax) + Math.abs(sy - ay) + Math.abs(sz - az) > 1e-6) moved++;
          N[v * 3] = sx; N[v * 3 + 1] = sy; N[v * 3 + 2] = sz;
        }
      }
    }
    if (keep && !k) { keep.mat = M.slice(); keep.nrm = N.slice(); }
    return moved;
  }

  return { KEY, COVER_Z, COVER_Z_NEAR, on, any, set, ring, sink, loft, capLoft, podRing, podLoft,
           densifyCoverPts, downwash, cokeFoot, coverLoft, vertexNormals, lowerZone, upperZone, smooth,
           earcut, strut, fine, block, box, boxFn, blockFn, housing, cTub, floor, endplate, tunnel, headrest,
           _norm: norm };
})();
Object.freeze(CarShade);
