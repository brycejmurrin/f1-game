/* Apex 26 — TrackFixes: one-click remedies for the track designer's CHECKS
   (TrackValidate). Each remedy takes a design and one issue and returns a NEW
   design — never the input mutated — on the 0.25 m storage lattice with point
   0 still the start (except the start remedy, whose whole job is to move it)
   and every zone still where it was on the road: START moves the line to the
   longest straight (the designer's START HERE shift), LENGTH and BOUNDS scale
   or centre the loop, SPACING / POINTS merge and thin with RDP, KINK / RADIUS /
   FOLD relax the control points under the issue, CROSSING adds a bridge, and
   CLEARANCE pushes two close sections apart. fixAll runs them over every RED
   (≤ 3 rounds). Pure; LAZY_EDITOR, after validate.js; needs TrackShape at eval,
   TrackRandom / TrackValidate / CustomTracks / TrackPit at call time. */
const TrackFixes = (function () {
  "use strict";
  const S = TrackShape;
  const BRIDGE = Object.freeze({ halfM: 160, rise: 8 });
  const LAP = Object.freeze({ short: 4000, long: 6500 });
  const MAP = 9500, SPACING = 8, PTS_CAP = 180, PULL = 0.3, PASSES = 3, ROUNDS = 3;
  // fixAll's order: the start and the scale first (they move everything), the
  // point count before the local edits (an index window must stay put), the
  // bridge before clearance (a crossing is also the closest approach).
  const ORDER = Object.freeze(["start", "length", "bounds", "spacing", "points", "kink", "radius", "fold", "crossing", "clearance"]);
  const REPEAT = { crossing: 4, clearance: 3 };            // several crossings in one round; one try for the rest

  const q = (v) => Math.round(v * 4) / 4;
  const wrap01 = (v) => ((v % 1) + 1) % 1;
  const lattice = (pts) => pts.map((p) => [q(p[0]), q(p[1])]);
  const km = (m) => (m / 1000).toFixed(2) + " km";
  const LIM = () => (typeof TrackValidate !== "undefined" && TrackValidate.LIMITS) || { lenMin: 2500, lenMax: 7000, lenAmber: 3500, rMin: 9, kinkMin: 7, bridgeSep: 7, ptsMin: 8 };
  const zonesCap = () => (typeof CustomTracks !== "undefined" && CustomTracks.LIMITS && CustomTracks.LIMITS.zones) || 24;
  const warn = (msg) => { if (typeof Log !== "undefined" && Log.warn) Log.warn("track", msg); };

  /** A clean copy of the control points, or null when any is malformed. */
  function ptsOf(d) {
    if (!d || typeof d !== "object" || !Array.isArray(d.pts)) return null;
    const out = [];
    for (const p of d.pts) {
      if (!Array.isArray(p) || p.length < 2) return null;
      const x = +p[0], z = +p[1];
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      out.push([x, z]);
    }
    return out.length >= 3 ? out : null;
  }
  const clone = (d) => JSON.parse(JSON.stringify(d));
  function cum(pts) {
    const c = [0];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; c.push(c[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    return c;
  }
  const samePts = (a, b) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

  /** Every zone list through one fraction map (the designer's zoneMap shapes). */
  function mapZones(d, at) {
    const pt = (key) => (z) => (z && Number.isFinite(z[key]) ? Object.assign({}, z, { [key]: wrap01(at(z[key])) }) : z);
    const range = (z) => (z && Number.isFinite(z.s0) && Number.isFinite(z.s1) ? Object.assign({}, z, { s0: wrap01(at(z.s0)), s1: wrap01(at(z.s1)) }) : z);
    const each = (list, fn) => (Array.isArray(list) ? list.map(fn) : list);
    const out = { hwZones: each(d.hwZones, range), bankZones: each(d.bankZones, pt("frac")), elevations: each(d.elevations, pt("s")), bridges: each(d.bridges, pt("s")) };
    if (Array.isArray(d.props)) out.props = each(d.props, pt("s"));   // authored scenery rides the road like any zone
    return out;
  }
  /** Zones follow the road through an edit: anchors are the control points both
   *  loops share (`pairs` [oldIdx, newIdx], starting [0, 0]); a zone keeps its
   *  share of the stretch between its two anchors, so one on an untouched
   *  segment stays on the same metre of road. */
  function remap(d, oldPts, newPts, pairs) {
    const cO = cum(oldPts), cN = cum(newPts), LO = cO[oldPts.length], LN = cN[newPts.length];
    if (!(LO > 0 && LN > 0)) return d;
    const A = pairs.map(([o, n]) => [cO[o], cN[n]]).concat([[LO, LN]]);
    const at = (f) => {
      const x = wrap01(f) * LO;
      let k = 0;
      while (k < A.length - 2 && x >= A[k + 1][0]) k++;
      const span = A[k + 1][0] - A[k][0];
      return (A[k][1] + (span > 0 ? (x - A[k][0]) / span : 0) * (A[k + 1][1] - A[k][1])) / LN;
    };
    return Object.assign(d, mapZones(d, at));
  }
  /** [old, new] index pairs for points that survived by reference (enforceSpacing / rdp keep references). */
  function survivors(aligned, out) {
    const idx = new Map(aligned.map((p, i) => [p, i])), pairs = [];
    out.forEach((p, j) => { if (idx.has(p)) pairs.push([idx.get(p), j]); });
    return pairs.length && pairs[0][0] === 0 && pairs[0][1] === 0 ? pairs : null;
  }
  /** The new design: a clone with `pts` (on the lattice) and zones + heights remapped by `pairs` (null: fractions stand). */
  function rebuilt(d, oldPts, newPts, pairs) {
    const out = clone(d);
    out.pts = lattice(newPts);
    // Heights are parallel to pts BY INDEX: a merged or thinned point would
    // otherwise slide every later height one point down the road. Every new
    // point is a survivor (enforceSpacing / rdp only drop), so each has a pair.
    if (pairs && Array.isArray(d.heights) && d.heights.length === oldPts.length) {
      out.heights = out.pts.map(() => 0);
      for (const [o, n] of pairs) if (Number.isFinite(+d.heights[o])) out.heights[n] = +d.heights[o];
    }
    return pairs ? remap(out, oldPts, out.pts, pairs) : out;
  }

  /** The built centreline: the verdict's / the tr passed in, else a fresh engine build. */
  function trOf(d, built) {
    if (built && built.px && built.total > 0) return built;
    if (built && built.tr && built.tr.px && built.tr.total > 0) return built.tr;
    if (typeof TrackValidate === "undefined" || !TrackValidate.build) return null;
    try { const b = TrackValidate.build(d); return b && b.tr && b.tr.total > 0 ? b.tr : null; } catch (_) { return null; }
  }
  /** The built lap length (m): built.total / built.tr.total / built.stats.lengthM, else a build, else the control polygon. */
  function lapOf(d, pts, built) {
    if (built && built.total > 0) return built.total;
    if (built && built.tr && built.tr.total > 0) return built.tr.total;
    if (built && built.stats && built.stats.lengthM > 0) return built.stats.lengthM;
    const tr = trOf(d, null);
    return tr ? tr.total : S.polyLen(pts, true);
  }
  /** The control point under built arc s: within ±8 % of the lap by arc fraction,
   *  the one nearest the built node at s (exact when the tr is known). skip0:
   *  never point 0. */
  function nearestCtrl(pts, tr, s, skip0) {
    const N = pts.length, c = cum(pts), L = c[N], Lb = tr ? tr.total : L, x = wrap01(s / Lb) * L;
    const arcD = (i) => { const v = Math.abs(c[i] - x) % L; return Math.min(v, L - v); };
    let target = null;
    if (tr && tr.px && tr.n) { const k = ((Math.round(s / (tr.total / tr.n)) % tr.n) + tr.n) % tr.n; target = [tr.px[k], tr.pz[k]]; }
    const win = Math.max(0.08 * L, 150);
    let best = -1, bd = Infinity;
    for (let i = skip0 ? 1 : 0; i < N; i++) {
      const a = arcD(i);
      if (a > win) continue;
      const score = target ? Math.hypot(pts[i][0] - target[0], pts[i][1] - target[1]) : a;
      if (score < bd) { bd = score; best = i; }
    }
    if (best < 0) for (let i = skip0 ? 1 : 0; i < N; i++) { const a = arcD(i); if (a < bd) { bd = a; best = i; } }
    return best;
  }
  /** Three consecutive control indices around c that leave point 0 alone. */
  function windowAt(c, N) {
    const w = (i) => ((i % N) + N) % N;
    if (c === 0) return [N - 1, 1, 2];
    if (c === 1) return [1, 2, 3];
    if (c === N - 1) return [N - 3, N - 2, N - 1];
    return [w(c - 1), c, w(c + 1)];
  }
  const circ = (a, b, L) => { const v = Math.abs(a - b) % L; return Math.min(v, L - v); };
  /** Is a `code` issue at `level` (or worse) still within `nearM` of built arc s? */
  function stillThere(v, code, level, s, nearM) {
    if (!v || !Array.isArray(v.issues)) return true;
    const L = (v.tr && v.tr.total) || (v.stats && v.stats.lengthM) || 1;
    return v.issues.some((i) => i.code === code && (level === "amber" ? i.level !== "info" : i.level === "red") && (!Number.isFinite(i.s) || !Number.isFinite(s) || circ(i.s, s, L) < nearM));
  }
  const check = (d) => { try { return TrackValidate.check(d); } catch (_) { return null; } };

  // ── the remedies ─────────────────────────────────────────────────────────
  /** START: the designer's startOnLongestStraight + START HERE's zone shift.
   *  Twice, as TrackRandom.generate does: the 4 m resample starts at control 0,
   *  so rotating re-phases it, and a second look settles the line where a
   *  second click would not move it again. */
  function fixStart(d, pts) {
    if (typeof TrackRandom === "undefined") return null;
    let cur = pts, f = 0, rot = 0;
    for (let pass = 0; pass < 2; pass++) {
      const ls = TrackRandom.longestStraight(cur);
      if (!ls || !ls.dense || !ls.dense.length || !(ls.lenM > 0)) break;
      const along = Math.min(Math.max(ls.lenM * 0.6, 240), Math.max(ls.lenM - 140, 0));
      const p = ls.dense[(ls.start + Math.round(along / 4)) % ls.dense.length];
      const j = S.project(cur, p[0], p[1]).i;
      if (!(j > 0)) break;
      const c = cum(cur);
      f += c[j] / c[cur.length];
      cur = S.rotate(cur, j);
      rot += j;
    }
    if (cur === pts || samePts(lattice(cur), lattice(pts))) return null;   // already there (or a full turn)
    const out = clone(d);
    out.pts = lattice(cur);
    Object.assign(out, mapZones(out, (v) => v - f));
    // Heights are parallel to pts: rotate them with it (the designer's START HERE does).
    if (Array.isArray(out.heights) && out.heights.length === pts.length) { const k = rot % pts.length; out.heights = out.heights.slice(k).concat(out.heights.slice(0, k)); }
    return { design: out, msg: "Moved the start to the longest straight" };
  }
  /** Scale about the centroid by k; recentre and fit the map when that pushes a point past it. */
  function scaled(pts, k) {
    const c = S.centroid(pts);
    let out = pts.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
    if (out.some((p) => Math.abs(p[0]) > MAP || Math.abs(p[1]) > MAP)) out = out.map((p) => [p[0] - c[0], p[1] - c[1]]);
    return out;
  }
  /** LENGTH: scale the loop to 4 km (short) or 6.5 km (long) on the BUILT lap, one corrective build. */
  function fixLength(d, pts, built) {
    const lim = LIM(), L = lapOf(d, pts, built);
    if (!(L > 0)) return null;
    const target = L < lim.lenAmber ? LAP.short : L > lim.lenMax ? LAP.long : 0;
    if (!target) return null;
    let next = scaled(pts, target / L);
    const tr = trOf(Object.assign({}, d, { pts: lattice(next) }), null);
    if (tr && Math.abs(target / tr.total - 1) > 0.005) next = scaled(next, target / tr.total);
    // Shrinking can pull two points under the spacing floor: merge them (zones follow the survivors).
    const aligned = lattice(next), out = S.enforceSpacing(aligned, SPACING);
    if (out.length < lim.ptsMin) return null;
    const pairs = out.length === aligned.length ? null : survivors(aligned, out);
    const res = rebuilt(d, pts, out, pairs);
    if (samePts(res.pts, pts)) return null;
    return { design: res, msg: "Scaled the lap to " + km(target) };
  }
  /** BOUNDS: centroid to the origin, then into ±9.5 km. */
  function fixBounds(d, pts) {
    const max = (P) => P.reduce((m, p) => Math.max(m, Math.abs(p[0]), Math.abs(p[1])), 0);
    if (max(pts) <= 10000) return null;                     // in range: the refusal is the point count or a malformed record
    const c = S.centroid(pts);
    let next = pts.map((p) => [p[0] - c[0], p[1] - c[1]]);
    const m = max(next), fit = m > MAP;
    if (fit) next = next.map((p) => [p[0] * MAP / m, p[1] * MAP / m]);
    return { design: rebuilt(d, pts, next, null), msg: fit ? "Centred the loop and scaled it to fit the map" : "Centred the loop on the map" };
  }
  /** SPACING / POINTS: merge points under 8 m, then RDP with a growing tolerance to ≤ 180. */
  function fixSpacing(d, pts) {
    const lim = LIM(), base = S.enforceSpacing(pts, SPACING);
    let out = base;
    for (let eps = 0.5; out.length > PTS_CAP && eps < 1000; eps *= 1.6) out = S.rdp(base.concat([base[0]]), eps).slice(0, -1);
    if (out.length < lim.ptsMin || out.length === pts.length) return null;
    const pairs = survivors(pts, out);
    if (!pairs) return null;
    const dropped = pts.length - out.length;
    return { design: rebuilt(d, pts, out, pairs), msg: base.length < pts.length && out.length === base.length ? "Merged " + dropped + " point" + (dropped === 1 ? "" : "s") + " closer than " + SPACING + " m" : "Thinned the loop to " + out.length + " points" };
  }
  /** KINK / RADIUS / FOLD: pull the three control points under the issue 30 %
   *  toward their neighbours' midpoint, ≤ 3 passes, until the engine's road
   *  there clears the rule. */
  function fixSmooth(d, pts, issue, built) {
    if (!Number.isFinite(issue.s) || pts.length < 4) return null;
    const tr = trOf(d, built), N = pts.length;
    const c = nearestCtrl(pts, tr, issue.s, false);
    if (c < 0) return null;
    const win = windowAt(c, N);
    let cur = pts.slice();
    for (let pass = 0; pass < PASSES; pass++) {
      const next = cur.slice();
      for (const i of win) {
        const a = cur[(i - 1 + N) % N], b = cur[i], e = cur[(i + 1) % N];
        next[i] = [q(b[0] + PULL * ((a[0] + e[0]) / 2 - b[0])), q(b[1] + PULL * ((a[1] + e[1]) / 2 - b[1]))];
      }
      cur = next;
      if (typeof TrackValidate === "undefined") {
        const lim = LIM();
        if (win.every((i) => S.menger(cur[(i - 1 + N) % N], cur[i], cur[(i + 1) % N]) >= 2 * lim.rMin)) break;
      } else if (!stillThere(check(Object.assign({}, d, { pts: lattice(cur) })), issue.code, issue.level, issue.s, 150)) break;
    }
    if (samePts(lattice(cur), pts)) return null;
    const out = S.enforceSpacing(cur, SPACING);
    const pairs = survivors(cur, out);
    if (!pairs || out.length < LIM().ptsMin) return null;
    return { design: rebuilt(d, pts, out, pairs), msg: "Smoothed the " + (issue.code === "kink" ? "kink" : "corner") + " at " + km(issue.s) };
  }
  /** CROSSING: a bridge (sanitize's BUMP shape { s, halfM, rise }) over the road
   *  farther from the start line, when the other road clears its span. */
  function fixCrossing(d, issue, built) {
    if (!Number.isFinite(issue.s)) return null;
    const tr = trOf(d, built);
    const L = tr ? tr.total : 0;
    if (!(L > 0)) return null;
    let s2 = issue.s2;
    if (!Number.isFinite(s2)) {
      const ds = L / tr.n;
      let best = null, bd = Infinity;
      for (const x of S.crossings(tr.px, tr.pz, tr.n, 3)) {
        const di = circ(x.i * ds, issue.s, L), dj = circ(x.j * ds, issue.s, L);
        if (di < bd) { bd = di; best = x.j * ds; }
        if (dj < bd) { bd = dj; best = x.i * ds; }
      }
      if (best == null || bd > 40) return null;
      s2 = best;
    }
    if (circ(issue.s, s2, L) <= BRIDGE.halfM) return null;  // the span would lift both roads
    const bridges = Array.isArray(d.bridges) ? d.bridges : [];
    if (bridges.length >= zonesCap()) return null;
    for (const b of bridges) {
      if (!b || !Number.isFinite(b.s)) continue;
      const sb = wrap01(b.s) * L, h = +b.halfM || 0;
      if (circ(sb, issue.s, L) < h || circ(sb, s2, L) < h) return null;   // already bridged here: not a second deck
    }
    // Lift the road farther from the line, so the grid stays flat.
    const up = circ(s2, 0, L) > circ(issue.s, 0, L) ? s2 : issue.s;
    const out = clone(d);
    out.pts = lattice(out.pts);
    out.bridges = bridges.map((b) => Object.assign({}, b)).concat([{ s: wrap01(up / L), halfM: BRIDGE.halfM, rise: BRIDGE.rise }]);
    return { design: out, msg: "Added a bridge at " + km(up) };
  }
  /** The pit complex's reach past the road edge (validate.js's pitReach). */
  function pitReach(d, built) {
    if (typeof TrackPit === "undefined" || !TrackPit.resolve || typeof TrackValidate === "undefined") return 0;
    try {
      const def = (built && built.def) || TrackValidate.previewDef(d), off = def && TrackPit.resolve(def).off;
      return Math.max(0, ((off && off.workOut) || 0) - 0.9);
    } catch (_) { return 0; }
  }
  /** CLEARANCE: push the control points under s and s2 apart along the line
   *  joining the two roads, (limit − dist)/2 + 2 m each (their neighbours half
   *  that, so the road bends instead of spiking), ≤ 3 passes. */
  function fixClearance(d, pts, issue, built) {
    if (!Number.isFinite(issue.s) || !Number.isFinite(issue.s2)) return null;
    let tr = trOf(d, built), cur = pts.slice(), moved = false;
    const N = pts.length, reach = pitReach(d, built);
    for (let pass = 0; pass < PASSES && tr; pass++) {
      const n = tr.n, ds = tr.total / n, at = (s) => ((Math.round(s / ds) % n) + n) % n;
      // Re-find the pair near the issue on this build (the arc shifts as points move).
      let ki = at(issue.s), kj = at(issue.s2);
      const best = { d: Infinity };
      for (let a = -12; a <= 12; a++) for (let b = -12; b <= 12; b++) {
        const i = (ki + a + n) % n, j = (kj + b + n) % n, dd = Math.hypot(tr.px[i] - tr.px[j], tr.pz[i] - tr.pz[j]);
        if (dd < best.d) Object.assign(best, { d: dd, i, j });
      }
      ki = best.i; kj = best.j;
      const dist = best.d, need = tr.hw[ki] + tr.hw[kj], limit = need + Math.max(10, reach + 1);
      if (pass > 0 && dist >= limit) break;
      // Two roads that CROSS here want a bridge, not a shove.
      if (dist < 1 || S.crossings(tr.px, tr.pz, n, 3).some((x) => circ(x.i, ki, n) < 20 && circ(x.j, kj, n) < 20 || circ(x.j, ki, n) < 20 && circ(x.i, kj, n) < 20)) return null;
      const move = (limit - dist) / 2 + 2;
      if (!(move > 0)) break;
      const ux = (tr.px[kj] - tr.px[ki]) / dist, uz = (tr.pz[kj] - tr.pz[ki]) / dist;
      const ci = nearestCtrl(cur, tr, ki * ds, true), cj = nearestCtrl(cur, tr, kj * ds, true);
      if (ci < 0 || cj < 0 || ci === cj) return null;
      const next = cur.slice(), touched = new Set([0]);
      const push = (i, sgn, m) => { if (touched.has(i)) return; touched.add(i); next[i] = [cur[i][0] + sgn * ux * m, cur[i][1] + sgn * uz * m]; };
      push(ci, -1, move); push(cj, +1, move);
      for (const [c0, sgn] of [[ci, -1], [cj, +1]]) { push((c0 - 1 + N) % N, sgn, move / 2); push((c0 + 1) % N, sgn, move / 2); }
      cur = next.map((p) => [q(p[0]), q(p[1])]);
      moved = true;
      if (typeof TrackValidate === "undefined") break;
      const v = check(Object.assign({}, d, { pts: cur }));
      if (!v || !stillThere(v, "clearance", issue.level, issue.s, 200)) break;
      tr = v.tr;
    }
    if (!moved || samePts(cur, pts)) return null;
    const out = S.enforceSpacing(cur, SPACING), pairs = survivors(cur, out);
    if (!pairs || out.length < LIM().ptsMin) return null;
    return { design: rebuilt(d, pts, out, pairs), msg: "Moved the two close sections apart" };
  }

  const REMEDY = {
    start: (d, pts) => fixStart(d, pts),
    length: (d, pts, it, b) => fixLength(d, pts, b),
    bounds: (d, pts) => fixBounds(d, pts),
    spacing: (d, pts) => fixSpacing(d, pts),
    points: (d, pts) => (pts.length > PTS_CAP ? fixSpacing(d, pts) : null),
    kink: (d, pts, it, b) => fixSmooth(d, pts, it, b),
    radius: (d, pts, it, b) => fixSmooth(d, pts, it, b),
    fold: (d, pts, it, b) => fixSmooth(d, pts, it, b),
    crossing: (d, pts, it, b) => fixCrossing(d, it, b),
    clearance: (d, pts, it, b) => fixClearance(d, pts, it, b),
  };

  /** Does this issue have a one-click remedy? (validate.js tags each one with `fix`.) */
  function canFix(issue) {
    return !!(issue && typeof issue === "object" && issue.fix && Object.prototype.hasOwnProperty.call(REMEDY, issue.code));
  }
  /** One remedy: { design, msg } — a NEW design — or null when there is none or
   *  it cannot apply. `built`: the TrackValidate.check verdict (or its tr) the
   *  issue came from; optional, the engine is rebuilt when absent. Never throws. */
  function apply(design, issue, built) {
    try {
      if (!design || typeof design !== "object" || !issue || typeof issue !== "object") return null;
      const fn = Object.prototype.hasOwnProperty.call(REMEDY, issue.code) ? REMEDY[issue.code] : null;
      const pts = fn && ptsOf(design);
      if (!pts) return null;
      const r = fn(design, pts, issue, built || null);
      return r && r.design && Array.isArray(r.design.pts) ? r : null;
    } catch (e) {
      warn("TrackFixes." + (issue && issue.code) + " failed: " + (e && e.message || e));
      return null;
    }
  }
  /** Every RED, in ORDER, ≤ 3 rounds — stops when none is left or a round
   *  changed nothing. `check` is TrackValidate.check. Ambers stay. Returns
   *  { design, applied: [codes, first-applied order], msgs, verdict }; the
   *  input design itself when nothing applied. */
  function fixAll(design, check) {
    const judge = typeof check === "function" ? check : (typeof TrackValidate !== "undefined" ? TrackValidate.check : null);
    const applied = [], msgs = [];
    let d = design, v = null;
    try { v = judge ? judge(d) : null; } catch (_) { v = null; }
    for (let round = 0; round < ROUNDS && v && v.red > 0; round++) {
      let changed = false;
      for (const code of ORDER) {
        for (let t = 0; t < (REPEAT[code] || 1) && v && v.red > 0; t++) {
          const reds = (v.issues || []).filter((i) => i && i.level === "red" && i.code === code);
          let r = null;
          for (const it of reds) { r = apply(d, it, v); if (r) break; }
          if (!r) break;
          d = r.design; msgs.push(r.msg); changed = true;
          if (!applied.includes(code)) applied.push(code);
          try { v = judge(d); } catch (_) { v = null; }
        }
        if (!v || !(v.red > 0)) break;
      }
      if (!changed) break;
    }
    return { design: d, applied, msgs, verdict: v };
  }

  return { ORDER, BRIDGE, LAP, canFix, apply, fixAll };
})();
Object.freeze(TrackFixes);
