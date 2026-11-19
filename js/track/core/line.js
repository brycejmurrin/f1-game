const TrackLine = (function () {
  "use strict";

  const clamp = M4.clamp, lerp = M4.lerp;
  const K_ON = 0.006;
  const K_OFF = 0.0036;
  const MERGE_M = 30;
  const MIN_LEN_M = 12;
  const MARGIN = 1.2;
  const BLEND_M = 45;
  const RELAX_LAM = 0.001;
  const RELAX_OMEGA = 1.5;
  const RELAX_PASSES = 30;
  const RELAX_COARSE = 4;
  const RELAX_CPASSES = 120;
  const RELAX_MPASSES = 40;
  const SLOPE_NU = 1e-4;
  const SLOPE_MAX = 0.45;
  const TRIM_ROUNDS = 6;
  const TRIM_RELAX = 5;
  const TRIM_PASSES = 10;
  const FAIR_PASSES = 2;
  const FAM_SHIFT_M = 1.5;
  const HINT_SNAP_M = 80;

  const MEMO_MAX = 2;
  const OUT = ["line", "lineW", "lineIn", "lineOut", "lineK", "lineRoadK", "attackQ", "toTurnIn"];
  const _memo = [];
  const isF32 = (a) => Object.prototype.toString.call(a) === "[object Float32Array]";
  const bits = (a) => new Uint32Array(a.buffer, a.byteOffset, a.length);
  function sameBits(a, b) {
    if (a.length !== b.length) return false;
    const u = bits(a), v = bits(b);
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
    return true;
  }
  const copyOut = (src, dst) => {
    for (const f of OUT) if (src[f]) dst[f] = new Float32Array(src[f]);
    dst.lineCorners = src.lineCorners.map((c) => ({ ...c }));
    return dst;
  };
  function bake(track) {
    const curv = track.curv, hw = track.hw, def = track.def;
    if (!isF32(curv) || !isF32(hw)) return bakeFresh(track);
    const kr = track.lineRoadK = roadK(track);
    const hints = JSON.stringify([def && def.lineHints, def && def.turns]);
    const hit = _memo.findIndex((m) => m.n === track.n && m.total === track.total && m.hints === hints &&
      sameBits(m.curv, curv) && sameBits(m.hw, hw) && sameBits(m.out.lineRoadK, kr));
    if (hit >= 0) { const m = _memo.splice(hit, 1)[0]; _memo.unshift(m); return copyOut(m.out, track); }
    bakeFresh(track);
    _memo.unshift({ n: track.n, total: track.total, hints, curv: new Float32Array(curv), hw: new Float32Array(hw), out: copyOut(track, {}) });
    _memo.length = Math.min(_memo.length, MEMO_MAX);
    return track;
  }

  const ROADK_SPAN = 1;
  function roadK(track) {
    const n = track.n, px = track.px, pz = track.pz;
    if (!px || !pz || n < 8) return track.curv;
    const ds = track.total / n, m = ROADK_SPAN, k = new Float32Array(n);
    const head = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      head[i] = Math.atan2(px[b] - px[a], pz[b] - pz[a]);
    }
    for (let i = 0; i < n; i++) {
      let d = head[(i + m) % n] - head[(i - m + n) % n];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      k[i] = d / (2 * m * ds);
    }
    return k;
  }

  function bakeFresh(track) {
    const n = track.n, L = track.total, ds = L / n, curv = track.curv, hw = track.hw;
    const x = new Float32Array(n), w = new Float32Array(n);
    if (!n || !curv) { track.line = x; track.lineW = w; track.lineCorners = []; return track; }
    const wrapI = (i) => ((i % n) + n) % n;
    let start = 0;
    for (let i = 0; i < n; i++) if (Math.abs(curv[i]) <= K_OFF) { start = i; break; }
    const runs = [];
    let cur = null;
    for (let step = 0; step < n; step++) {
      const i = wrapI(start + step), k = curv[i], ak = Math.abs(k);
      const sgn = k > 0 ? 1 : -1;
      const on = cur && cur.sgn === sgn ? ak > K_OFF : ak > K_ON;
      if (on && cur && cur.sgn === sgn) { cur.i1 = step; cur.sumK += ak; cur.sumKS += ak * step; if (ak > cur.kMax) cur.kMax = ak; cur.ks.push(ak); }
      else if (on) { if (cur) runs.push(cur); cur = { i0: step, i1: step, sgn, sumK: ak, sumKS: ak * step, kMax: ak, ks: [ak] }; }
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    if (runs.length > 1) {
      const f = runs[0], l = runs[runs.length - 1];
      if (f.sgn === l.sgn && (f.i0 + n - l.i1) * ds < MERGE_M) {
        for (let g = l.i1 + 1; g < f.i0 + n; g++) l.ks.push(0);
        l.ks = l.ks.concat(f.ks);
        l.sumKS += f.sumKS + n * f.sumK; l.sumK += f.sumK; l.kMax = Math.max(l.kMax, f.kMax);
        l.i1 = f.i1 + n;
        runs.shift();
      }
    }
    const merged = [];
    for (const r of runs) {
      const p = merged[merged.length - 1];
      if (p && p.sgn === r.sgn && (r.i0 - p.i1) * ds < MERGE_M) {
        for (let g = p.i1 + 1; g < r.i0; g++) p.ks.push(0);
        p.i1 = r.i1; p.sumK += r.sumK; p.sumKS += r.sumKS; p.kMax = Math.max(p.kMax, r.kMax); p.ks = p.ks.concat(r.ks);
      } else merged.push({ ...r, ks: r.ks.slice() });
    }
    const corners = [];
    for (const r of merged) {
      if ((r.i1 - r.i0 + 1) * ds < MIN_LEN_M) continue;
      const apexStep = r.sumKS / r.sumK;
      const apexI = wrapI(start + Math.round(apexStep));
      const inside = -r.sgn;
      const wRoad = Math.max(hw[apexI] - MARGIN, 0.5);
      const R = 1.5 / Math.max(r.kMax, 1e-4);
      const turnIn = clamp(Math.sqrt(2 * R * 2 * wRoad), 25, 110);
      const exit = clamp(turnIn * 1.25, 30, 140);
      let pIn = -1, pOut = -1;
      for (let q = 0; q < r.ks.length; q++) if (r.ks[q] >= 0.55 * r.kMax) { if (pIn < 0) pIn = q; pOut = q; }
      let apexIn = r.i0 + pIn, apexOut = r.i0 + pOut;
      const minP = 6 / ds;
      if (apexOut - apexIn < minP) { const m = (apexIn + apexOut) / 2; apexIn = m - minP / 2; apexOut = m + minP / 2; }
      corners.push({ apexStep, inside, wRoad, kMax: r.kMax, sgn: r.sgn,
        apexIn, apexOut,
        entryStep: apexIn - turnIn / ds, exitStep: apexOut + exit / ds,
        i0: r.i0, i1: r.i1 });
    }
    const hints = resolveHints(track, corners, start, ds);
    for (const h of hints) if (h.apexShift) {
      const d = h.apexShift / ds, c = h.corner;
      c.apexStep += d; c.apexIn += d; c.apexOut += d; c.entryStep += d; c.exitStep += d;
    }
    track.lineCorners = corners.map((c) => ({
      s0: wrapS(L, (start + c.entryStep) * ds), sApex: wrapS(L, (start + c.apexStep) * ds), s1: wrapS(L, (start + c.exitStep) * ds),
      k: c.kMax * c.sgn, inside: c.inside, len: (c.i1 - c.i0 + 1) * ds,
    }));
    if (!corners.length) { track.line = x; track.lineW = w; return track; }
    const knots = [];
    for (let ci = 0; ci < corners.length; ci++) {
      const c = corners[ci], prev = corners[ci - 1];
      const out = -c.inside * c.wRoad, apx = c.inside * c.wRoad;
      if (prev && prev.exitStep > c.entryStep) {
        const last = knots[knots.length - 1];
        const mid = (prev.apexStep + c.apexStep) / 2;
        const xm = (-prev.inside * prev.wRoad + out) / 2;
        last.step = mid; last.x = xm; last.shared = true;
      } else knots.push({ step: c.entryStep, x: out, edge: "entry" });
      knots.push({ step: c.apexIn, x: apx, edge: "apex" });
      knots.push({ step: c.apexOut, x: apx, edge: "apex" });
      knots.push({ step: c.exitStep, x: out, edge: "exit" });
    }
    knots.sort((a, b) => a.step - b.step);
    const first = knots[0], last = knots[knots.length - 1];
    if (last.step - n > first.step) {
      const mid = (last.step - n + first.step) / 2, xm = (last.x + first.x) / 2;
      first.step = mid; first.x = xm; first.shared = true; knots.pop();
    }
    const K = knots.length;
    for (let ki = 0; ki < K; ki++) {
      const a = knots[ki], b = knots[(ki + 1) % K];
      const bStep = ki + 1 < K ? b.step : b.step + n;
      const span = Math.max(bStep - a.step, 1e-6);
      const i0 = Math.ceil(a.step), i1 = Math.ceil(bStep);
      for (let i = i0; i < i1; i++) {
        const t = clamp((i - a.step) / span, 0, 1);
        const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
        x[wrapI(start + i)] = lerp(a.x, b.x, e);
      }
    }
    const blendN = BLEND_M / ds;
    const insideSgn = new Float32Array(n);
    for (const c of corners) {
      const e0 = c.entryStep - blendN, e1 = c.exitStep + blendN;
      for (let i = Math.floor(e0); i <= Math.ceil(e1); i++) {
        let v = 1;
        if (i < c.entryStep) v = clamp((i - e0) / blendN, 0, 1);
        else if (i > c.exitStep) v = clamp((e1 - i) / blendN, 0, 1);
        const idx = wrapI(start + i);
        if (v > w[idx]) { w[idx] = v; insideSgn[idx] = c.inside; }
      }
    }
    const lo = new Float32Array(n), hi = new Float32Array(n);
    for (let i = 0; i < n; i++) { const l = Math.max(hw[i] - MARGIN, 0.5); lo[i] = -l; hi[i] = l; }
    for (const h of hints) if (h.apexInside) {
      const c = h.corner, f = clamp(h.apexInside, -1, 1), side = f > 0 ? c.inside : -c.inside, m = Math.abs(f);
      for (let q = Math.floor(c.apexIn); q <= Math.ceil(c.apexOut); q++) {
        const i = wrapI(start + q), l = Math.max(hw[i] - MARGIN, 0.5);
        if (side < 0) hi[i] = Math.min(hi[i], -m * l); else lo[i] = Math.max(lo[i], m * l);
      }
    }
    for (let i = 0; i < n; i++) x[i] = clamp(x[i], lo[i], hi[i]);
    const kr = track.lineRoadK || (track.lineRoadK = roadK(track));
    relaxCoarse(x, kr, lo, hi, n, ds, RELAX_LAM, RELAX_CPASSES, RELAX_COARSE);
    relaxCoarse(x, kr, lo, hi, n, ds, RELAX_LAM, RELAX_MPASSES, 2);
    relaxLine(x, kr, lo, hi, n, ds, RELAX_PASSES, RELAX_LAM);
    for (let r = 0; r < TRIM_ROUNDS; r++) {
      trimSlopes(x, lo, hi, n, ds, TRIM_PASSES);
      relaxLine(x, kr, lo, hi, n, ds, TRIM_RELAX, RELAX_LAM);
    }
    trimSlopes(x, lo, hi, n, ds, TRIM_PASSES);
    fairLine(x, lo, hi, n, FAIR_PASSES);
    const xi = new Float32Array(n), xo = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = w[i] * FAM_SHIFT_M * insideSgn[i];
      xi[i] = clamp(x[i] + d, lo[i], hi[i]);
      xo[i] = clamp(x[i] - d, lo[i], hi[i]);
    }
    track.line = x; track.lineW = w; track.lineIn = xi; track.lineOut = xo;
    bakeAttack(track, ds);
    bakePathK(track, ds);
    return track;
  }

  function resolveHints(track, corners, start, ds) {
    const def = track.def, out = [];
    const list = def && def.lineHints, turns = def && def.turns;
    if (!list || !list.length || !turns || !turns.length || !corners.length) return out;
    const L = track.total;
    for (const h of list) {
      if (!h || !Number.isFinite(h.turn)) continue;
      const ti = ((Math.round(h.turn) - 1) % turns.length + turns.length) % turns.length;
      const sT = wrapS(L, (((turns[ti] % 1) + 1) % 1) * L);
      let best = null, bd = Infinity;
      for (const c of corners) {
        const sA = wrapS(L, (start + c.apexStep) * ds);
        let d = Math.abs(sA - sT); if (d > L / 2) d = L - d;
        if (d < bd) { bd = d; best = c; }
      }
      if (!best || bd > HINT_SNAP_M) {
        try { Log.warn("track", "lineHints: turn " + h.turn + " of " + def.id + " is " + Math.round(bd) + " m from any baked corner — dropped"); } catch (_) {  }
        continue;
      }
      out.push({ corner: best, apexShift: +h.apexShift || 0, apexInside: +h.apexInside || 0 });
    }
    return out;
  }

  function lineCurvature(track) {
    const n = track.n, ds = track.total / n, x = track.line, k = track.lineRoadK || track.curv, out = new Float32Array(n);
    if (!x || !k) return out;
    const h = 0.5 / ds, inv2 = 1 / (ds * ds);
    for (let i = 0; i < n; i++) {
      const a = i ? i - 1 : n - 1, b = i + 1 < n ? i + 1 : 0;
      const u = 1 + k[i] * x[i], xp = (x[b] - x[a]) * h, xpp = (x[a] - 2 * x[i] + x[b]) * inv2, kp = (k[b] - k[a]) * h;
      out[i] = (u * u * k[i] - u * xpp + xp * (kp * x[i] + 2 * k[i] * xp)) / Math.pow(u * u + xp * xp, 1.5);
    }
    return out;
  }

  function relaxLine(x, curv, lo, hi, n, ds, passes, lamK) {
    const inv2 = 1 / (ds * ds), h = 0.5 / ds, lam = 0.5 * lamK;
    for (let p = 0; p < passes; p++) {
      const fwd = (p & 1) === 0;
      for (let q = 0; q < n; q++) {
        const i = fwd ? q : n - 1 - q;
        const a = i ? i - 1 : n - 1, b = i + 1 < n ? i + 1 : 0;
        const aa = a ? a - 1 : n - 1, bb = b + 1 < n ? b + 1 : 0;
        const ci = curv[i], ca = curv[a], cb = curv[b];
        const xi = x[i], xa = x[a], xb = x[b], xaa = x[aa], xbb = x[bb];
        const ui = Math.max(1 + ci * xi, 0.2), xpi = (xb - xa) * h, xppi = (xa - 2 * xi + xb) * inv2, kpi = (cb - ca) * h;
        const ri = Math.sqrt(ui * ui + xpi * xpi), Di = ri * ri * ri;
        const ki = (ui * ui * ci - ui * xppi + xpi * (kpi * xi + 2 * ci * xpi)) / Di;
        const gi = ((2 * ui * ci * ci - ci * xppi + 2 * ui * inv2 + xpi * kpi) - ki * 3 * ui * ci * ri) / Di;
        const ua = Math.max(1 + ca * xa, 0.2), xpa = (xi - xaa) * h, xppa = (xaa - 2 * xa + xi) * inv2, kpa = (ci - curv[aa]) * h;
        const ra = Math.sqrt(ua * ua + xpa * xpa), Da = ra * ra * ra;
        const ka = (ua * ua * ca - ua * xppa + xpa * (kpa * xa + 2 * ca * xpa)) / Da;
        const ga = ((-ua * inv2 + h * (kpa * xa + 4 * ca * xpa)) - ka * 3 * xpa * h * ra) / Da;
        const ub = Math.max(1 + cb * xb, 0.2), xpb = (xbb - xi) * h, xppb = (xi - 2 * xb + xbb) * inv2, kpb = (curv[bb] - ci) * h;
        const rb = Math.sqrt(ub * ub + xpb * xpb), Db = rb * rb * rb;
        const kb = (ub * ub * cb - ub * xppb + xpb * (kpb * xb + 2 * cb * xpb)) / Db;
        const gb = ((-ub * inv2 - h * (kpb * xb + 4 * cb * xpb)) + kb * 3 * xpb * h * rb) / Db;
        const num = ki * gi + ka * ga + kb * gb + lam * ci - SLOPE_NU * xppi;
        const den = gi * gi + ga * ga + gb * gb + 2 * SLOPE_NU * inv2;
        const xn = xi - RELAX_OMEGA * num / den;
        x[i] = xn > hi[i] ? hi[i] : xn < lo[i] ? lo[i] : xn;
      }
    }
  }
  function trimSlopes(x, lo, hi, n, ds, passes) {
    const sm = SLOPE_MAX * ds;
    for (let p = 0; p < passes; p++) {
      const fwd = (p & 1) === 0;
      for (let q = 0; q < n; q++) {
        const i = fwd ? q : n - 1 - q, b = i + 1 < n ? i + 1 : 0;
        const d = x[b] - x[i], ad = d < 0 ? -d : d;
        if (ad <= sm) continue;
        const e = (ad - sm) * 0.5 * (d < 0 ? -1 : 1);
        const xi = x[i] + e, xb = x[b] - e;
        x[i] = xi > hi[i] ? hi[i] : xi < lo[i] ? lo[i] : xi;
        x[b] = xb > hi[b] ? hi[b] : xb < lo[b] ? lo[b] : xb;
      }
    }
  }

  function fairLine(x, lo, hi, n, passes) {
    const y = new Float32Array(n);
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < n; i++) y[i] = (x[i ? i - 1 : n - 1] + 2 * x[i] + x[i + 1 < n ? i + 1 : 0]) * 0.25;
      for (let i = 0; i < n; i++) x[i] = y[i] > hi[i] ? hi[i] : y[i] < lo[i] ? lo[i] : y[i];
    }
  }

  function relaxCoarse(x, curv, lo, hi, n, ds, lamK, passes, st) {
    const m = Math.floor(n / st);
    if (m < 8) return;
    const xc = new Float32Array(m), kc = new Float32Array(m), loc = new Float32Array(m), hic = new Float32Array(m);
    for (let j = 0; j < m; j++) { const i = j * st; xc[j] = x[i]; kc[j] = curv[i]; loc[j] = lo[i]; hic[j] = hi[i]; }
    relaxLine(xc, kc, loc, hic, m, ds * st, passes, lamK);
    for (let j = 0; j < m; j++) {
      const x0 = xc[j], x1 = xc[j + 1 < m ? j + 1 : 0];
      const span = j + 1 < m ? st : n - j * st;
      for (let q = 0; q < span; q++) x[j * st + q] = x0 + (x1 - x0) * q / span;
    }
  }

  const PATH_FLOOR = 0.85;
  function bakePathK(track, ds) {
    const n = track.n, curv = track.curv;
    const pk = new Float32Array(n);
    pk.set(curv);
    const wrapI = (i) => ((i % n) + n) % n;
    for (const c of track.lineCorners || []) {
      const i0 = Math.floor(c.s0 / (track.total) * n), i1 = Math.floor(c.s1 / track.total * n);
      const len = ((i1 - i0) % n + n) % n;
      let theta = 0; for (let q = 0; q <= len; q++) theta += Math.abs(curv[wrapI(i0 + q)]) * ds;
      const R = 1 / Math.max(Math.abs(c.k), 1e-4);
      const iA = Math.floor(c.sApex / track.total * n) % n;
      const w = Math.max(track.hw[iA] - MARGIN, 0.5);
      const a = R + w, b = R - w, cs = Math.cos(Math.min(theta, Math.PI) / 2);
      const den = 2 * (b - a * cs);
      const rho = den > 1e-3 ? (a * a + b * b - 2 * a * b * cs) / den : Infinity;
      const kArc = 1 / Math.max(rho, R);
      for (let q = 0; q <= len; q++) {
        const i = wrapI(i0 + q), k = curv[i], ak = Math.abs(k);
        if (ak < 1e-6) continue;
        const eased = Math.max(Math.min(ak, kArc), PATH_FLOOR * ak);
        pk[i] = k >= 0 ? eased : -eased;
      }
    }
    track.lineK = pk;
  }

  function pathK(track, s) {
    const pk = track.lineK;
    if (!pk) return 0;
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    return lerp(pk[i], pk[j], f);
  }

  const ZONE_M = 130;
  function bakeAttack(track, ds) {
    const n = track.n, L = track.total, cs = track.lineCorners || [], hw = track.hw;
    const q = new Float32Array(n), toIn = new Float32Array(n);
    toIn.fill(L);
    track.attackQ = q; track.toTurnIn = toIn;
    if (!cs.length) return;
    const sorted = cs.slice().sort((a, b) => a.s0 - b.s0);
    for (let ci = 0; ci < sorted.length; ci++) {
      const c = sorted[ci], prev = sorted[(ci - 1 + sorted.length) % sorted.length];
      let straight = c.s0 - prev.s1;
      if (straight < 0) straight = ci === 0 && prev.s1 >= prev.s0 ? straight + L : 0;
      if (sorted.length === 1) straight = L - (c.s1 - c.s0);
      const iMid = Math.floor(wrapS(L, c.s0 - ZONE_M / 2) / L * n) % n;
      const width = clamp((hw[iMid] - 4) / 2.5, 0, 1);
      const qc = clamp((straight - 60) / 390, 0, 1) * width;
      const i0 = Math.floor(wrapS(L, c.s0 - ZONE_M) / L * n), i1 = Math.floor(c.s0 / L * n);
      for (let i = i0; i <= i0 + ((i1 - i0 + n) % n); i++) { const idx = ((i % n) + n) % n; if (qc > q[idx]) q[idx] = qc; }
    }
    const s0s = sorted.map((c) => c.s0);
    for (let i = 0; i < n; i++) {
      const s = i * ds; let best = L;
      for (const s0 of s0s) { let d = s0 - s; if (d < 0) d += L; if (d < best) best = d; }
      toIn[i] = best;
    }
  }

  const _atk = { q: 0, toTurnIn: 0 };
  function attackAt(track, s) {
    if (!track.attackQ) { _atk.q = 0.5; _atk.toTurnIn = 1e9; return _atk; }
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const i = Math.floor(s / L * n) % n;
    _atk.q = track.attackQ[i]; _atk.toTurnIn = track.toTurnIn[i] - (s - i * (L / n));
    return _atk;
  }

  function wrapS(L, s) { s %= L; if (s < 0) s += L; return s; }

  const _out = { x: 0, w: 0 };
  _out.w = 0.5; _out.w = 0;
  function at(track, s, fam) {
    const ln = track.line;
    if (!ln) { _out.x = 0; _out.w = 0; return _out; }
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    let xv = lerp(ln[i], ln[j], f);
    if (fam) {
      const alt = fam > 0 ? track.lineIn : track.lineOut;
      if (alt) xv = lerp(xv, lerp(alt[i], alt[j], f), Math.min(Math.abs(fam), 1));
    }
    _out.x = xv;
    _out.w = lerp(track.lineW[i], track.lineW[j], f);
    return _out;
  }

  return { bake, at, attackAt, pathK, lineCurvature, K_ON, MARGIN, PATH_FLOOR, SLOPE_MAX };
})();
Object.freeze(TrackLine);
