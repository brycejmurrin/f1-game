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
 * car rides the inside for ~40 % of the corner). Knots joined with a cosine
 * ease are the SEED; the offset is then RELAXED (below) toward the line of
 * least curvature and shortest path, clamped to the road at every node.
 * `lineW` is 1 inside a corner window, easing to 0 over BLEND_M either side:
 * on a straight the line has no opinion and the car's own lane preference
 * spreads the field.
 *
 * RELAXATION (2026-09-08, docs/notes/RACING-LINE-RESEARCH.md). The knot line
 * alone was measured to be TIGHTER than the road in every corner — its
 * cosine swings and the 0.6–0.7 m/m lurch where two corner windows overlap
 * (Lesmos, Les Combes, Maggotts) cost 5–14 % of pure corner time against
 * driving the centreline. So the seed is relaxed node by node (Gauss-Seidel
 * with over-relaxation, coarse-to-fine so the long corners converge — 250
 * coarse passes then 60 fine, measured to give the same line as 400 + 300)
 * toward
 * the minimum of  Σ κ_line²  +  RELAX_LAM · Σ κ_road · x  over the lap, with
 * κ_line = κ/(1 + κ x) − x'' the offset curve's curvature to first order.
 * The first term is the minimum-curvature line (K1999, Coulom 2002; TUMFTM's
 * mincurv); the second is the path-length (shortest-path) term, and it is
 * what keeps a long constant-radius corner on the INSIDE — pure minimum
 * curvature runs the outside of Parabolica (measured: apex 3.8 m outside).
 * Relaxed, the line is 1–2 % faster than the centreline in the AI's own
 * corner-speed model, the lurches are gone (max lateral slope 0.46 m/m, at
 * Monza's first chicane where the road itself turns 90°), and the apexes sit
 * on the inside clamp. `pathK` (below) is unchanged: it is the AI's
 * calibrated brake model, not the line's geometry.
 *
 * FAMILIES and HINTS (the same evening). Beside `track.line` the bake keeps
 * `lineIn` and `lineOut` — the racing line shifted FAM_SHIFT_M toward and
 * away from the inside of each corner, weighted by `lineW` so they ARE the
 * racing line on a straight; `at(track, s, fam)` blends toward one.
 * `def.lineHints`
 * ([{ turn, apexShift, apexInside }], see resolveHints) lets a circuit
 * author a late apex or an apex kept to one side, as bounds the relaxation
 * honours rather than a hand-drawn line it would have to copy.
 *
 * Coordinates: x is +right, +curv is a LEFT turn (mesh.js), so the inside of a
 * corner is -sign(curv) in x. Everything here is static per track, so the
 * agent hooks and every AI car read the same table: `TrackLine.at(track, s)`.
 */
const TrackLine = (function () {
  "use strict";

  const clamp = M4.clamp, lerp = M4.lerp;
  const K_ON = 0.006;       // rad/m (R < ~170 m) — gentler bends are flat-out kinks, not corners to apex
  const K_OFF = 0.0036;     // a corner that has begun ENDS only once the road is this straight (hysteresis:
                            // a long opening-radius bend like Parabolica keeps the inside to its real end)
  const MERGE_M = 30;       // same-sign runs closer than this are one corner
  const MIN_LEN_M = 12;     // shorter runs are wiggles, not corners
  const MARGIN = 1.2;       // m inside the road edge the line keeps
  const BLEND_M = 45;       // m over which the line's weight eases in/out at a corner window
  const RELAX_LAM = 0.001;  // 1/m² — path-length weight against curvature² (see header; 0.003 turns in too early)
  const RELAX_OMEGA = 1.5;  // over-relaxation
  const RELAX_PASSES = 60;  // fine passes; 60 and 300 measure the same line (see the header)
  const RELAX_COARSE = 4;   // coarse stride (nodes) and its pass count — the long corners' wavelengths
  const RELAX_CPASSES = 250;
  const FAM_SHIFT_M = 1.5;       // m the INNER / OUTER families sit off the racing line inside a corner
  const HINT_SNAP_M = 80;        // a hint's turn must sit within this of a baked corner's apex

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
    // AUTHORED HINTS (def.lineHints, copied through tracks.js): per turn,
    // `apexShift` metres moves the whole corner's knots later (a late apex —
    // the entry onto a long straight) and `apexInside` (−1..1, a fraction of
    // the usable half-width) is a bound the apex plateau must keep on the
    // inside (positive) or the outside (negative, a double-apex's first half
    // or a corner taken wide on purpose). `turn` is 1-based into def.turns —
    // racing-space, no shift — the bankZones idiom (js/track/core/mesh.js).
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
    const insideSgn = new Float32Array(n);   // which way is the INSIDE of the corner at this node
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
    // 6. bounds (the road, MARGIN in, plus any authored apex bound), the seed
    //    clamped to them, then relaxed (header): coarse first, then fine.
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
    relaxCoarse(x, curv, lo, hi, n, ds, RELAX_LAM, RELAX_CPASSES);
    relaxLine(x, curv, lo, hi, n, ds, RELAX_PASSES, RELAX_LAM);
    // FAMILIES — the racing line shifted FAM_SHIFT_M toward the inside of the
    // corner (INNER: the defensive line and the inside pass) and toward the
    // outside (OUTER: the pass around the outside), weighted by `lineW` so
    // both families ARE the racing line on a straight and diverge only through
    // a corner, and clamped to the same road bounds. The AI blends toward one
    // while defending or passing (game.js, `TrackLine.at`'s `fam`), so a move
    // is one coherent line from entry to exit instead of a sideways push.
    //
    // These were two more relaxations (λ ×4 and λ 0) until they were measured:
    // they cost as much as the racing line itself — TrackLine.bake was 487 ms
    // of an 1113 ms monza build, 44 % of building a circuit — for a target the
    // AI damps into over ~0.7 s and never follows exactly. This construction
    // is O(n), lands within 0.25 m of where the relaxed inner family sat at
    // the turn-in, and cannot leave the road. 2026-09-08.
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

  // def.lineHints → [{ corner, apexShift, apexInside }]: each hint's turn (a
  // racing-lap fraction in def.turns) is snapped to the nearest baked corner's
  // apex; a hint that lands more than HINT_SNAP_M from any apex names a corner
  // the bake did not find and is dropped with a warning, never guessed.
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
        try { Log.warn("track", "lineHints: turn " + h.turn + " of " + def.id + " is " + Math.round(bd) + " m from any baked corner — dropped"); } catch (_) { /* no Log in a bare VM */ }
        continue;
      }
      out.push({ corner: best, apexShift: +h.apexShift || 0, apexInside: +h.apexInside || 0 });
    }
    return out;
  }

  // One SOR sweep per pass over the 3-node stencil of  Σ κ_line² + λ Σ κ x
  // (header). κ at i−1, i, i+1 all depend on x[i]; the step is the 1-D Newton
  // step of that local quadratic, over-relaxed and clamped to the road.
  function relaxLine(x, curv, lo, hi, n, ds, passes, lamK) {
    const inv2 = 1 / (ds * ds), lam = 0.5 * lamK;
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < n; i++) {
        const a = i ? i - 1 : n - 1, b = i + 1 < n ? i + 1 : 0;
        const aa = a ? a - 1 : n - 1, bb = b + 1 < n ? b + 1 : 0;
        const ci = curv[i], ca = curv[a], cb = curv[b];
        const di = Math.max(1 + ci * x[i], 0.2);
        const ki = ci / di - (x[a] - 2 * x[i] + x[b]) * inv2;
        const ka = ca / Math.max(1 + ca * x[a], 0.2) - (x[aa] - 2 * x[a] + x[i]) * inv2;
        const kb = cb / Math.max(1 + cb * x[b], 0.2) - (x[i] - 2 * x[b] + x[bb]) * inv2;
        const gi = 2 * inv2 - ci * ci / (di * di);           // ∂κ_i/∂x_i; ∂κ_{i±1}/∂x_i = −inv2
        const num = ki * gi - (ka + kb) * inv2 + lam * ci;
        const den = gi * gi + 2 * inv2 * inv2;
        const xn = x[i] - RELAX_OMEGA * num / den;
        x[i] = xn > hi[i] ? hi[i] : xn < lo[i] ? lo[i] : xn;
      }
    }
  }
  // Coarse-to-fine: relax every RELAX_COARSE-th node as its own lap (long
  // wavelengths converge in a fraction of the passes), then interpolate back.
  function relaxCoarse(x, curv, lo, hi, n, ds, lamK, passes) {
    const st = RELAX_COARSE, m = Math.floor(n / st);
    if (m < 8) return;
    const xc = new Float32Array(m), kc = new Float32Array(m), loc = new Float32Array(m), hic = new Float32Array(m);
    for (let j = 0; j < m; j++) { const i = j * st; xc[j] = x[i]; kc[j] = curv[i]; loc[j] = lo[i]; hic[j] = hi[i]; }
    relaxLine(xc, kc, loc, hic, m, ds * st, passes, lamK);
    for (let j = 0; j < m; j++) {
      const x0 = xc[j], x1 = xc[j + 1 < m ? j + 1 : 0];
      const span = j + 1 < m ? st : n - j * st;                 // the last span wraps to node 0
      for (let q = 0; q < span; q++) x[j * st + q] = x0 + (x1 - x0) * q / span;
    }
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
  // `fam` (optional, −1..1) blends toward a FAMILY: +1 the inner line, −1 the
  // outer (bake step 6). 0 / absent is the racing line.
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

  return { bake, at, attackAt, pathK, K_ON, MARGIN, ZONE_M, PATH_FLOOR };
})();
Object.freeze(TrackLine);
