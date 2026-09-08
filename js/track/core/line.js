"use strict";
/* Apex 26 — TrackLine: the baked RACING LINE, a lateral offset per centreline
 * node, computed once at track build beside track.curv.
 *
 * The AI used to aim at `-k * 130 * hw` — a lateral target proportional to the
 * curvature 18-70 m ahead. That is an inside-hugging line: it enters every
 * corner already on the inside, apexes wherever the mix left it (measured on
 * monza: entry +1..+3.6 m INSIDE, apex only +1.2 m inside on a 7 m half-width)
 * and only drifts wide on exit. A racing line is outside-inside-outside: the
 * turn-in from the outside edge, the apex on the inside edge, the exit released
 * back to the outside — the largest radius the road allows, which is why it is
 * faster and why everybody drives it (Game AI Pro ch. 39's "representing a race
 * track"; iRacing's "line optimality" skill axis).
 *
 * Geometry, per corner (a run of |curv| above K_ON, same-sign runs within
 * MERGE_M merged):
 *   apex   = the curvature-weighted centre of the run, on the inside edge
 *   turn-in = sqrt(2 * R * (2 * w)) before the apex — the distance a car needs
 *            to cross the road (2 w) on an arc of the corner's radius R —
 *            clamped to [25, 110] m, on the outside edge
 *   exit    = 1.25 x turn-in after the apex, on the outside edge (exits run wide)
 * Consecutive corners that overlap share one knot at the midpoint: opposite
 * signs straight-line a chicane through the middle, same signs stay outside
 * (a double apex keeps the outside between them). The apex is a plateau (the
 * car rides the inside for ~40 % of the corner). Knots are joined with a
 * cosine ease and box-smoothed; the offset is clamped to the road at every
 * node. `lineW` is 1 inside a corner window, easing to 0 over BLEND_M either
 * side: on a straight the line has no opinion and the car's own lane
 * preference spreads the field.
 *
 * Coordinates: x is +right, +curv is a LEFT turn (mesh.js), so the inside of a
 * corner is -sign(curv) in x. Everything here is static per track, so the
 * agent hooks and every AI car read the same table: `TrackLine.at(track, s)`.
 */
const TrackLine = (function () {
  const clamp = M4.clamp, lerp = M4.lerp;
  const K_ON = 0.006;       // rad/m (R < ~170 m) — gentler bends are flat-out kinks, not corners to apex
  const K_OFF = 0.0036;     // a corner that has begun ENDS only once the road is this straight (hysteresis:
                            // a long opening-radius bend like Parabolica keeps the inside to its real end)
  const MERGE_M = 30;       // same-sign runs closer than this are one corner
  const MIN_LEN_M = 12;     // shorter runs are wiggles, not corners
  const MARGIN = 1.2;       // m inside the road edge the line keeps
  const BLEND_M = 45;       // m over which the line's weight eases in/out at a corner window
  const SMOOTH_M = 8;       // box-filter half-width

  function bake(track) {
    const n = track.n, L = track.total, ds = L / n, curv = track.curv, hw = track.hw;
    const x = new Float32Array(n), w = new Float32Array(n);
    if (!n || !curv) { track.line = x; track.lineW = w; track.lineCorners = []; return track; }
    const wrapI = (i) => ((i % n) + n) % n;
    // 1. corner runs (wrap-aware): start the scan at a straight node if there is one.
    let start = 0;
    for (let i = 0; i < n; i++) if (Math.abs(curv[i]) <= K_ON) { start = i; break; }
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
    // merge same-sign runs separated by less than MERGE_M
    const merged = [];
    for (const r of runs) {
      const p = merged[merged.length - 1];
      if (p && p.sgn === r.sgn && (r.i0 - p.i1) * ds < MERGE_M) {
        for (let g = p.i1 + 1; g < r.i0; g++) p.ks.push(0);   // the gap's nodes, so ks stays aligned with i0..i1
        p.i1 = r.i1; p.sumK += r.sumK; p.sumKS += r.sumKS; p.kMax = Math.max(p.kMax, r.kMax); p.ks = p.ks.concat(r.ks);
      } else merged.push({ ...r, ks: r.ks.slice() });
    }
    // 2. corners with their knots (in scan-relative node units, may exceed n; wrapped on write)
    const corners = [];
    for (const r of merged) {
      if ((r.i1 - r.i0 + 1) * ds < MIN_LEN_M) continue;
      const apexStep = r.sumKS / r.sumK;
      const apexI = wrapI(start + Math.round(apexStep));
      const inside = -r.sgn;                                   // x sign of the inside edge
      const wRoad = Math.max(hw[apexI] - MARGIN, 0.5);
      // The path's radius is larger than the road's (that is the point of the
      // line): 1.5 R for the crossing distance.
      const R = 1.5 / Math.max(r.kMax, 1e-4);
      const turnIn = clamp(Math.sqrt(2 * R * 2 * wRoad), 25, 110);
      const exit = clamp(turnIn * 1.25, 30, 140);
      // The apex is a PLATEAU, not a point: the car rides the inside wherever
      // the road is still tight — every node at or above 55 % of the corner's
      // peak curvature, at least 6 m of it — or the box filter below shaves a
      // narrow peak two metres off the edge, and a long corner is released
      // while it is still bending.
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
    track.lineCorners = corners.map((c) => ({
      s0: wrapS(L, (start + c.entryStep) * ds), sApex: wrapS(L, (start + c.apexStep) * ds), s1: wrapS(L, (start + c.exitStep) * ds),
      k: c.kMax * c.sgn, inside: c.inside, len: (c.i1 - c.i0 + 1) * ds,
    }));
    if (!corners.length) { track.line = x; track.lineW = w; return track; }
    // 3. knots: entry (outside), apex (inside), exit (outside); overlapping neighbours share a midpoint knot
    const knots = [];
    for (let ci = 0; ci < corners.length; ci++) {
      const c = corners[ci], prev = corners[ci - 1];
      const out = -c.inside * c.wRoad, apx = c.inside * c.wRoad;
      if (prev && prev.exitStep > c.entryStep) {
        // overlap: replace prev's exit knot and this entry knot with one shared knot
        const last = knots[knots.length - 1];
        const mid = (prev.apexStep + c.apexStep) / 2;
        const xm = (-prev.inside * prev.wRoad + out) / 2;
        last.step = mid; last.x = xm; last.shared = true;
      } else knots.push({ step: c.entryStep, x: out, edge: "entry" });
      knots.push({ step: c.apexIn, x: apx, edge: "apex" });
      knots.push({ step: c.apexOut, x: apx, edge: "apex" });
      knots.push({ step: c.exitStep, x: out, edge: "exit" });
    }
    // wrap closure: the lap's last exit joins the first entry
    knots.sort((a, b) => a.step - b.step);
    const first = knots[0], last = knots[knots.length - 1];
    if (last.step - n > first.step) { // the last exit wraps past the first entry: share
      const mid = (last.step - n + first.step) / 2, xm = (last.x + first.x) / 2;
      first.step = mid; first.x = xm; first.shared = true; knots.pop();
    }
    // 4. interpolate knots around the lap with a cosine ease
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
    // 5. weight: 1 from entry to exit of each corner window, easing over BLEND_M outside it
    const blendN = BLEND_M / ds;
    for (const c of corners) {
      const e0 = c.entryStep - blendN, e1 = c.exitStep + blendN;
      for (let i = Math.floor(e0); i <= Math.ceil(e1); i++) {
        let v = 1;
        if (i < c.entryStep) v = clamp((i - e0) / blendN, 0, 1);
        else if (i > c.exitStep) v = clamp((e1 - i) / blendN, 0, 1);
        const idx = wrapI(start + i);
        if (v > w[idx]) w[idx] = v;
      }
    }
    // 6. smooth and clamp to the road
    const half = Math.max(1, Math.round(SMOOTH_M / ds));
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 0; i < n; i++) { let s = 0; for (let j = -half; j <= half; j++) s += x[wrapI(i + j)]; tmp[i] = s / (2 * half + 1); }
      x.set(tmp);
    }
    for (let i = 0; i < n; i++) { const lim = Math.max(hw[i] - MARGIN, 0.5); x[i] = clamp(x[i], -lim, lim); }
    track.line = x; track.lineW = w;
    bakeAttack(track, ds);
    bakePathK(track, ds);
    return track;
  }

  // THE PATH'S CURVATURE. The line is faster than the centreline because its
  // radius is larger: the widest arc that touches the outside edge at the
  // corner's ends and the inside edge at its apex. For a corner of centreline
  // radius R turning θ on a road with usable half-width w (a = R + w the
  // outside, b = R - w the inside), that arc's radius is
  //   ρ = (a² + b² - 2ab cos(θ/2)) / (2 (b - a cos(θ/2)))
  // — the classical result, and for a slow corner on a wide road it is two or
  // three times R. The AI's corner-speed model is a calibrated abstraction
  // (sqrt(LAT_MAX grip / k)), tuned on the ROAD's curvature against what the
  // player can actually do, so the whole gain cannot be handed over without an
  // AI on rails through every hairpin: the baked curvature is the road's eased
  // toward the arc's, never below 85 % of it (an 8 % corner-speed edge for
  // being on the line). The AI's brake target reads it when the car is ON the
  // line (game.js) — off it, fighting, it gets the road's own curvature, so
  // being off-line costs what it costs a real car.
  const PATH_FLOOR = 0.85;
  function bakePathK(track, ds) {
    const n = track.n, curv = track.curv;
    const pk = new Float32Array(n);
    pk.set(curv);
    const wrapI = (i) => ((i % n) + n) % n;
    for (const c of track.lineCorners || []) {
      const i0 = Math.floor(c.s0 / (track.total) * n), i1 = Math.floor(c.s1 / track.total * n);
      const len = ((i1 - i0) % n + n) % n;
      // the corner's angle: |k| integrated over its window
      let theta = 0; for (let q = 0; q <= len; q++) theta += Math.abs(curv[wrapI(i0 + q)]) * ds;
      const R = 1 / Math.max(Math.abs(c.k), 1e-4);
      const iA = Math.floor(c.sApex / track.total * n) % n;
      const w = Math.max(track.hw[iA] - MARGIN, 0.5);
      const a = R + w, b = R - w, cs = Math.cos(Math.min(theta, Math.PI) / 2);
      const den = 2 * (b - a * cs);
      // den <= 0: the arc would need the straights beyond the corner's ends —
      // an even larger radius than the formula can express, so the floor.
      const rho = den > 1e-3 ? (a * a + b * b - 2 * a * b * cs) / den : Infinity;
      const kArc = 1 / Math.max(rho, R);   // never tighter than the road
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

  // ATTACK ZONES. Overtaking that feels deliberate happens where it is ON: a
  // braking zone at the end of a straight, on a road wide enough for two. Each
  // corner's zone is the ZONE_M before its turn-in; its quality q is the length
  // of the straight feeding it (0 at 60 m, 1 at 450 m) times the road width
  // there (0 at 4 m half-width, 1 at 6.5 m). Game AI Pro ch. 39 keeps this as
  // per-corner "overtaking entry" flags on the track data; Assetto Corsa's
  // ai_hints DANGER zones are the same idea inverted. `toTurnIn` is the metres
  // to the next turn-in, for the give-up rule (a pass not half alongside by
  // the turn-in is a lunge, and is abandoned).
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
      let straight = c.s0 - prev.s1; if (straight < 0) straight += L;
      if (sorted.length === 1) straight = L - (c.s1 - c.s0);
      const iMid = Math.floor(wrapS(L, c.s0 - ZONE_M / 2) / L * n) % n;
      const width = clamp((hw[iMid] - 4) / 2.5, 0, 1);
      const qc = clamp((straight - 60) / 390, 0, 1) * width;
      const i0 = Math.floor(wrapS(L, c.s0 - ZONE_M) / L * n), i1 = Math.floor(c.s0 / L * n);
      for (let i = i0; i <= i0 + ((i1 - i0 + n) % n); i++) { const idx = ((i % n) + n) % n; if (qc > q[idx]) q[idx] = qc; }
    }
    // metres to the next turn-in, walking backwards from each corner's s0
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
  // O(1) index + lerp, same math as TrackSpline.curvature. Returns a shared object.
  function at(track, s) {
    const ln = track.line;
    if (!ln) { _out.x = 0; _out.w = 0; return _out; }
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    _out.x = lerp(ln[i], ln[j], f);
    _out.w = lerp(track.lineW[i], track.lineW[j], f);
    return _out;
  }

  return { bake, at, attackAt, pathK, K_ON, MARGIN, ZONE_M, PATH_FLOOR };
})();
