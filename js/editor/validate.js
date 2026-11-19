const TrackValidate = (function () {
  "use strict";
  const S = TrackShape;
  const LIMITS = Object.freeze({
    lenMin: 2500, lenMax: 7000, lenAmber: 3500,
    rMin: 9, rAmber: 15, kinkMin: 7,
    gradeRed: 0.15, gradeAmber: 0.08, gradeWindowM: 40,
    startBackRed: 150, startBackAmber: 240, gridM: 198,
    startFwdRed: 70, startFwdAmber: 240,
    bridgeSep: 7,
    foldFrac: 0.67, foldAmberFrac: 0.8,
    ptsMin: 8, ptsMax: 200, ptsAmber: 180, spacing: 8, hwMin: 5, hwMax: 8,
  });
  const CLEAR_CELL = Math.max(24, 2 * LIMITS.hwMax + 10);
  const MAX_CROSSINGS = 64, MAP_HALF = 10000;

  function previewDef(design) {
    const it = CustomTracks.sanitize(design, { loose: true });
    if (!it) return null;
    return TrackDef.fromRaw(CustomTracks.toRaw(it));
  }
  function build(design) {
    const def = previewDef(design);
    if (!def) return null;
    try { return { def, tr: Tracks.buildCenterline(def, { line: false }) }; } catch (e) { return { def, tr: null, error: String(e && e.message || e) }; }
  }

  function noBays(tr, def) {
    if (typeof TrackPit === "undefined" || !TrackPit.build || !TrackPit.resolve) return false;
    try {
      if (!TrackPit.resolve(def).hasBays) return false;
      const pit = TrackPit.build(tr, def, Tracks.curvature);
      return !!pit && !pit.hasBays;
    } catch (_) { return false; }
  }
  function straightRun(tr, s0, dir, max) {
    const K = (typeof TrackPit !== "undefined" && TrackPit.PIT_K) || 0.0035, STEP = 8, L = tr.total;
    let d = 0;
    for (; d < max; d += STEP) if (Math.abs(Tracks.curvature(tr, (((s0 + dir * (d + STEP / 2)) % L) + L) % L)) > K) break;
    return d;
  }
  function bakeTurns(tr) {
    let turns = [];
    try { if (typeof TrackMaps !== "undefined" && TrackMaps.detectCorners) turns = TrackMaps.detectCorners(tr).map((c) => c.f).filter(Number.isFinite); } catch (_) { turns = []; }
    if (turns.length < 3) {
      const n = tr.n, peaks = [];
      for (let k = 0; k < n; k++) { const v = Math.abs(tr.curv[k]); if (v >= Math.abs(tr.curv[(k - 1 + n) % n]) && v > Math.abs(tr.curv[(k + 1) % n]) && v > 0.002) peaks.push({ k, v }); }
      peaks.sort((a, b) => b.v - a.v);
      turns = peaks.slice(0, 3).map((p) => p.k / n);
    }
    return turns.map((f) => ((f % 1) + 1) % 1).sort((a, b) => a - b);
  }
  function speedProfile(tr) {
    const n = tr.n, ds = tr.total / n, v = new Float64Array(n);
    for (let k = 0; k < n; k++) { const c = Math.abs(tr.curv[k]); v[k] = c > 1e-6 ? Math.min(92, Math.sqrt(32 / c)) : 92; }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 2 * n; i++) { const k = i % n, j = (k + 1) % n; v[j] = Math.min(v[j], Math.sqrt(v[k] * v[k] + 2 * 11 * ds)); }
      for (let i = 2 * n; i > 0; i--) { const k = i % n, j = (k - 1 + n) % n; v[j] = Math.min(v[j], Math.sqrt(v[k] * v[k] + 2 * 38 * ds)); }
    }
    return v;
  }
  const lapOf = (tr, v) => { const n = tr.n, ds = tr.total / n; let t = 0; for (let k = 0; k < n; k++) t += ds / Math.max(8, v[k]); return t; };
  function estLap(tr) { return lapOf(tr, speedProfile(tr)); }

  function check(design) {
    if (!design || typeof design !== "object") design = {};
    const issues = [];
    const add = (code, level, msg, extra) => issues.push(Object.assign({ code, level, msg }, extra || {}));
    const pts = design && Array.isArray(design.pts) ? design.pts : [];
    if (pts.length < LIMITS.ptsMin) add("points", "red", "Needs at least " + LIMITS.ptsMin + " points — keep drawing");
    const onMap = (p) => Array.isArray(p) && Math.abs(+p[0]) <= MAP_HALF && Math.abs(+p[1]) <= MAP_HALF;
    const poly = pts.length >= LIMITS.ptsMin && pts.every(onMap) ? S.polyLen(pts.map((p) => [+p[0], +p[1]]), true) : 0;
    if (poly > 2 * LIMITS.lenMax) {
      add("length", "red", "Lap is " + (poly / 1000).toFixed(1) + " km — at most 7 km", { fix: "length" });
      const stats = Object.assign(emptyStats(), { lengthM: Math.round(poly) });
      return { ok: false, red: issues.length, amber: 0, issues, stats, def: null, tr: null, turns: [] };
    }
    if (pts.length > LIMITS.ptsMax) add("points", "red", "Too many points (" + pts.length + "/" + LIMITS.ptsMax + ") — delete some", { fix: "points" });
    else if (pts.length > LIMITS.ptsAmber) add("points", "amber", pts.length + " points — near the " + LIMITS.ptsMax + " cap", { fix: "points" });
    for (let i = 0; i < pts.length && pts.length >= 2; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < LIMITS.spacing) { add("spacing", "red", "Two points closer than " + LIMITS.spacing + " m at point " + (i + 1), { ctrl: i, fix: "spacing" }); break; }
    }
    const hw = +design.baseHW;
    if (!(hw >= LIMITS.hwMin && hw <= LIMITS.hwMax)) add("width", "red", "Track half-width must be " + LIMITS.hwMin + "–" + LIMITS.hwMax + " m");
    const built = pts.length >= LIMITS.ptsMin ? build(design) : null;
    if (pts.length >= LIMITS.ptsMin && pts.length <= LIMITS.ptsMax && !built) add("bounds", "red", "This loop cannot be built — keep every point inside the ±10 km map", { fix: "bounds" });
    if (built && built.error) add("build", "red", "The engine could not build this loop: " + built.error);
    const tr = built && built.tr;
    const j = tr ? judge(tr, design, built.def) : { issues: [], stats: emptyStats(), turns: [] };
    issues.push(...j.issues);
    const red = issues.filter((i) => i.level === "red").length, amber = issues.filter((i) => i.level === "amber").length;
    return { ok: red === 0 && !!tr, red, amber, issues, stats: j.stats, def: built && built.def, tr, turns: j.turns };
  }
  const emptyStats = () => ({ lengthM: 0, turns: 0, minR: Infinity, estLapS: 0, startBackM: 0, startFwdM: 0, pitEntryM: 0, pitExitM: 0, elevM: 0, gradeMax: 0, crossings: 0, passZones: 0 });

  function judge(tr, design, def) {
    design = design || {};
    def = def || design;
    const issues = [];
    const add = (code, level, msg, extra) => issues.push(Object.assign({ code, level, msg }, extra || {}));
    const stats = emptyStats();
    let turns = [];
    {
      const n = tr.n, ds = tr.total / n, px = tr.px, pz = tr.pz, py = tr.py, curv = tr.curv, hwA = tr.hw;
      stats.lengthM = Math.round(tr.total);
      if (tr.total < LIMITS.lenMin) add("length", "red", "Lap is " + (tr.total / 1000).toFixed(2) + " km — at least 2.5 km", { fix: "length" });
      else if (tr.total > LIMITS.lenMax) add("length", "red", "Lap is " + (tr.total / 1000).toFixed(2) + " km — at most 7 km", { fix: "length" });
      else if (tr.total < LIMITS.lenAmber) add("length", "amber", "Lap is " + (tr.total / 1000).toFixed(2) + " km — F1 circuits run 3.5 km or more", { fix: "length" });
      let kMax = 0, kAt = 0, fold = null, foldAmber = null;
      const P = (i) => [px[(i + n) % n], pz[(i + n) % n]];
      for (let k = 0; k < n; k++) {
        const c = Math.abs(curv[k]);
        if (c > kMax) { kMax = c; kAt = k; }
        const R1 = S.menger(P(k - 1), P(k), P(k + 1));
        if (R1 <= hwA[k] * LIMITS.foldFrac) { if (!fold || R1 / hwA[k] < fold.R / fold.hw) fold = { k, R: R1, hw: hwA[k] }; }
        else if (R1 < hwA[k] * LIMITS.foldAmberFrac && !foldAmber) foldAmber = { k, R: R1 };
      }
      stats.minR = kMax > 1e-6 ? Math.round(1 / kMax) : Infinity;
      if (stats.minR < LIMITS.rMin) add("radius", "red", "Corner too tight: " + stats.minR + " m radius (minimum " + LIMITS.rMin + " m)", { s: kAt * ds, k: kAt, fix: "radius" });
      else if (stats.minR < LIMITS.rAmber) add("radius", "amber", "Very tight corner: " + stats.minR + " m radius (hairpins are " + LIMITS.rAmber + " m+)", { s: kAt * ds, k: kAt, fix: "radius" });
      let kinkR = Infinity, kinkAt = 0;
      for (let k = 0; k < n; k++) { const R = S.menger([px[(k - 3 + n) % n], pz[(k - 3 + n) % n]], [px[k], pz[k]], [px[(k + 3) % n], pz[(k + 3) % n]]); if (R < kinkR) { kinkR = R; kinkAt = k; } }
      if (kinkR < LIMITS.kinkMin && stats.minR >= LIMITS.rMin) add("kink", "red", "Kink in the road (" + Math.round(kinkR) + " m) — smooth the points here", { s: kinkAt * ds, k: kinkAt, fix: "kink" });
      if (fold) add("fold", "red", "Corner tighter than the road is wide — the tarmac folds here", { s: fold.k * ds, k: fold.k, fix: "fold" });
      else if (foldAmber) add("fold", "amber", "Corner nearly as tight as the road is wide", { s: foldAmber.k * ds, k: foldAmber.k, fix: "fold" });
      const bridges = Array.isArray(design.bridges) ? design.bridges : [];
      const xs = S.crossings(px, pz, n, 3).slice(0, MAX_CROSSINGS);
      for (const c of xs) {
        stats.crossings++;
        const sep = Math.abs(py[c.i] - py[c.j]);
        if (sep >= LIMITS.bridgeSep) add("bridge", "info", "Crossing bridged (" + sep.toFixed(1) + " m clearance)", { s: c.i * ds, s2: c.j * ds, x: c.x, z: c.z });
        else add("crossing", "red", "The road crosses itself at grade — add a bridge", { s: c.i * ds, s2: c.j * ds, x: c.x, z: c.z, fix: "bridge" });
      }
      const dress = (def && def._sceneryShift) || 0;
      for (const b of bridges) for (const c of xs) {
        const sb = (((b.s + dress) % 1) + 1) % 1 * tr.total;
        const near = (s) => { let d = Math.abs(s - sb); d = Math.min(d, tr.total - d); return d < b.halfM; };
        if (near(c.i * ds) && near(c.j * ds)) { add("bridge", "red", "Both roads rise under this bridge — shorten it or move it", { s: sb }); break; }
      }
      const Dnodes = Math.ceil(3 * (2 * tr.hw[0] + 10) / ds);
      let pitReach = 0, pitSide = 1, pitIn = null;
      if (Array.isArray(design.pts) && typeof TrackPit !== "undefined" && TrackPit.resolve) {
        try {
          const pr = TrackPit.resolve(def), off = pr.off;
          pitReach = Math.max(0, ((off && off.workOut) || 0) - 0.9);
          pitSide = pr.side === -1 ? -1 : 1;
          const pw = TrackPit.window(tr, Tracks.curvature);
          const back = pw.entryM + (TrackPit.ENTRY_ROAD || 0), fwd = pw.exitM + (TrackPit.EXIT_ROAD || 0);
          pitIn = (k) => { const s = k * ds; return s <= fwd || s >= tr.total - back; };
        } catch (_) { pitReach = 0; }
      }
      const cell = Math.max(CLEAR_CELL, 2 * LIMITS.hwMax + 12);
      let worst = null;
      const consider = (w, rank) => { if (rank > (worst ? worst.rank : 0) || (worst && rank === worst.rank && w.gap < worst.w.gap)) worst = { w, rank }; };
      for (const w of S.clearance(px, pz, py, n, Dnodes, LIMITS.bridgeSep, cell, 6, hwA)) consider(w, w.gap < 2 ? 3 : w.gap < 10 ? 1 : 0);
      if (pitReach > 2 && pitIn && !(worst && worst.rank === 3)) {
        let hwTop = 0;
        for (let k = 0; k < n; k++) if (hwA[k] > hwTop) hwTop = hwA[k];
        const pc = 2 * hwTop + pitReach + 1, pg = new Map(), cand = [];
        const pk = (cx, cz) => cx * 65536 + cz;
        for (let k = 0; k < n; k++) { const key = pk(Math.floor(px[k] / pc), Math.floor(pz[k] / pc)); const l = pg.get(key); if (l) l.push(k); else pg.set(key, [k]); }
        for (let a = 0; a < n; a++) {
          if (!pitIn(a)) continue;
          const cx = Math.floor(px[a] / pc), cz = Math.floor(pz[a] / pc);
          cand.length = 0;
          for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) { const l = pg.get(pk(cx + ox, cz + oz)); if (l) for (let q = 0; q < l.length; q++) cand.push(l[q]); }
          cand.sort((u, v) => u - v);
          for (let q = 0; q < cand.length; q++) {
            const b = cand[q], dg = Math.abs(a - b);
            if (Math.min(dg, n - dg) <= Dnodes || Math.abs(py[a] - py[b]) >= LIMITS.bridgeSep) continue;
            const dist = Math.hypot(px[a] - px[b], pz[a] - pz[b]), need = hwA[a] + hwA[b];
            if (dist < need + 2 || dist >= need + pitReach) continue;
            if (tr.rx && tr.rz && ((px[b] - px[a]) * tr.rx[a] + (pz[b] - pz[a]) * tr.rz[a]) * pitSide <= 0) continue;
            consider({ i: a, j: b, dist, gap: dist - need }, 2);
          }
        }
      }
      if (worst) {
        const w = worst.w, at = { s: w.i * ds, s2: w.j * ds, fix: "clearance" };
        if (worst.rank === 3) add("clearance", "red", "Two parts of the track overlap (" + Math.round(w.dist) + " m apart)", at);
        else if (worst.rank === 2) add("clearance", "red", "The pit opening crosses the other part of the track", at);
        else add("clearance", "amber", "Two parts of the track run very close (" + Math.round(w.dist) + " m)", at);
      }
      let lo = Infinity, hi = -Infinity, gMax = 0, gAt = 0;
      const W = Math.max(1, Math.round(LIMITS.gradeWindowM / ds));
      for (let k = 0; k < n; k++) { if (py[k] < lo) lo = py[k]; if (py[k] > hi) hi = py[k]; const g = Math.abs(py[(k + W) % n] - py[k]) / (W * ds); if (g > gMax) { gMax = g; gAt = k; } }
      stats.elevM = Math.round(hi - lo); stats.gradeMax = +(gMax * 100).toFixed(1);
      if (gMax > LIMITS.gradeRed) add("grade", "red", "Slope of " + stats.gradeMax + " % — that is a wall, not a hill", { s: gAt * ds, k: gAt });
      else if (gMax > LIMITS.gradeAmber) add("grade", "amber", "Steep: " + stats.gradeMax + " % slope (F1 circuits top out near 10 %)", { s: gAt * ds, k: gAt });
      stats.startBackM = straightRun(tr, 0, -1, 600); stats.startFwdM = straightRun(tr, 0, +1, 600);
      if (stats.startBackM < LIMITS.startBackRed) add("start", "red", "Only " + stats.startBackM + " m of straight before the start line — the grid and pit entry need " + LIMITS.startBackAmber + " m", { s: 0, fix: "start" });
      else if (stats.startBackM < LIMITS.gridM) add("start", "amber", stats.startBackM + " m of straight before the line — the back of the grid needs " + LIMITS.gridM + " m, the pit entry " + LIMITS.startBackAmber + " m", { s: 0, fix: "start" });
      else if (stats.startBackM < LIMITS.startBackAmber) add("start", "amber", stats.startBackM + " m of straight before the line — " + LIMITS.startBackAmber + " m fits the whole grid and pit entry", { s: 0, fix: "start" });
      if (stats.startFwdM < LIMITS.startFwdRed) add("start", "red", "Only " + stats.startFwdM + " m of straight after the start line — the pit exit needs " + LIMITS.startFwdRed + " m", { s: 0, fix: "start" });
      else if (noBays(tr, def)) add("start", "red", "The pit lane has no room for its garages — move the start line earlier on the straight (only " + stats.startFwdM + " m after it)", { s: 0, fix: "start" });
      else if (stats.startFwdM < LIMITS.startFwdAmber) add("start", "amber", stats.startFwdM + " m of straight after the line — " + LIMITS.startFwdAmber + " m lets the pit exit merge cleanly", { s: 0, fix: "start" });
      try { if (typeof TrackPit !== "undefined" && TrackPit.window) { const w = TrackPit.window(tr, Tracks.curvature); stats.pitEntryM = Math.round(w.entryM); stats.pitExitM = Math.round(w.exitM); } } catch (_) {  }
      turns = bakeTurns(tr);
      stats.turns = turns.length;
      const v = speedProfile(tr);
      stats.estLapS = +lapOf(tr, v).toFixed(1);
      if (typeof TrackInsight !== "undefined") {
        try {
          stats.passZones = TrackInsight.passingZones(tr, v).length;
          issues.push(...TrackInsight.fia(tr, design, stats, { v, turns }));
        } catch (e) { if (typeof Log !== "undefined") Log.warn("track", "insight checks failed: " + (e && e.message || e)); }
      }
    }
    return { issues, stats, turns };
  }

  return { LIMITS, previewDef, build, check, judge, straightRun, noBays, bakeTurns, estLap, speedProfile };
})();
Object.freeze(TrackValidate);
