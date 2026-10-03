/* Apex 26 — TrackInsight: what the track designer can say ABOUT a circuit
   rather than against it. Reads the ENGINE-built centreline TrackValidate
   already holds: the point-mass speed at every node (TrackValidate.speedProfile),
   the corners as bands of curvature around each baked apex (the band
   TrackMaps.measureApex measures: |k| ≥ max(0.0035, 0.3·kpeak)) with the
   control span each one covers, the passing zones (a long flat-out run into a
   heavy stop), and the FIA Grade 1 layout advice (Appendix O as Autosport and
   Motorsport.com summarise it: straights ≤ 2 km, the first corner ≥ 250 m from
   the line and ≥ 45° at R < 300 m, ≤ 2 % on the start straight, ≥ 12 m wide,
   banking ≤ 5.7°). Every FIA issue is AMBER, coded fia-*, with no fix tag —
   advice, never a gate, and FIX ALL leaves it alone. Plus TRACK OF THE DAY's
   seed and START FROM's shipped-circuit trace. Pure; LAZY_EDITOR, after
   validate.js; needs TrackShape at eval, Tracks / TrackValidate at call time. */
const TrackInsight = (function () {
  "use strict";
  const S = TrackShape;
  const THRESH = Object.freeze({
    straightK: 0.0035, straightM: 2000,               // a straight is |k| under TrackPit.PIT_K (R > 285 m); FIA: none over 2 km
    t1M: 250, t1Deg: 45, t1R: 300,                    // FIA: the line "preferably" 250 m from T1; T1 turns ≥ 45° at R < 300 m
    grade: 0.02,                                      // FIA: ≤ 2 % on the start / finish straight (net, over the straight)
    widthM: 12,                                       // FIA: ≥ 12 m of tarmac (mean over the lap)
    bankDeg: 5.7,                                     // FIA: banking ≤ 5.7° (Zandvoort T3 / T14 are waivers)
    passV: 84.6, passRunM: 400, passDrop: 25, passWithinM: 200,   // a passing zone: ≥ 400 m above 84.6 m/s, then ≥ 25 m/s off its top speed within 200 m
    bandK: 0.0035, bandFrac: 0.3, bandSteps: 100,     // TrackMaps.measureApex's corner band
    spanPadM: 20,                                     // a corner's control span reaches this far past its band
    fitRunM: 30,                                      // …and its fitted arc ends this far short of the rejoin point
  });
  const DEG = 180 / Math.PI;
  const wrapS = (s, L) => ((s % L) + L) % L;

  /** The point-mass speed (m/s) per node — TrackValidate's, so SPEED and the lap estimate agree. */
  function speedProfile(tr) { return TrackValidate.speedProfile(tr); }

  /** The baked apices (TrackValidate.bakeTurns, which prefers TrackMaps.detectCorners) as curvature bands:
   *  [{ n, sApex, s0, s1, R, angDeg (signed: + LEFT), dir (+1 LEFT, -1 RIGHT), lenM, cls }] in driving order. */
  function bands(tr, turns) {
    if (!tr || !(tr.n > 2) || !tr.curv) return [];
    const n = tr.n, L = tr.total, ds = L / n, curv = tr.curv;
    const fr = Array.isArray(turns) ? turns : TrackValidate.bakeTurns(tr);
    const K = (k) => curv[((k % n) + n) % n];
    // Each apex's band as node indices [ka, kb] (kb may run past n).
    const raw = [];
    for (const f of fr) {
      if (!Number.isFinite(f)) continue;
      const kp = Math.round(wrapS(f, 1) * n) % n, kPeak = Math.abs(curv[kp]);
      if (!(kPeak > 1e-6)) continue;
      const thr = Math.max(THRESH.bandK, THRESH.bandFrac * kPeak);
      let a = 0, b = 0;
      while (a < THRESH.bandSteps && Math.abs(K(kp - a - 1)) >= thr) a++;
      while (b < THRESH.bandSteps && Math.abs(K(kp + b + 1)) >= thr) b++;
      raw.push({ ka: kp - a, kb: kp + b, kp });
    }
    raw.sort((p, q) => p.kp - q.kp);
    // Two apices inside one band (a sampled arc can peak at both ends) are one corner.
    const merged = [];
    for (const r of raw) {
      const last = merged[merged.length - 1];
      if (last && r.ka <= last.kb) last.kb = Math.max(last.kb, r.kb); else merged.push(Object.assign({}, r));
    }
    if (merged.length > 1) {
      const first = merged[0], last = merged[merged.length - 1];
      if (first.ka + n <= last.kb) { last.kb = Math.max(last.kb, first.kb + n); merged.shift(); }
    }
    const out = merged.map((m) => {
      let sum = 0, kPeak = 0, kp = m.ka;
      for (let k = m.ka; k <= m.kb; k++) { const c = K(k); sum += c; if (Math.abs(c) > kPeak) { kPeak = Math.abs(c); kp = k; } }
      const angDeg = sum * ds * DEG, R = 1 / kPeak;
      const cls = typeof TrackMaps !== "undefined" && TrackMaps.classifyCorner ? TrackMaps.classifyCorner(R, Math.abs(angDeg)) : R >= 70 ? "FAST" : R < 40 ? "SLOW" : "MEDIUM";
      return { sApex: wrapS(kp * ds, L), s0: wrapS(m.ka * ds, L), s1: wrapS(m.kb * ds, L), R, angDeg, dir: angDeg < 0 ? -1 : 1, lenM: (m.kb - m.ka + 1) * ds, cls };
    });
    out.sort((p, q) => p.sApex - q.sApex);
    out.forEach((c, i) => { c.n = i + 1; });
    return out;
  }

  /** The control span (i0, i1) a band covers on the design's loop `pts`: the
   *  points nearest s0 − pad and s1 + pad, widened so i0 ≠ i1, and never with
   *  point 0 (the start line) strictly inside — a span over the line is cut
   *  at it, keeping the longer side. */
  function spanFor(tr, pts, c) {
    const N = pts.length, n = tr.n, L = tr.total;
    const node = (s) => Math.round(wrapS(s, L) / L * n) % n;
    const a = node(c.s0 - THRESH.spanPadM), b = node(c.s1 + THRESH.spanPadM);
    let i0 = S.project(pts, tr.px[a], tr.pz[a]).i;
    const pb = S.project(pts, tr.px[b], tr.pz[b]);
    let i1 = pb.f > 0 ? (pb.i + 1) % N : pb.i;
    if (i1 !== 0 && i1 < i0) { if (N - i0 >= i1) i1 = 0; else i0 = 0; }
    if (i0 === i1) i1 = (i0 + 1) % N;
    const f = fitSpan(pts, i0, i1, c);
    return { i0, i1: f.i1, fit: f.fit };
  }
  /** The CORNER that REPLACE lays over the span: the one arc that leaves
   *  control i0 on its heading and ends ON the exit line through a control j
   *  (its position and heading), at least fitRunM short of it — so the
   *  stamp's Dubins rejoin is a straight, never the 440 m loop a 3 m miss
   *  costs at its 70 m first radius. j walks downstream from i1 (never past
   *  point 0) until such an arc exists at 15–600 m; the span becomes (i0, j).
   *  Rounded to the steppers' 5s. An S (the heading change disagrees with the
   *  band's direction) or no arc at all: the band's own numbers stand. */
  function fitSpan(pts, i0, i1, c) {
    const N = pts.length, r5 = (v) => Math.round(v / 5) * 5, a = pts[i0], h0 = S.heading(pts, i0);
    const u = (th) => [Math.sin(th), Math.cos(th)], cross = (p, q) => p[0] * q[1] - p[1] * q[0];
    const out = (kind, R, deg, j) => ({ i1: j, fit: { kind, R: kind === "hairpin" ? Math.min(25, Math.max(15, r5(R))) : Math.min(600, Math.max(15, r5(R))), deg: Math.min(270, Math.max(10, r5(deg))), dir: c.dir } });
    for (let j = i1, step = 0; step < 6; step++, j = (j + 1) % N) {
      if (j === i0 || (step > 0 && j === 1)) break;           // never past the start line
      const A = S.wrapAngle(S.heading(pts, j) - h0);
      if ((A < 0 ? -1 : 1) !== c.dir || Math.abs(A) < 10 / DEG) continue;
      const u1 = u(h0 + A), w = u(h0 + A / 2).map((v) => v * 2 * Math.sin(Math.abs(A) / 2)), B = pts[j];
      const den = cross(u1, w);
      if (Math.abs(den) < 1e-9) continue;
      const R = cross(u1, [B[0] - a[0], B[1] - a[1]]) / den;
      if (!(R >= 15 && R <= 600)) continue;
      const D = u1[0] * (B[0] - a[0] - R * w[0]) + u1[1] * (B[1] - a[1] - R * w[1]);
      if (D < THRESH.fitRunM) continue;
      const deg = Math.abs(A) * DEG;
      return out(R < 25 && deg >= 150 ? "hairpin" : "corner", R, deg, j);
    }
    const deg = Math.abs(c.angDeg);
    return out(c.R < 25 && deg >= 150 ? "hairpin" : "corner", c.R, deg, i1);
  }

  /** The TURNS table: bands + the slowest speed through each (vApex, m/s) and,
   *  given the design's control loop, its span { i0, i1 }. */
  function corners(tr, pts, v, turns) {
    const list = bands(tr, turns);
    if (!list.length) return list;
    const n = tr.n;
    v = v || speedProfile(tr);
    const canSpan = Array.isArray(pts) && pts.length >= 8;
    for (const c of list) {
      const k0 = Math.round(c.s0 / tr.total * n) % n, m = Math.max(1, Math.round(c.lenM / (tr.total / n)));
      let lo = Infinity;
      for (let d = 0; d < m; d++) lo = Math.min(lo, v[(k0 + d) % n]);
      c.vApex = lo;
      if (canSpan) Object.assign(c, spanFor(tr, pts, c));
    }
    return list;
  }

  /** Passing zones: a run ≥ passRunM above passV, then ≥ passDrop shed within
   *  passWithinM after it. Scans 0..2n so a run over the line is seen whole;
   *  one zone per braking node. [{ s0, s1, lenM, drop }] by s1. */
  function passingZones(tr, v) {
    if (!tr || !(tr.n > 2)) return [];
    v = v || speedProfile(tr);
    const n = tr.n, ds = tr.total / n, T = THRESH;
    const need = Math.ceil(T.passRunM / ds), within = Math.max(1, Math.round(T.passWithinM / ds));
    const seen = new Map();
    let run = 0, top = 0;
    for (let i = 0; i < 2 * n; i++) {
      const vi = v[i % n];
      if (vi >= T.passV && run < n) { run++; if (vi > top) top = vi; continue; }
      if (run >= need) {
        // The stop is measured from the run's top speed: where v crosses passV
        // the car is already braking, and that crossing jitters with the nodes.
        let lo = top;
        for (let d = 0; d < within; d++) lo = Math.min(lo, v[(i + d) % n]);
        if (top - lo >= T.passDrop) {
          const end = (i - 1) % n, z = { s0: (((i - run) % n) + n) % n * ds, s1: end * ds, lenM: run * ds, drop: top - lo };
          if (!seen.has(end) || seen.get(end).lenM < z.lenM) seen.set(end, z);
        }
      }
      run = 0; top = 0;
    }
    return [...seen.values()].sort((p, q) => p.s1 - q.s1);
  }

  /** The longest run of road under straightK (wrapping): { lenM, s0 }. */
  function longestStraight(tr) {
    const n = tr.n, ds = tr.total / n;
    let best = 0, at = 0, run = 0;
    for (let i = 0; i < 2 * n; i++) {
      if (Math.abs(tr.curv[i % n]) <= THRESH.straightK && run < n) { run++; if (run > best) { best = run; at = i - run + 1; } } else run = 0;
    }
    return { lenM: best * ds, s0: (at % n) * ds };
  }

  /** The FIA Grade 1 layout advice over a built centreline: AMBER issues
   *  coded fia-straight | fia-t1 | fia-grade | fia-width | fia-bank |
   *  fia-passing, each with a finite `s`, a one-line msg and no fix. `stats`
   *  is judge()'s (startBackM / startFwdM); extra { v, turns } saves a recompute. */
  function fia(tr, design, stats, extra) {
    const out = [];
    if (!tr || !(tr.n > 2) || !tr.curv) return out;
    extra = extra || {};
    const n = tr.n, L = tr.total, ds = L / n, T = THRESH;
    const add = (code, msg, s) => out.push({ code, level: "amber", msg, s: Number.isFinite(s) ? wrapS(s, L) : 0 });
    const km = (m) => (m / 1000).toFixed(2) + " km";
    // 1. No straight over 2 km.
    const ls = longestStraight(tr);
    if (ls.lenM > T.straightM) add("fia-straight", "FIA: a " + km(ls.lenM) + " straight — Grade 1 circuits keep straights under 2 km", ls.s0 + ls.lenM / 2);
    // 2. Turn 1 — the first corner that turns ≥ 45° at R < 300 m (the FIA's
    // own test of a first turn; a flat-out kink before it, Magny-Cours' Grande
    // Courbe, does not sort the field) — begins 250 m or more after the line.
    // None at all: the advice is the sweep itself.
    const list = bands(tr, extra.turns);
    const t1 = list.find((c) => Math.abs(c.angDeg) >= T.t1Deg && c.R < T.t1R);
    if (t1) {
      const entry = t1.s0 <= t1.sApex ? t1.s0 : 0;   // a band over the line starts at it
      if (entry < T.t1M) add("fia-t1", "FIA: Turn 1 begins " + Math.round(entry) + " m after the line — " + T.t1M + " m is preferred", t1.sApex);
    } else if (list.length) add("fia-t1", "FIA: no corner turns 45° or more — Turn 1 should", list[0].sApex);
    // 3. The start straight's net grade.
    const back = stats && Number.isFinite(stats.startBackM) ? stats.startBackM : 0, fwd = stats && Number.isFinite(stats.startFwdM) ? stats.startFwdM : 0;
    if (tr.py && back + fwd >= 40) {
      const k0 = Math.round(wrapS(-back, L) / ds) % n, k1 = Math.round(fwd / ds) % n;
      const g = Math.abs(tr.py[k1] - tr.py[k0]) / (back + fwd);
      if (g > T.grade) add("fia-grade", "FIA: the start straight climbs " + (g * 100).toFixed(1) + " % — the grid should be under 2 %", 0);
    }
    // 4. Width: the mean road width over the lap.
    if (tr.hw) {
      let sum = 0; for (let k = 0; k < n; k++) sum += tr.hw[k];
      const w = 2 * sum / n;
      if (w < T.widthM) add("fia-width", "FIA: the road is " + w.toFixed(1) + " m wide — Grade 1 asks for 12 m", 0);
    }
    // 5. Banking: the built cross-slope (mesh.js bankingProfile → roll).
    const bp = tr.bankP;
    if (bp && bp.lift && tr.hw) {
      let bMax = 0, bAt = 0;
      for (let k = 0; k < n; k++) { const b = Math.atan2(Math.abs(bp.lift[k]), 2 * (tr.hw[k] || 7)) * DEG; if (b > bMax) { bMax = b; bAt = k; } }
      if (bMax > T.bankDeg) add("fia-bank", "FIA: " + bMax.toFixed(1) + "° of banking — Grade 1 allows 5.7°", bAt * ds);
    }
    // 6. Somewhere to pass.
    const v = extra.v || speedProfile(tr);
    if (!passingZones(tr, v).length) {
      let vMax = 0, at = 0; for (let k = 0; k < n; k++) if (v[k] > vMax) { vMax = v[k]; at = k; }
      add("fia-passing", "No overtaking spot: no 400 m flat-out run into a heavy stop", at * ds);
    }
    return out;
  }

  /** TRACK OF THE DAY: one seed per UTC day. `day`: a Date, a yyyy-mm-dd string, or now. */
  function dayKey(day) {
    if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
    const d = day && typeof day.getTime === "function" && Number.isFinite(day.getTime()) ? day : new Date();
    return d.toISOString().slice(0, 10);
  }
  function fnv1a(str) {
    if (typeof Hash32 !== "undefined" && Hash32.fnv1a) return Hash32.fnv1a(str);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function totdSeed(day) { return fnv1a("apex26-totd|" + dayKey(day)) >>> 0; }

  /** START FROM: a shipped circuit's built centreline as a design loop — RDP
   *  with ε binary-searched until 60–120 points, 8 m spacing, centred on the
   *  map, on the 0.25 m lattice, point 0 the start line. { pts, lengthM, baseHW, centre } or null. */
  function fromCircuit(def) {
    if (!def) return null;
    const tr = Tracks.buildCenterline(def, { line: false });
    if (!tr || !(tr.n > 8)) return null;
    const raw = [];
    for (let k = 0; k < tr.n; k++) raw.push([tr.px[k], tr.pz[k]]);
    const closed = raw.concat([raw[0]]);
    const thin = (eps) => S.rdp(closed, eps).slice(0, -1);
    // The SMALLEST ε that fits 120 points: the most faithful trace the cap
    // allows (fewer points cut more corner, and the engine's two Laplacian
    // passes shrink a cut corner further).
    let lo = 0.5, hi = 25, pts = thin(lo);
    if (pts.length > 120) {
      pts = thin(hi);
      for (let it = 0; it < 20; it++) {
        const mid = (lo + hi) / 2, p = thin(mid);
        if (p.length > 120) lo = mid; else { hi = mid; pts = p; }
      }
    }
    pts = S.enforceSpacing(pts, 8);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, q = (v) => Math.round(v * 4) / 4;
    // The circuit's own mean half-width, inside the designer's 5–8 m (Monaco's 4.9 m reads 5).
    let hw = 0; for (let k = 0; k < tr.n; k++) hw += tr.hw[k];
    const baseHW = Math.min(8, Math.max(5, Math.round(hw / tr.n * 2) / 2));
    return { pts: pts.map((p) => [q(p[0] - cx), q(p[1] - cz)]), lengthM: Math.round(tr.total), baseHW, centre: [cx, cz] };
  }

  return { THRESH, speedProfile, bands, corners, passingZones, longestStraight, fia, totdSeed, dayKey, fromCircuit };
})();
Object.freeze(TrackInsight);
