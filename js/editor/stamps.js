/* Apex 26 — TrackStamps: the designer's STRAIGHT / CORNER / HAIRPIN / CHICANE /
   S-BEND tools. A stamp is sampled exactly (arcs and straights from the anchor
   point's pose), pre-compensated for the engine's two Laplacian passes so a
   requested radius is roughly the BUILT radius, then spliced into the loop: the
   stamp replaces the selected span and a Dubins path (TrackShape.dubins, r ≥ the
   hairpin floor) rejoins its end to the first reachable downstream point. The
   loop therefore stays closed by construction and nothing solves closure
   globally. seedFromSegments() turns a straights-and-turns list into a first
   loop through the engine's dormant integrator (TrackSpline.centerline).
   LAZY_EDITOR; needs TrackShape at eval. */
const TrackStamps = (function () {
  "use strict";
  const S = TrackShape;
  const DEG = Math.PI / 180;
  const R_MIN = 15;           // the hairpin floor the validator reds below (built radius)
  const SPACING = 8;          // control points never closer than this

  // The engine smooths control points twice with L = 0.25 (TrackDef.realPoints):
  // on a sampled arc each pass scales the radius by 1 − L(1 − cos(h/R)), so
  // sample at R' to land near R after both. Ends still soften; WYSIWYG shows it.
  function compensate(R, h) {
    const f = 1 - 0.25 * (1 - Math.cos(h / R));
    return R / (f * f);
  }
  // ≤ 10° per control point on wide arcs, never closer than the 8 m spacing
  // rule on tight ones (the engine's spline carries a 25° step on an 18 m hairpin).
  const stepFor = (R) => Math.max(SPACING, R * 0.17);

  const KINDS = {
    straight: { label: "STRAIGHT", params: { L: 300 }, min: { L: 30 }, max: { L: 1500 } },
    corner:   { label: "CORNER",   params: { R: 60, deg: 90, dir: 1 }, min: { R: R_MIN, deg: 10 }, max: { R: 600, deg: 270 } },
    hairpin:  { label: "HAIRPIN",  params: { R: 18, dir: 1 }, min: { R: R_MIN }, max: { R: 25 } },
    chicane:  { label: "CHICANE",  params: { R: 20, deg: 35, dir: 1 }, min: { R: R_MIN, deg: 15 }, max: { R: 60, deg: 60 } },
    sbend:    { label: "S-BEND",   params: { R: 45, deg: 45, dir: 1 }, min: { R: R_MIN, deg: 15 }, max: { R: 300, deg: 120 } },
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

  /** Sample a stamp from `pose` ({x, z, th}); returns { pts, end } (start excluded). */
  function sample(kind, params, pose) {
    const p = clampParams(kind, params); if (!p) return null;
    const pts = []; let cur = pose;
    const push = (r) => { pts.push(...r.pts); cur = r.end; };
    const arc = (R, deg, dir) => { const Rc = compensate(R, stepFor(R)); push(S.arcPts(cur, Rc, dir * deg * DEG, stepFor(Rc))); };
    const run = (L) => push(S.straightPts(cur, L, 25));
    switch (kind) {
      case "straight": run(p.L); break;
      case "corner": arc(p.R, p.deg, p.dir); break;
      case "hairpin": run(40); arc(p.R, 180, p.dir); break;
      case "chicane": arc(p.R, p.deg, p.dir); run(20); arc(p.R, 2 * p.deg, -p.dir); run(20); arc(p.R, p.deg, p.dir); break;
      case "sbend": arc(p.R, p.deg, p.dir); arc(p.R, p.deg, -p.dir); break;
      default: return null;
    }
    return { pts, end: cur, params: p };
  }

  /** Replace the control span (i0, i1) exclusive with a stamp anchored at i0,
   *  rejoining downstream. i0 === i1 inserts after i0. Returns
   *  { ok, pts, sel: [from, to] } or { ok: false, reason }. Index 0 (the start
   *  line) is kept at index 0 unless the span covers it. */
  function splice(pts, i0, i1, kind, params) {
    const N = pts.length;
    i0 = S.wrapI(i0, N); i1 = S.wrapI(i1, N);
    const anchor = pts[i0];
    const st = sample(kind, params, { x: anchor[0], z: anchor[1], th: S.heading(pts, i0) });
    if (!st || !st.pts.length) return { ok: false, reason: "unknown stamp" };
    // Downstream candidates: the span end itself, then further points.
    const covered = (j) => S.wrapI(j - i0, N);   // how many points from i0 to j
    // An INSERT (i0 === i1) adds road the loop must absorb, so it may reach
    // further downstream for its rejoin than a replacement does.
    const insert = i0 === i1, reach = insert ? 12 : 7;
    for (let k = 0; k < reach; k++) {
      const j = S.wrapI(i1 + (insert ? 1 : 0) + k, N);
      if (j === i0 || covered(j) > N - 4) break;   // never eat the whole loop
      const B = pts[j], goal = { x: B[0], z: B[1], th: S.heading(pts, j) };
      const E = st.end, straight = Math.hypot(B[0] - E.x, B[1] - E.z);
      let fill = null;
      // Gentlest rejoin first: a 15 m fill behind a 60 m corner would be the
      // tightest bend on the lap, which is not what the stamp asked for.
      for (const r of [70, 45, 30, 20, R_MIN]) {
        const d = S.dubins(E, goal, r, 20);
        // A fill that doubles back on itself (a full loop to turn around) is
        // the sign the goal is behind the stamp: skip to the next candidate.
        if (d && d.len <= 3 * straight + 2 * Math.PI * r + 60) { fill = d; break; }
      }
      if (!fill) continue;
      // Assemble: everything up to and including i0, the stamp, the fill (minus
      // its last point, which IS pts[j]), then pts[j..] round to i0.
      const before = [], after = [];
      for (let m = 0; m <= covered(i0 === 0 ? 0 : i0); m++) before.push(pts[m]);   // 0..i0 inclusive (i0 in loop order from 0)
      // When i0 < j in index order the kept tail is j..N-1; when the span wraps, keep j..i0-1 via loop order.
      let m = j;
      while (m !== i0 && S.wrapI(m, N) !== 0) { after.push(pts[m]); m = S.wrapI(m + 1, N); }
      const wrapped = S.wrapI(i1 - i0, N) < S.wrapI(j - i0, N) ? false : false; // (documented: ordering by loop walk below)
      void wrapped;
      const fillPts = fill.pts.slice(0, -1);
      let out;
      if (j > i0 || j === 0) {
        // simple order: [0..i0] + stamp + fill + [j..N-1] (j === 0 → nothing after; the loop closes onto index 0)
        out = pts.slice(0, i0 + 1).concat(st.pts, fillPts, j === 0 ? [] : pts.slice(j));
      } else {
        // the span wraps past the start line: [j..i0] survives, index 0 moves to j
        out = pts.slice(j, i0 + 1).concat(st.pts, fillPts);
      }
      // Spacing: a sampled arc's last step can fall short of 8 m; dropping a
      // point on a circle leaves the rest on the circle, so nothing is protected.
      out = S.enforceSpacing(out, SPACING);
      // The stamp's surviving points, by reference (spacing may have merged a few).
      const mine = new Set(st.pts);
      let selA = -1, selB = -1;
      for (let m = 0; m < out.length; m++) if (mine.has(out[m])) { if (selA < 0) selA = m; selB = m; }
      if (out.length > 200) {
        // thin the untouched remainder first (RDP at 1 m), never the stamp or its fill
        const headEnd = selB + fillPts.length;
        const head = out.slice(0, headEnd + 1), tail = out.slice(headEnd + 1);
        out = head.concat(S.rdp(tail, 1));
        if (out.length > 200) return { ok: false, reason: "too many points — delete some first" };
      }
      return { ok: true, pts: out, sel: [selA, selB], word: fill.word };
    }
    return { ok: false, reason: "no room to rejoin the loop here — pick a longer span or a smaller stamp" };
  }

  /** A first loop from a straights-and-turns list through the engine's dormant
   *  integrator: seg = { t: turnDeg (+left), l: metres, w?: halfWidth }. The
   *  integrator scales lengths by 1.45 (arcade), so lengths are pre-divided. */
  function seedFromSegments(segs, baseHW) {
    if (typeof TrackSpline === "undefined" || !TrackSpline.centerline) return null;
    const scaled = segs.map((s) => Object.assign({}, s, { l: (s.l || 0) / 1.45 }));
    const raw = TrackSpline.centerline(scaled, baseHW || 7);
    const pts = raw.map((p) => [p[0], p[2]]);
    return S.resample(pts, 25, true);
  }

  return { KINDS, R_MIN, SPACING, compensate, clampParams, sample, splice, seedFromSegments };
})();
Object.freeze(TrackStamps);
