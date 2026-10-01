/* Apex 26 — TrackValidate: WYSIWYG validation for the track designer. A design
   is judged on the road the ENGINE would build from it — CustomTracks.toRaw →
   TrackDef.fromRaw → Tracks.buildCenterline (the two Laplacian passes, the
   Catmull-Rom, the 4 m resample, the curvature LUT) — never on the editor's own
   approximation, so what the player sees RED is what the car would meet. Rules
   mirror the engine's floors: TrackPit's entry/exit straights, the tarmac-fold
   test from tools/track/verify-track.cjs (R ≤ hw), the 8 % grade cap, and the
   hairpin floor the stamps are built to. RED blocks SAVE / RACE / SHARE; AMBER
   is advice. LAZY_EDITOR; needs TrackShape at eval, the engine at call time. */
const TrackValidate = (function () {
  "use strict";
  const S = TrackShape;
  const LIMITS = Object.freeze({
    lenMin: 2500, lenMax: 7000, lenAmber: 3500,
    // The fleet oracle (tests/unit/track-validate-fleet.test.mjs) sets these:
    // shipped hairpins build down to 10 m (Monaco, Korea), so RED sits at 9 m
    // with the hairpin floor as advice; real gradients reach 15-22 % over 20 m
    // (Spa, Monaco), so grade is advice above 8 % and RED only for a wall.
    rMin: 9, rAmber: 15, kinkMin: 7,                      // Korea's hairpin measures 8 m on a 24 m chord; a control-point kink reads 2-5
    gradeRed: 0.15, gradeAmber: 0.08, gradeWindowM: 40,
    startBackRed: 150, startBackAmber: 240, gridM: 198,     // ENTRY_MIN; ENTRY_MIN + ENTRY_ROAD + MOUTH_RUN; 14 + 23·8
    startFwdRed: 70, startFwdAmber: 240,                    // EXIT_MIN + ROAD_MIN; EXIT_M + EXIT_ROAD + MERGE_RUN
    bridgeSep: 7,                                           // overheadSpan's 4.8 m clearance + deck
    foldFrac: 0.6, foldAmberFrac: 0.8,                      // node-scale radius / half-width (see the fold rule)
    ptsMin: 8, ptsMax: 200, ptsAmber: 180, spacing: 8, hwMin: 5, hwMax: 8,
  });
  let _rev = 0;

  /** The built-def for a design under a throwaway id (never registered, never cached). */
  function previewDef(design) {
    const it = CustomTracks.sanitize(design);
    if (!it) return null;
    const raw = CustomTracks.toRaw(it);
    raw.id = "__preview-" + (++_rev);
    return TrackDef.fromRaw(raw);
  }
  function build(design) {
    const def = previewDef(design);
    if (!def) return null;
    try { return { def, tr: Tracks.buildCenterline(def) }; } catch (e) { return { def, tr: null, error: String(e && e.message || e) }; }
  }

  /** How far the road stays straight from arc s0 in direction dir (±1), up to max (TrackPit.straightRun). */
  function straightRun(tr, s0, dir, max) {
    const K = (typeof TrackPit !== "undefined" && TrackPit.PIT_K) || 0.0035, STEP = 8, L = tr.total;
    let d = 0;
    for (; d < max; d += STEP) if (Math.abs(Tracks.curvature(tr, (((s0 + dir * (d + STEP / 2)) % L) + L) % L)) > K) break;
    return d;
  }
  /** Curated-style apex fractions from the built curvature (TrackMaps.detectCorners), ≥ 3. */
  function bakeTurns(tr) {
    let turns = [];
    try { if (typeof TrackMaps !== "undefined" && TrackMaps.detectCorners) turns = TrackMaps.detectCorners(tr).map((c) => c.f).filter(Number.isFinite); } catch (_) { turns = []; }
    if (turns.length < 3) {
      const n = tr.n, peaks = [];
      for (let k = 0; k < n; k++) { const v = Math.abs(tr.curv[k]); if (v >= Math.abs(tr.curv[(k - 1 + n) % n]) && v > Math.abs(tr.curv[(k + 1) % n]) && v > 0.002) peaks.push({ k, v }); }
      peaks.sort((a, b) => b.v - a.v);
      turns = peaks.slice(0, Math.max(3, Math.min(peaks.length, 3))).map((p) => p.k / n);
    }
    return turns.map((f) => ((f % 1) + 1) % 1).sort((a, b) => a - b);
  }
  /** Point-mass lap estimate (s): corner speed √(32/|k|) capped at 92 m/s, 11 m/s² accel, 38 m/s² brake. */
  function estLap(tr) {
    const n = tr.n, ds = tr.total / n, v = new Float64Array(n);
    for (let k = 0; k < n; k++) { const c = Math.abs(tr.curv[k]); v[k] = c > 1e-6 ? Math.min(92, Math.sqrt(32 / c)) : 92; }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 2 * n; i++) { const k = i % n, j = (k + 1) % n; v[j] = Math.min(v[j], Math.sqrt(v[k] * v[k] + 2 * 11 * ds)); }
      for (let i = 2 * n; i > 0; i--) { const k = i % n, j = (k - 1 + n) % n; v[j] = Math.min(v[j], Math.sqrt(v[k] * v[k] + 2 * 38 * ds)); }
    }
    let t = 0; for (let k = 0; k < n; k++) t += ds / Math.max(8, v[k]);
    return t;
  }

  /** The verdict: { ok, red, amber, issues, stats, def, tr, turns }. */
  function check(design) {
    const issues = [];
    const add = (code, level, msg, extra) => issues.push(Object.assign({ code, level, msg }, extra || {}));
    const pts = design && Array.isArray(design.pts) ? design.pts : [];
    if (pts.length < LIMITS.ptsMin) add("points", "red", "Needs at least " + LIMITS.ptsMin + " points — keep drawing");
    if (pts.length > LIMITS.ptsMax) add("points", "red", "Too many points (" + pts.length + "/" + LIMITS.ptsMax + ") — delete some");
    else if (pts.length > LIMITS.ptsAmber) add("points", "amber", pts.length + " points — near the " + LIMITS.ptsMax + " cap");
    for (let i = 0; i < pts.length && pts.length >= 2; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < LIMITS.spacing) { add("spacing", "red", "Two points closer than " + LIMITS.spacing + " m at point " + (i + 1), { ctrl: i }); break; }
    }
    const hw = +design.baseHW;
    if (!(hw >= LIMITS.hwMin && hw <= LIMITS.hwMax)) add("width", "red", "Track half-width must be " + LIMITS.hwMin + "–" + LIMITS.hwMax + " m");
    const built = pts.length >= LIMITS.ptsMin ? build(design) : null;
    if (built && built.error) add("build", "red", "The engine could not build this loop: " + built.error);
    const tr = built && built.tr;
    const j = tr ? judge(tr, design) : { issues: [], stats: emptyStats(), turns: [] };
    issues.push(...j.issues);
    const red = issues.filter((i) => i.level === "red").length, amber = issues.filter((i) => i.level === "amber").length;
    return { ok: red === 0 && !!tr, red, amber, issues, stats: j.stats, def: built && built.def, tr, turns: j.turns };
  }
  const emptyStats = () => ({ lengthM: 0, turns: 0, minR: Infinity, estLapS: 0, startBackM: 0, startFwdM: 0, pitEntryM: 0, pitExitM: 0, elevM: 0, gradeMax: 0, crossings: 0 });

  /** The road rules over a BUILT centreline (any track, a shipped circuit too —
   *  tests/unit/track-validate-fleet.test.mjs judges all 52 as the oracle).
   *  `design.bridges` is the only authored input read. */
  function judge(tr, design) {
    const issues = [];
    const add = (code, level, msg, extra) => issues.push(Object.assign({ code, level, msg }, extra || {}));
    const stats = emptyStats();
    let turns = [];
    {
      const n = tr.n, ds = tr.total / n, px = tr.px, pz = tr.pz, py = tr.py, curv = tr.curv, hwA = tr.hw;
      stats.lengthM = Math.round(tr.total);
      if (tr.total < LIMITS.lenMin) add("length", "red", "Lap is " + (tr.total / 1000).toFixed(2) + " km — at least 2.5 km");
      else if (tr.total > LIMITS.lenMax) add("length", "red", "Lap is " + (tr.total / 1000).toFixed(2) + " km — at most 7 km");
      else if (tr.total < LIMITS.lenAmber) add("length", "amber", "Lap is " + (tr.total / 1000).toFixed(2) + " km — F1 circuits run 3.5 km or more");
      // Radius from the engine's own LUT, plus a 12 m-chord Menger pass for kinks between nodes.
      // A tarmac fold (verify-track's roadGeoChecks) is a racing-surface rail
      // running backwards at a NODE-scale kink the ±12 m curvature window
      // averages away. Measured on the fleet (tests/unit/track-validate-fleet):
      // the 8 m-chord Menger radius over half-width is ≤ 0.57 on the four
      // circuits verify-track knows fold and ≥ 0.70 on every other.
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
      if (stats.minR < LIMITS.rMin) add("radius", "red", "Corner too tight: " + stats.minR + " m radius (minimum " + LIMITS.rMin + " m)", { s: kAt * ds, k: kAt });
      else if (stats.minR < LIMITS.rAmber) add("radius", "amber", "Very tight corner: " + stats.minR + " m radius (hairpins are " + LIMITS.rAmber + " m+)", { s: kAt * ds, k: kAt });
      // A kink between nodes the ±12 m curvature window averages away: Menger over a 24 m chord.
      let kinkR = Infinity, kinkAt = 0;
      for (let k = 0; k < n; k++) { const R = S.menger([px[(k - 3 + n) % n], pz[(k - 3 + n) % n]], [px[k], pz[k]], [px[(k + 3) % n], pz[(k + 3) % n]]); if (R < kinkR) { kinkR = R; kinkAt = k; } }
      if (kinkR < LIMITS.kinkMin && stats.minR >= LIMITS.rMin) add("kink", "red", "Kink in the road (" + Math.round(kinkR) + " m) — smooth the points here", { s: kinkAt * ds, k: kinkAt });
      if (fold) add("fold", "red", "Corner tighter than the road is wide — the tarmac folds here", { s: fold.k * ds, k: fold.k });
      else if (foldAmber) add("fold", "amber", "Corner nearly as tight as the road is wide", { s: foldAmber.k * ds, k: foldAmber.k });
      // Crossings: covered by a bridge (built height difference) or at grade.
      const bridges = Array.isArray(design.bridges) ? design.bridges : [];
      for (const c of S.crossings(px, pz, n, 3)) {
        stats.crossings++;
        const sep = Math.abs(py[c.i] - py[c.j]);
        if (sep >= LIMITS.bridgeSep) add("bridge", "info", "Crossing bridged (" + sep.toFixed(1) + " m clearance)", { s: c.i * ds, s2: c.j * ds, x: c.x, z: c.z });
        else add("crossing", "red", "The road crosses itself at grade — add a bridge", { s: c.i * ds, s2: c.j * ds, x: c.x, z: c.z, fix: "bridge" });
      }
      // Both roads of a bridge must not rise together.
      for (const b of bridges) for (const c of S.crossings(px, pz, n, 3)) {
        const sb = ((b.s % 1) + 1) % 1 * tr.total;
        const near = (s) => { let d = Math.abs(s - sb); d = Math.min(d, tr.total - d); return d < b.halfM; };
        if (near(c.i * ds) && near(c.j * ds)) { add("bridge", "red", "Both roads rise under this bridge — shorten it or move it", { s: sb }); break; }
      }
      // Clearance between non-adjacent spans at the same level.
      const Dnodes = Math.ceil(3 * (2 * tr.hw[0] + 10) / ds);
      for (const w of S.clearance(px, pz, py, n, Dnodes, LIMITS.bridgeSep, 24, 6)) {
        const need = hwA[w.i] + hwA[w.j];
        if (w.dist < need + 2) { add("clearance", "red", "Two parts of the track overlap (" + Math.round(w.dist) + " m apart)", { s: w.i * ds, s2: w.j * ds }); break; }
        if (w.dist < need + 10) { add("clearance", "amber", "Two parts of the track run very close (" + Math.round(w.dist) + " m)", { s: w.i * ds, s2: w.j * ds }); break; }
      }
      // Grade over a 20 m window; elevation range for the stats.
      let lo = Infinity, hi = -Infinity, gMax = 0, gAt = 0;
      const W = Math.max(1, Math.round(LIMITS.gradeWindowM / ds));
      for (let k = 0; k < n; k++) { if (py[k] < lo) lo = py[k]; if (py[k] > hi) hi = py[k]; const g = Math.abs(py[(k + W) % n] - py[k]) / (W * ds); if (g > gMax) { gMax = g; gAt = k; } }
      stats.elevM = Math.round(hi - lo); stats.gradeMax = +(gMax * 100).toFixed(1);
      if (gMax > LIMITS.gradeRed) add("grade", "red", "Slope of " + stats.gradeMax + " % — that is a wall, not a hill", { s: gAt * ds, k: gAt });
      else if (gMax > LIMITS.gradeAmber) add("grade", "amber", "Steep: " + stats.gradeMax + " % slope (F1 circuits top out near 10 %)", { s: gAt * ds, k: gAt });
      // The start straight: grid behind the line, pit entry road before it, exit road after.
      stats.startBackM = straightRun(tr, 0, -1, 600); stats.startFwdM = straightRun(tr, 0, +1, 600);
      if (stats.startBackM < LIMITS.startBackRed) add("start", "red", "Only " + stats.startBackM + " m of straight before the start line — the grid and pit entry need " + LIMITS.startBackAmber + " m", { s: 0, fix: "start" });
      else if (stats.startBackM < LIMITS.startBackAmber) add("start", "amber", stats.startBackM + " m of straight before the line — " + LIMITS.startBackAmber + " m fits the whole grid and pit entry", { s: 0, fix: "start" });
      if (stats.startFwdM < LIMITS.startFwdRed) add("start", "red", "Only " + stats.startFwdM + " m of straight after the start line — the pit exit needs " + LIMITS.startFwdRed + " m", { s: 0, fix: "start" });
      else if (stats.startFwdM < LIMITS.startFwdAmber) add("start", "amber", stats.startFwdM + " m of straight after the line — " + LIMITS.startFwdAmber + " m lets the pit exit merge cleanly", { s: 0, fix: "start" });
      try { if (typeof TrackPit !== "undefined" && TrackPit.window) { const w = TrackPit.window(tr, Tracks.curvature); stats.pitEntryM = Math.round(w.entryM); stats.pitExitM = Math.round(w.exitM); } } catch (_) { /* informational */ }
      turns = bakeTurns(tr);
      stats.turns = turns.length;
      stats.estLapS = +estLap(tr).toFixed(1);
    }
    return { issues, stats, turns };
  }

  return { LIMITS, previewDef, build, check, judge, straightRun, bakeTurns, estLap };
})();
Object.freeze(TrackValidate);
