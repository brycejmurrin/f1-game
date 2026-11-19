const TrackZones = (function () {
  "use strict";
  const S = TrackShape;

  const wrap01 = (v) => ((v % 1) + 1) % 1;
  function cumArc(pts) {
    const c = [0];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; c.push(c[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    return c;
  }
  function zoneMap(d, at, flip) {
    const pt = (key) => (z) => { const f = at(z[key], "p"); return f == null ? null : Object.assign({}, z, { [key]: wrap01(f) }); };
    const range = (z) => {
      if (z.s0 === 0 && z.s1 === 1) return Object.assign({}, z);
      let a = at(z.s0, "p"), b = at(z.s1, "p");
      if (a == null && b == null) return null;
      if (a == null) a = at(z.s0, "s0");
      if (b == null) b = at(z.s1, "s1");
      if (a == null || b == null) return null;
      if (flip) { const t = a; a = b; b = t; }
      return Object.assign({}, z, { s0: wrap01(a), s1: wrap01(b) });
    };
    const each = (list, fn) => (Array.isArray(list) ? list : []).map(fn).filter(Boolean);
    const out = {
      hwZones: each(d.hwZones, range),
      bankZones: each(d.bankZones, pt("frac")),
      elevations: each(d.elevations, pt("s")),
      bridges: each(d.bridges, pt("s")),
    };
    if (Array.isArray(d.props)) {
      out.props = each(d.props, pt("s"));
      if (flip) out.props = out.props.map((p) => Object.assign({}, p, { side: p.side < 0 ? 1 : -1 }));
    }
    return out;
  }
  function withZones(d, extra, at, flip) {
    const zm = zoneMap(d, at, flip);
    const next = Object.assign({}, d, extra || {}, zm);
    if (Array.isArray(zm.props) && !zm.props.length) delete next.props;
    return next;
  }
  function remapZones(d, oldPts, newPts, rotated) {
    const N = oldPts.length, M = newPts.length;
    const same = (p, q) => p[0] === q[0] && p[1] === q[1];
    if (!N || !M) return d;
    if (!same(oldPts[0], newPts[0])) {
      const r = oldPts.findIndex((p) => same(p, newPts[0]));
      if (r <= 0) return Object.assign({}, d, { heights: remapHeights(d, oldPts, newPts) });
      const c = cumArc(oldPts), f = c[N] > 0 ? c[r] / c[N] : 0, hs = Array.isArray(d.heights) ? d.heights : [];
      const rot = withZones(d, hs.length === N ? { heights: hs.slice(r).concat(hs.slice(0, r)) } : null, (v) => v - f, false);
      return remapZones(rot, S.rotate(oldPts, r), newPts, true);
    }
    const head = [[0, 0]];
    let i = 1, j = 1;
    while (i < N && j < M && same(oldPts[i], newPts[j])) head.push([i++, j++]);
    if (rotated) for (; j < M; j++) {
      let k = i;
      while (k < N && !same(oldPts[k], newPts[j])) k++;
      if (k >= N) break;
      head.push([k, j]); i = k + 1;
    }
    if (i === N && j === M) return d;
    const tail = [[N, M]];
    for (let jn = M - 1, io = N - 1; jn >= j; jn--) {
      let k = io;
      while (k >= i && !same(oldPts[k], newPts[jn])) k--;
      if (k < i) break;
      tail.unshift([k, jn]); io = k - 1;
    }
    const cO = cumArc(oldPts), cP = cumArc(newPts), LO = cO[N], LP = cP[M];
    if (!(LO > 0 && LP > 0)) return d;
    const A = head.concat(tail).map(([o, n]) => [cO[o], cP[n]]), gap = head.length - 1, eps = 1e-9 * LO;
    const h = head[gap], t0 = tail[0];
    const ins = M === N + 1 && t0[0] === h[0] + 1 && t0[1] === h[1] + 2;
    let tp = 0.5;
    if (ins) {
      const a = oldPts[h[0]], b = oldPts[t0[0] % N], p = newPts[h[1] + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      if (l2 > 0) tp = Math.min(1 - 1e-6, Math.max(1e-6, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    }
    const at = (f, role) => {
      const x = wrap01(f) * LO;
      let k = 0;
      while (k < A.length - 2 && x > A[k + 1][0]) k++;
      if (ins && k === gap) {
        const seg = A[k + 1][0] - A[k][0], t = seg > 0 ? Math.min(1, Math.max(0, (x - A[k][0]) / seg)) : 0, sp = cP[h[1] + 1];
        return (t <= tp ? A[k][1] + (t / tp) * (sp - A[k][1]) : sp + ((t - tp) / (1 - tp)) * (A[k + 1][1] - sp)) / LP;
      }
      if (k === gap && x > A[k][0] + eps && x < A[k + 1][0] - eps) return role === "s0" ? A[k + 1][1] / LP : role === "s1" ? A[k][1] / LP : null;
      const span = A[k + 1][0] - A[k][0];
      return (A[k][1] + (span > 0 ? (x - A[k][0]) / span : 0) * (A[k + 1][1] - A[k][1])) / LP;
    };
    return withZones(d, { heights: remapHeights(d, oldPts, newPts) }, at, false);
  }
  function remapHeights(d, oldPts, newPts) {
    const oldH = Array.isArray(d.heights) ? d.heights : [];
    const idx = new Map();
    for (let i = 0; i < oldPts.length; i++) idx.set(oldPts[i][0] + "," + oldPts[i][1], i);
    const M = newPts.length, known = new Array(M);
    for (let j = 0; j < M; j++) {
      const k = idx.get(newPts[j][0] + "," + newPts[j][1]);
      known[j] = k != null && k < oldH.length && Number.isFinite(+oldH[k]) ? +oldH[k] : null;
    }
    const c = cumArc(newPts), L = c[M];
    const next = known.map((v, j) => {
      if (v != null || !known.some((u) => u != null)) return v != null ? v : 0;
      let a = j, b = j;
      while (known[a] == null) a = (a - 1 + M) % M;
      while (known[b] == null) b = (b + 1) % M;
      const back = (c[j] - c[a] + L) % L, fwd = (c[b] - c[j] + L) % L;
      return back + fwd > 0 ? known[a] + (known[b] - known[a]) * back / (back + fwd) : known[a];
    });
    return typeof ElevPresets !== "undefined" ? ElevPresets.sanitize(newPts, next) : next;
  }

  return Object.freeze({ wrap01, cumArc, withZones, remapZones });
})();
Object.freeze(TrackZones);
