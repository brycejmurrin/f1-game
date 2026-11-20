const TrackStamps = (function () {
  "use strict";
  const S = TrackShape;
  const DEG = Math.PI / 180;
  const R_MIN = 15;
  const SPACING = 8;
  const CHORD_MAX = 25;
  const FILL_STEP = 60, FILL_CHORD = [SPACING, CHORD_MAX, 20 * DEG];

  function compensate(R, h) {
    const f = 1 - 0.25 * (1 - Math.cos(h / R));
    return R / (f * f);
  }
  function arcFor(R, A) {
    const comp = (n) => compensate(R, R * A / n);
    const cMin = SPACING + 0.5;
    let Rc = R, n = 1;
    for (let it = 0; it < 6; it++) { n = S.arcSteps(Rc, A, cMin, CHORD_MAX); Rc = comp(n); }
    while (n > 1 && 2 * Rc * Math.sin(A / (2 * n)) < cMin) Rc = comp(--n);
    return { Rc, n };
  }

  const LS_MAX = 80;
  function spiralSweep(R, Ls, A) {
    A = A > 0 ? A : Math.PI / 2;
    const { Rc, n } = arcFor(R, A), len = Rc * A, cMin = SPACING + 0.5;
    const h = Math.min(CHORD_MAX, Math.max(cMin, 10 * DEG * Rc));
    const m = Math.min(Math.round(Math.min(LS_MAX, Math.max(0, +Ls || 0)) / h), Math.floor(len / h) - 2);
    const L = m >= 2 ? m * h : 0;
    return { Rc, n, Ls: L, sweep: L / (2 * Rc), arc: Math.max(0, A - L / Rc) };
  }
  function spiralArc(cur, R, A, dir, Ls, push) {
    const sp = spiralSweep(R, Ls, A), k = 1 / sp.Rc, STEP = 10 * DEG;
    if (!(sp.Ls > 0)) { push(S.arcPts(cur(), sp.Rc, dir * A, 0, sp.n)); return; }
    const cMin = SPACING + 0.5;
    push(S.clothoidPts(cur(), 0, k, sp.Ls, dir, cMin, CHORD_MAX, STEP));
    if (sp.arc * sp.Rc > 1e-6) push(S.arcPts(cur(), sp.Rc, dir * sp.arc, 0, S.arcSteps(sp.Rc, sp.arc, cMin, CHORD_MAX)));
    push(S.clothoidPts(cur(), k, 0, sp.Ls, dir, cMin, CHORD_MAX, STEP));
  }

  const KINDS = {
    straight: { label: "STRAIGHT", params: { L: 300 }, min: { L: 30 }, max: { L: 1500 } },
    corner:   { label: "CORNER",   params: { R: 60, deg: 90, dir: 1, Ls: 0 }, min: { R: R_MIN, deg: 10, Ls: 0 }, max: { R: 600, deg: 270, Ls: LS_MAX } },
    hairpin:  { label: "HAIRPIN",  params: { R: 18, dir: 1, Ls: 0 }, min: { R: R_MIN, Ls: 0 }, max: { R: 25, Ls: LS_MAX } },
    chicane:  { label: "CHICANE",  params: { R: 20, deg: 35, dir: 1, Ls: 0 }, min: { R: R_MIN, deg: 15, Ls: 0 }, max: { R: 60, deg: 60, Ls: LS_MAX } },
    sbend:    { label: "S-BEND",   params: { R: 45, deg: 45, dir: 1, Ls: 0 }, min: { R: R_MIN, deg: 15, Ls: 0 }, max: { R: 300, deg: 120, Ls: LS_MAX } },
  };
  function clampParams(kind, p) {
    const k = KINDS[kind]; if (!k) return null;
    const out = Object.assign({}, k.params, p || {});
    for (const key of Object.keys(k.params)) {
      if (key === "dir") { out.dir = out.dir < 0 ? -1 : 1; continue; }
      const v = +out[key];
      out[key] = Number.isFinite(v) ? Math.min(k.max[key], Math.max(k.min[key], v)) : k.params[key];
    }
    return out;
  }

  function sample(kind, params, pose) {
    const p = clampParams(kind, params); if (!p) return null;
    const pts = [], ends = new Set(); let cur = pose;
    const push = (r) => { pts.push(...r.pts); ends.add(r.pts[r.pts.length - 1]); cur = r.end; };
    const arc = (R, deg, dir) => {
      if (p.Ls > 0) return spiralArc(() => cur, R, deg * DEG, dir, p.Ls, push);
      const a = arcFor(R, deg * DEG); push(S.arcPts(cur, a.Rc, dir * deg * DEG, 0, a.n));
    };
    const run = (L) => push(S.straightPts(cur, L, 25));
    switch (kind) {
      case "straight": run(p.L); break;
      case "corner": arc(p.R, p.deg, p.dir); break;
      case "hairpin": run(40); arc(p.R, 180, p.dir); break;
      case "chicane": arc(p.R, p.deg, p.dir); run(20); arc(p.R, 2 * p.deg, -p.dir); run(20); arc(p.R, p.deg, p.dir); break;
      case "sbend": arc(p.R, p.deg, p.dir); arc(p.R, p.deg, -p.dir); break;
      default: return null;
    }
    return { pts, end: cur, ends, params: p };
  }

  function splice(pts, i0, i1, kind, params) {
    const N = pts.length;
    i0 = S.wrapI(i0, N); i1 = S.wrapI(i1, N);
    const anchor = pts[i0];
    const st = sample(kind, params, { x: anchor[0], z: anchor[1], th: S.heading(pts, i0) });
    if (!st || !st.pts.length) return { ok: false, reason: "unknown stamp" };
    const covered = (j) => S.wrapI(j - i0, N);
    const insert = i0 === i1, reach = insert ? 24 : 7;
    const knots = (P) => S.crossings(P.map((q) => q[0]), P.map((q) => q[1]), P.length, 3).length, was = knots(pts);
    let tangled = null;
    for (let k = 0; k < reach; k++) {
      const j = S.wrapI(i1 + (insert ? 1 : 0) + k, N);
      if (j === i0 || covered(j) > N - 4) break;
      const B = pts[j], goal = { x: B[0], z: B[1], th: S.heading(pts, j) };
      const E = st.end, straight = Math.hypot(B[0] - E.x, B[1] - E.z);
      let fill = null;
      for (const r of [70, 45, 30, 20, R_MIN]) {
        const d = S.dubins(E, goal, r, FILL_STEP, FILL_CHORD);
        if (d && d.len <= 3 * straight + 2 * Math.PI * r + 60) { fill = d; break; }
      }
      if (!fill) continue;
      const fillPts = fill.pts.slice(0, -1);
      let out;
      if (j > i0 || j === 0) {
        out = pts.slice(0, i0 + 1).concat(st.pts, fillPts, j === 0 ? [] : pts.slice(j));
      } else {
        out = pts.slice(j, i0 + 1).concat(st.pts, fillPts);
      }
      const protect = new Set();
      for (let m = 0; m < out.length; m++) if (st.ends.has(out[m])) protect.add(m);
      out = S.enforceSpacing(out, SPACING, protect);
      const mine = new Set(st.pts);
      let selA = -1, selB = -1;
      for (let m = 0; m < out.length; m++) if (mine.has(out[m])) { if (selA < 0) selA = m; selB = m; }
      if (out.length > 200) {
        const GUARD = 2, a = Math.max(0, selA - GUARD), b = Math.min(out.length, selB + fillPts.length + 1 + GUARD);
        const pre = S.rdp(out.slice(0, a), 1), tail = S.rdp(out.slice(b), 1);
        out = pre.concat(out.slice(a, b), tail);
        selB -= a - pre.length; selA -= a - pre.length;
        if (out.length > 200) return { ok: false, reason: "too many points — delete some first" };
      }
      const res = { ok: true, pts: out, sel: [selA, selB], word: fill.word };
      if (knots(out) > was) { if (!tangled) tangled = res; continue; }
      return res;
    }
    if (tangled) return tangled;
    return { ok: false, reason: "no room to rejoin the loop here — pick a longer span or a smaller stamp" };
  }

  function seedFromSegments(segs, baseHW) {
    if (typeof TrackSpline === "undefined" || !TrackSpline.centerline) return null;
    const scaled = segs.map((s) => Object.assign({}, s, { l: (s.l || 0) / 1.45 }));
    const raw = TrackSpline.centerline(scaled, baseHW || 7);
    const pts = raw.map((p) => [p[0], p[2]]);
    return S.resample(pts, 25, true);
  }

  return { KINDS, R_MIN, SPACING, LS_MAX, compensate, arcFor, spiralSweep, clampParams, sample, splice, seedFromSegments };
})();
Object.freeze(TrackStamps);
