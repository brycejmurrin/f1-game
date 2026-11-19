const TrackInsight = (function () {
  "use strict";
  const S = TrackShape;
  const THRESH = Object.freeze({
    straightK: 0.0035, straightM: 2000,
    t1M: 250, t1Deg: 45, t1R: 300,
    grade: 0.02,
    widthM: 12,
    bankDeg: 5.7,
    passV: 84.6, passRunM: 400, passDrop: 25, passWithinM: 200,
    bandK: 0.0035, bandFrac: 0.3, bandSteps: 100,
    spanPadM: 20,
    fitRunM: 30,
    crestG: 0.5, sagG: 2.5, vertWindowM: 40,
  });
  const DEG = 180 / Math.PI;
  const wrapS = (s, L) => ((s % L) + L) % L;

  function speedProfile(tr) { return TrackValidate.speedProfile(tr); }

  function bands(tr, turns) {
    if (!tr || !(tr.n > 2) || !tr.curv) return [];
    const n = tr.n, L = tr.total, ds = L / n, curv = tr.curv;
    const fr = Array.isArray(turns) ? turns : TrackValidate.bakeTurns(tr);
    const K = (k) => curv[((k % n) + n) % n];
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
  function fitSpan(pts, i0, i1, c) {
    const N = pts.length, r5 = (v) => Math.round(v / 5) * 5, a = pts[i0], h0 = S.heading(pts, i0);
    const u = (th) => [Math.sin(th), Math.cos(th)], cross = (p, q) => p[0] * q[1] - p[1] * q[0];
    const out = (kind, R, deg, j) => ({ i1: j, fit: { kind, R: kind === "hairpin" ? Math.min(25, Math.max(15, r5(R))) : Math.min(600, Math.max(15, r5(R))), deg: Math.min(270, Math.max(10, r5(deg))), dir: c.dir } });
    for (let j = i1, step = 0; step < 6; step++, j = (j + 1) % N) {
      if (j === i0 || (step > 0 && j === 1)) break;
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
      Object.assign(c, zoneTags(tr, pts, c));
    }
    return list;
  }

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

  function longestStraight(tr) {
    const n = tr.n, ds = tr.total / n;
    let best = 0, at = 0, run = 0;
    for (let i = 0; i < 2 * n; i++) {
      if (Math.abs(tr.curv[i % n]) <= THRESH.straightK && run < n) { run++; if (run > best) { best = run; at = i - run + 1; } } else run = 0;
    }
    return { lenM: best * ds, s0: (at % n) * ds };
  }

  function fia(tr, design, stats, extra) {
    const out = [];
    if (!tr || !(tr.n > 2) || !tr.curv) return out;
    extra = extra || {};
    const n = tr.n, L = tr.total, ds = L / n, T = THRESH;
    const add = (code, msg, s) => out.push({ code, level: "amber", msg, s: Number.isFinite(s) ? wrapS(s, L) : 0 });
    const km = (m) => (m / 1000).toFixed(2) + " km";
    const ls = longestStraight(tr);
    if (ls.lenM > T.straightM) add("fia-straight", "FIA: a " + km(ls.lenM) + " straight — Grade 1 circuits keep straights under 2 km", ls.s0 + ls.lenM / 2);
    const list = bands(tr, extra.turns);
    const t1 = list.find((c) => Math.abs(c.angDeg) >= T.t1Deg && c.R < T.t1R);
    if (t1) {
      const entry = t1.s0 <= t1.sApex ? t1.s0 : 0;
      if (entry < T.t1M) add("fia-t1", "FIA: Turn 1 begins " + Math.round(entry) + " m after the line — " + T.t1M + " m is preferred", t1.sApex);
    } else if (list.length) add("fia-t1", "FIA: no corner turns 45° or more — Turn 1 should", list[0].sApex);
    const back = stats && Number.isFinite(stats.startBackM) ? stats.startBackM : 0, fwd = stats && Number.isFinite(stats.startFwdM) ? stats.startFwdM : 0;
    if (tr.py && back + fwd >= 40) {
      const k0 = Math.round(wrapS(-back, L) / ds) % n, k1 = Math.round(fwd / ds) % n;
      const g = Math.abs(tr.py[k1] - tr.py[k0]) / (back + fwd);
      if (g > T.grade) add("fia-grade", "FIA: the start straight climbs " + (g * 100).toFixed(1) + " % — the grid should be under 2 %", 0);
    }
    if (tr.hw) {
      let sum = 0; for (let k = 0; k < n; k++) sum += tr.hw[k];
      const w = 2 * sum / n;
      if (w < T.widthM) add("fia-width", "FIA: the road is " + w.toFixed(1) + " m wide — Grade 1 asks for 12 m", 0);
    }
    const bp = tr.bankP;
    if (bp && bp.lift && tr.hw) {
      let bMax = 0, bAt = 0;
      for (let k = 0; k < n; k++) { const b = Math.atan2(Math.abs(bp.lift[k]), 2 * (tr.hw[k] || 7)) * DEG; if (b > bMax) { bMax = b; bAt = k; } }
      if (bMax > T.bankDeg) add("fia-bank", "FIA: " + bMax.toFixed(1) + "° of banking — Grade 1 allows 5.7°", bAt * ds);
    }
    const v = extra.v || speedProfile(tr);
    if (!passingZones(tr, v).length) {
      let vMax = 0, at = 0; for (let k = 0; k < n; k++) if (v[k] > vMax) { vMax = v[k]; at = k; }
      add("fia-passing", "No overtaking spot: no 400 m flat-out run into a heavy stop", at * ds);
    }
    for (const c of verticalG(tr, v)) {
      const at = km1(c.s), kmh = Math.round(v[c.k] * 3.6);
      add(c.code, c.code === "fia-crest" ? "Crest at " + at + ": the car goes light (" + c.g.toFixed(1) + " g) at " + kmh + " km/h"
        : "Dip at " + at + ": " + c.g.toFixed(1) + " g compression at " + kmh + " km/h", c.s);
    }
    return out;
  }
  const km1 = (m) => (m / 1000).toFixed(1) + " km";

  function verticalG(tr, v) {
    const out = [];
    if (!tr || !(tr.n > 2) || !tr.py) return out;
    v = v || speedProfile(tr);
    const n = tr.n, ds = tr.total / n, py = tr.py, T = THRESH, G = 9.81;
    const W = Math.max(1, Math.round(T.vertWindowM / ds)), den = (W * ds) * (W * ds);
    const a = new Float64Array(n);
    for (let k = 0; k < n; k++) a[k] = v[k] * v[k] * (py[(k + W) % n] - 2 * py[k] + py[(k - W + n) % n]) / den;
    for (const [code, sign, lim] of [["fia-crest", -1, T.crestG], ["fia-sag", 1, T.sagG]]) {
      const on = (k) => sign * a[k] > lim * G;
      let k0 = 0;
      while (k0 < n && on(k0)) k0++;
      if (k0 === n) k0 = 0;
      for (let d = 0; d < n; d++) {
        if (!on((k0 + d) % n)) continue;
        let best = (k0 + d) % n;
        for (; d < n && on((k0 + d) % n); d++) { const j = (k0 + d) % n; if (sign * a[j] > sign * a[best]) best = j; }
        out.push({ code, k: best, s: best * ds, g: sign * a[best] / G });
      }
    }
    return out;
  }

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

  function fromCircuit(def) {
    if (!def) return null;
    const tr = Tracks.buildCenterline(def, { line: false });
    if (!tr || !(tr.n > 8)) return null;
    const pack = (raw) => {
      const closed = raw.concat([raw[0]]);
      const thin = (eps) => S.rdp(closed, eps).slice(0, -1);
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
      let hw = 0; for (let k = 0; k < tr.n; k++) hw += tr.hw[k];
      const baseHW = Math.min(8, Math.max(5, Math.round(hw / tr.n * 2) / 2));
      return { pts: pts.map((p) => [q(p[0] - cx), q(p[1] - cz)]), lengthM: Math.round(tr.total), baseHW, centre: [cx, cz] };
    };
    const raw = [];
    for (let k = 0; k < tr.n; k++) raw.push([tr.px[k], tr.pz[k]]);
    let out = pack(raw);
    const P = def.path && def.path.pts;
    if (out && P && P.length >= 8 && typeof TrackValidate !== "undefined" && TrackValidate.build) {
      const built = TrackValidate.build({ pts: out.pts, baseHW: out.baseHW });
      const t = built && built.tr, lim = TrackValidate.LIMITS.foldFrac;
      let fold = false;
      if (t) {
        const n = t.n, pp = (i) => [t.px[(i + n) % n], t.pz[(i + n) % n]];
        for (let k = 0; k < n && !fold; k++) {
          if (S.menger(pp(k - 1), pp(k), pp(k + 1)) <= t.hw[k] * lim) fold = true;
        }
      }
      if (fold) {
        let best = 0, bd = Infinity;
        for (let i = 0; i < P.length; i++) {
          const d = Math.hypot(P[i][0] - tr.px[0], P[i][1] - tr.pz[0]);
          if (d < bd) { bd = d; best = i; }
        }
        const path = P.slice(best).concat(P.slice(0, best)).map((p) => [p[0], p[1]]);
        path[0] = [tr.px[0], tr.pz[0]];
        const alt = pack(path);
        if (alt && alt.pts.length >= 60 && alt.pts.length <= 120) out = alt;
      }
    }
    return out;
  }

  function zoneTags(tr, pts, c) {
    const def = tr.def || {}, L = tr.total, out = { bankDeg: 0, hwSpan: null };
    for (const z of Array.isArray(def.bankZones) ? def.bankZones : []) {
      if (!Number.isFinite(z.frac) || !(z.widthM > 0)) continue;
      const d = Math.abs(wrapS(z.frac * L, L) - c.sApex), gap = Math.min(d, L - d);
      if (gap < z.widthM / 2 && Math.abs(z.angleDeg) > Math.abs(out.bankDeg)) out.bankDeg = z.angleDeg;
    }
    const hz = Array.isArray(def.hwZones) ? def.hwZones : [];
    if (hz.length && Array.isArray(pts) && pts.length >= 3) {
      const k = Math.round(c.sApex / L * tr.n) % tr.n, p = S.project(pts, tr.px[k], tr.pz[k]), u = (p.i + p.f) / pts.length;
      for (const z of hz) {
        const inside = z.s1 < z.s0 ? (u >= z.s0 || u <= z.s1) : (u >= z.s0 && u <= z.s1);
        if (inside && Number.isFinite(z.hw) && (out.hwSpan == null || z.hw < out.hwSpan)) out.hwSpan = z.hw;
      }
    }
    return out;
  }

  const R_BINS = [15, 25, 40, 70, 120, 250];
  const V_EDGES = [40, 55, 70, 85];
  function entropy(h, bins) {
    let tot = 0; for (const w of h) tot += w;
    if (!(tot > 0)) return 0;
    let H = 0; for (const w of h) if (w > 0) { const p = w / tot; H -= p * Math.log(p); }
    return H / Math.log(bins);
  }
  function features(tr, v, verdict) {
    if (!tr || !(tr.n > 2) || !tr.curv) return { Hc: 0, Hv: 0, F: 0, C: 0, P: 0, A: 0 };
    v = v || speedProfile(tr);
    const n = tr.n, ds = tr.total / n, hc = new Array(R_BINS.length).fill(0), hv = new Array(V_EDGES.length + 1).fill(0);
    let fast = 0;
    for (let k = 0; k < n; k++) {
      const c = Math.abs(tr.curv[k]);
      if (c > THRESH.straightK) { const R = 1 / c; let b = 0; while (b < R_BINS.length - 1 && R >= R_BINS[b + 1]) b++; hc[b] += ds; }
      let b = 0; while (b < V_EDGES.length && v[k] >= V_EDGES[b]) b++;
      hv[b] += ds / Math.max(1, v[k]);
      if (v[k] >= 85) fast++;
    }
    const turns = verdict && Array.isArray(verdict.turns) ? verdict.turns : undefined;
    const amber = verdict ? (Number.isFinite(verdict.amber) ? verdict.amber : (verdict.issues || []).filter((i) => i.level === "amber").length) : 0;
    return { Hc: entropy(hc, hc.length), Hv: entropy(hv, hv.length), F: fast / n, C: bands(tr, turns).length / (tr.total / 1000), P: Math.min(4, passingZones(tr, v).length), A: amber };
  }
  function score(feats, style) {
    const w = typeof style === "string" ? (typeof TrackRandom !== "undefined" && TrackRandom.STYLES ? TrackRandom.STYLES[style] : null) : style;
    if (!w || !feats) return 0;
    let s = 0;
    for (const key of ["Hc", "Hv", "F", "P", "A"]) if (w[key]) s += w[key] * feats[key];
    if (w.C) s += w.C * Math.max(0, feats.C - (w.cFree || 0));
    return s;
  }
  function rate(verdict, style) {
    const feats = features(verdict && verdict.tr, null, verdict);
    return { score: score(feats, style), feats };
  }

  function memoryCards(tr, turns, limit = 3) {
    if (!tr || !(tr.n > 2) || !(tr.total > 0) || !Array.isArray(turns)) return [];
    return turns.slice(0, Math.max(0, limit)).map((frac, i) => {
      const k = Math.round(frac * tr.n) % tr.n, curvature = tr.curv[k];
      return { n: i + 1, sApex: frac * tr.total, dir: curvature < 0 ? -1 : curvature > 0 ? 1 : 0 };
    });
  }
  return { memoryCards, THRESH, speedProfile, bands, corners, passingZones, fia, totdSeed, dayKey, fromCircuit, verticalG, score, rate };
})();
Object.freeze(TrackInsight);
