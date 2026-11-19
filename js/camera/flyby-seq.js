"use strict";
const FlybySeq = (function () {

  const POLE_BACK = 14, GRID_SPACING = 8, GRID_ROWS = 20;
  const PLAYER_SLOT_DEFAULT = 11;
  let _playerSlot = PLAYER_SLOT_DEFAULT;
  let _slotKnown = true;
  let _gridSize = 22;
  function setPlayerSlot(k, n) {
    _slotKnown = k !== null; _playerSlot = (k >= 0 && k === (k | 0)) ? k : PLAYER_SLOT_DEFAULT;
    _gridSize = n > 0 ? n | 0 : 22;
  }
  function slotKnown() { return _slotKnown; }
  const slotPoses = (shot) => [shot.eye[0], shot.eye[1], shot.look[0], shot.look[1]].filter((p) => p && p.at === "slot");
  const usesSlot = (shot) => slotPoses(shot).length > 0;
  const usesGrid = (shot) => [shot.eye[0], shot.eye[1], shot.look[0], shot.look[1]].some((p) => p && p.at === "grid");
  const fitsGrid = (shot) => slotPoses(shot).every((p) => (p.n === "player" || p.n === undefined) ? _slotKnown : (p.n | 0) < _gridSize);
  function slotIndex(pose) { return pose.n === "player" || pose.n === undefined ? _playerSlot : Math.max(0, pose.n | 0); }
  const _gs = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function slotX(track, k, s) {
    Tracks.sample(track, s, _gs);
    return (k % 2 === 0 ? -1 : 1) * Math.min((_gs.hw || 7) * 0.4, 3);
  }

  const FAR = 6000;
  const FOG = 0.15;
  const NEAR = 0.9;

  function isSolid(r) { return FlybyClear.isSolid(r); }
  function blockers(track) { return FlybyClear.blockers(track); }
  function boxGrid(list) { return FlybyClear.boxGrid(list); }
  function nearBoxes(cells, x, z, m) { return FlybyClear.nearBoxes(cells, x, z, m); }
  function insideProp(track, p, margin) { return FlybyClear.insideProp(track, p, margin); }
  function onRoadPose(pose) { return FlybyClear.onRoadPose(pose); }
  function clearEye(track, eye, margin) { return FlybyClear.clearEye(track, eye, margin); }
  function groundAt(track, x, z, y) { return FlybyClear.groundAt(track, x, z, y); }
  function floorEye(track, eye) { return FlybyClear.floorEye(track, eye); }

  const TERRAIN = ["mountain", "ridge", "hill", "tree", "pine", "stonePine",
                   "cypress", "palm", "acacia", "broadleafFall", "bush"];
  const LM_WEIGHT = { tower: 3, building: 1.6, grandstand: 1.3, motorhome: 1, structure: 0.9 };
  const LM_MIN_H = 8;
  const LM_APART = 300;
  const LM_KEEP = 6;
  const LM_SPAN = 0.45;
  const LM_MIN_SIZE = 40;
  const LM_NEAR = 220;
  const LM_EDGE = 5;

  function landmarkScore(r) {
    const w = LM_WEIGHT[r.kind];
    if (!w || !(r.h >= LM_MIN_H)) return 0;
    if (r.kind === "structure" && ((r.fill || 0) < 0.35 || r.h < 12)) return 0;
    const vol = Math.max(1, r.w * r.h * r.d);
    return w * Math.cbrt(vol) * (1 + r.h / 60);
  }

  function landmarks(track) {
    if (track._fbLandmarks) return track._fbLandmarks;
    const list = (track.props && track.props.list) || [];
    const scored = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (TERRAIN.indexOf(r.kind) !== -1 || !LM_WEIGHT[r.kind]) continue;
      const hv = lmH(track, r);
      const sc = landmarkScore(hv === r.h ? r : Object.assign({}, r, { h: hv }));
      if (!(sc > 0)) continue;
      const pr = Tracks.project(track, r.x, r.z);
      if (pr) {
        Tracks.sample(track, pr.s, _smp);
        if (Math.abs(pr.lat) - (_smp.hw || 10) < LM_EDGE) continue;
      }
      scored.push({ r: r, score: sc });
    }
    const b = bounds(track);
    for (let i = 0; i < scored.length; i++) {
      const r = scored[i].r;
      let best = Infinity;
      for (let j = 0; j < b.pts.length; j++) {
        const d = Math.hypot(r.x - b.pts[j][0], r.z - b.pts[j][2]);
        if (d < best) best = d;
      }
      scored[i].near = best;
      scored[i].score *= best <= LM_NEAR ? (1 + (LM_NEAR - best) / LM_NEAR) : 0;
    }
    scored.sort((a, b2) => b2.score - a.score);
    const keep = [];
    for (let i = 0; i < scored.length && keep.length < LM_KEEP; i++) {
      if (!(scored[i].score > 0)) break;
      const c = scored[i].r;
      let near = false;
      for (let j = 0; j < keep.length; j++) {
        if (Math.hypot(c.x - keep[j].x, c.z - keep[j].z) < LM_APART) { near = true; break; }
      }
      if (!near) keep.push(c);
    }
    track._fbLandmarks = keep;
    return keep;
  }

  function lmBase(track, r) {
    const cache = track._fbLmBase || (track._fbLmBase = new Map());
    if (cache.has(r)) return cache.get(r);
    const bottom = r.y - r.h / 2, top = r.y + r.h / 2;
    const g = groundAt(track, r.x, r.z, top);
    const base = (isFinite(g) && g > bottom) ? Math.min(g, top) : bottom;
    cache.set(r, base);
    return base;
  }
  function lmH(track, r) { return r.y + r.h / 2 - lmBase(track, r); }
  function lmMid(track, r) { return lmBase(track, r) + lmH(track, r) / 2; }

  function bounds(track) {
    if (track._fbBounds) return track._fbBounds;
    const N = 96;
    let cx = 0, cz = 0, cy = 0;
    const pts = [];
    for (let i = 0; i < N; i++) {
      Tracks.sample(track, (i / N) * track.total, _smp);
      pts.push([_smp.p[0], _smp.p[1], _smp.p[2]]);
      cx += _smp.p[0]; cy += _smp.p[1]; cz += _smp.p[2];
    }
    cx /= N; cy /= N; cz /= N;
    let rad = 1;
    for (let i = 0; i < N; i++) rad = Math.max(rad, Math.hypot(pts[i][0] - cx, pts[i][2] - cz));
    const face = Math.atan2(pts[0][2] - cz, pts[0][0] - cx);
    track._fbBounds = { x: cx, y: cy, z: cz, rad: rad, pts: pts, face: face };
    return track._fbBounds;
  }

  function wrapS(track, s) {
    const total = track.total || 1;
    return ((s % total) + total) % total;
  }

  function cornerS(track, n) {
    if (!track._fbCorners) {
      let cs = [];
      try {
        if (typeof TrackMaps !== "undefined" && track.def) cs = TrackMaps.corners(track.def) || [];
      } catch (_) { cs = []; }
      track._fbCorners = cs;
    }
    const cs = track._fbCorners;
    if (!cs.length) return 0;
    const c = cs[Math.min(cornerIndex(track, cs, n), cs.length - 1)];
    return (c && typeof c.f === "number") ? c.f * track.total : 0;
  }
  function cornerIndex(track, cs, n) {
    let i;
    if (n === "first") i = roleCorner(track, cs, 0);
    else if (n === "mid") i = roleCorner(track, cs, Math.floor(cs.length * 0.45));
    else if (n === "late") i = roleCorner(track, cs, Math.floor(cs.length * 0.78));
    else if (n === "slowest" || n === "fastest") i = extremeCorner(track, cs, n === "slowest");
    else if (n === "lore") { const L = loreCorner(track, cs), slow = extremeCorner(track, cs, true); i = L >= 0 && track._fbFilmable[L] ? L : slow; }
    else i = Math.min(Math.max(1, n | 0), cs.length) - 1;
    return i;
  }

  function roleRank(track, cs, n, home) {
    const ok = track._fbFilmable || (track._fbFilmable = cs.map((c) => filmable(track, c)));
    const idx = [];
    for (let k = 0; k < cs.length; k++) if (ok[k] && k !== home) idx.push(k);
    if (n === "slowest" || n === "fastest" || n === "lore") {
      const sg = n === "fastest" ? -1 : 1, r = (k) => (cs[k].r > 0 ? sg * cs[k].r : Infinity);
      return idx.sort((a, b) => r(a) - r(b));
    }
    return idx.sort((a, b) => Math.abs(a - home) - Math.abs(b - home) || b - a);
  }
  function shotCorner(shot) {
    const poses = [shot.eye[0], shot.eye[1], shot.look[0], shot.look[1]];
    for (let i = 0; i < 4; i++) if (poses[i] && poses[i].at === "corner") return poses[i].n === undefined ? 1 : poses[i].n;
    return null;
  }
  const SAME_M = 120;
  function bindCorners(track, list) {
    const cache = track._fbBind || (track._fbBind = new WeakMap());
    let out = cache.get(list);
    if (out) return out;
    cornerS(track, 1);
    const cs = track._fbCorners, used = [], total = track.total || 1;
    const taken = (k) => used.some((j) => { const d = Math.abs(cs[j].f - cs[k].f) * total; return Math.min(d, total - d) < SAME_M; });
    const numbered = (n) => typeof n !== "string";
    for (let i = 0; i < list.length; i++) {
      const role = shotCorner(list[i]);
      if (role !== null && cs.length && numbered(role)) used.push(Math.min(cornerIndex(track, cs, role), cs.length - 1));
    }
    out = list.map((shot) => {
      const role = shotCorner(shot);
      if (role === null || !cs.length || numbered(role)) return shot;
      let k = Math.min(cornerIndex(track, cs, role), cs.length - 1);
      if (taken(k)) {
        const alt = roleRank(track, cs, role, k).filter((j) => !taken(j));
        if (alt.length) k = alt[0];
      }
      used.push(k);
      const memo = track._fbBoundShot || (track._fbBoundShot = new WeakMap());
      const byK = memo.get(shot) || (memo.set(shot, {}), memo.get(shot));
      if (byK[k]) return byK[k];
      const bind = (p) => (p && p.at === "corner" && (p.n === undefined ? 1 : p.n) === role ? Object.assign({}, p, { n: k + 1 }) : p);
      return (byK[k] = Object.assign({}, shot, { eye: shot.eye.map(bind), look: shot.look.map(bind) }));
    });
    cache.set(list, out);
    return out;
  }

  const TURN_WIN = 40, TURN_MIN = 35 * Math.PI / 180, TURN_CHICANE = 45 * Math.PI / 180;
  const _tA = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function cornerTurn(track, s) {
    let net = 0, swept = 0, prev = null;
    for (let d = -TURN_WIN; d <= TURN_WIN; d += 4) {
      Tracks.sample(track, wrapS(track, s + d), _tA);
      const a = Math.atan2(_tA.t[2], _tA.t[0]);
      if (prev !== null) {
        const x = Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
        net += x; swept += Math.abs(x);
      }
      prev = a;
    }
    return { net: Math.abs(net), swept: swept };
  }
  function filmable(track, c) {
    if (!c || typeof c.f !== "number") return false;
    const t = cornerTurn(track, c.f * track.total);
    return t.net >= TURN_MIN && (t.swept <= 1.5 * t.net || t.net >= TURN_CHICANE);
  }
  function extremeCorner(track, cs, slow) {
    const ok = track._fbFilmable || (track._fbFilmable = cs.map((c) => filmable(track, c)));
    let best = -1;
    for (let k = 0; k < cs.length; k++) {
      if (!ok[k] || !(cs[k].r > 0)) continue;
      if (best < 0 || (slow ? cs[k].r < cs[best].r : cs[k].r > cs[best].r)) best = k;
    }
    return best >= 0 ? best : 0;
  }
  const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  function loreCorner(track, cs) {
    let line = "";
    try {
      const L = typeof CircuitLore !== "undefined" && track.def ? CircuitLore.forId(track.def.id) : null;
      line = (L && L.corner) || "";
    } catch (_) { line = ""; }
    const m = /\bturns? (\d+|[a-z]+)\b/i.exec(line);
    if (!m) return -1;
    const n = /^\d+$/.test(m[1]) ? +m[1] : NUM_WORDS.indexOf(m[1].toLowerCase());
    return n >= 1 && n <= cs.length ? n - 1 : -1;
  }
  function roleCorner(track, cs, i) {
    const ok = track._fbFilmable || (track._fbFilmable = cs.map((c) => filmable(track, c)));
    for (let d = 0; d < cs.length; d++) {
      if (i + d < cs.length && ok[i + d]) return i + d;
      if (d && i - d >= 0 && ok[i - d]) return i - d;
    }
    return i;
  }

  function anchorS(track, pose) {
    const total = track.total || 1;
    const off = pose.off || 0;
    switch (pose.at) {
      case "pole": return wrapS(track, total - POLE_BACK + off);
      case "grid": return wrapS(track, total - POLE_BACK - (Math.min(GRID_ROWS, _gridSize) - 1) * GRID_SPACING + off);
      case "corner": return wrapS(track, cornerS(track, pose.n || 1) + off);
      case "slot": return wrapS(track, total - POLE_BACK - slotIndex(pose) * GRID_SPACING + off);
      case "pitexit": return wrapS(track, (track.pit && isFinite(track.pit.sOut) ? track.pit.sOut : 0) + off);
      default: return wrapS(track, off);
    }
  }

  const _smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };

  function lmFace(track, r) {
    const cache = track._fbLmFace || (track._fbLmFace = new Map());
    if (cache.has(r)) return cache.get(r);
    const pts = bounds(track).pts;
    let best = Infinity, bx = r.x, bz = r.z;
    for (let j = 0; j < pts.length; j++) {
      const d = Math.hypot(r.x - pts[j][0], r.z - pts[j][2]);
      if (d < best) { best = d; bx = pts[j][0]; bz = pts[j][2]; }
    }
    const a = Math.atan2(bz - r.z, bx - r.x);
    cache.set(r, a);
    return a;
  }

  const LM_REACH = 40, LM_REACH_MIN = 60;
  function lmNear(track, r) {
    const cache = track._fbLmNear || (track._fbLmNear = new Map());
    if (cache.has(r)) return cache.get(r);
    const pr = Tracks.project(track, r.x, r.z);
    const d = pr ? Math.abs(pr.lat) : 0;
    cache.set(r, d);
    return d;
  }
  function lmDist(track, r, d) {
    const cap = Math.max(LM_REACH_MIN, lmNear(track, r) + LM_REACH);
    return d <= cap ? d : cap + (d - cap) * 0.25;
  }

  const _cA = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  const _cB = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function cornerSide(track, n) {
    const cache = track._fbCornerSide || (track._fbCornerSide = {});
    const key = String(n === undefined ? 1 : n);
    if (cache[key] !== undefined) return cache[key];
    const s = cornerS(track, n === undefined ? 1 : n);
    let turnRight = 0;
    Tracks.sample(track, wrapS(track, s - 24), _cA);
    for (let i = -5; i <= 6; i++) {
      Tracks.sample(track, wrapS(track, s + i * 4), _cB);
      turnRight += _cB.t[0] * _cA.r[0] + _cB.t[2] * _cA.r[2];
      for (let j = 0; j < 3; j++) { _cA.t[j] = _cB.t[j]; _cA.r[j] = _cB.r[j]; }
    }
    cache[key] = turnRight > 0 ? -1 : 1;
    return cache[key];
  }

  const FENCE = 1.5;

  function poseX(track, pose, s) {
    let x = pose.x || 0;
    if (pose.at === "corner" && x) x *= cornerSide(track, pose.n);
    if (pose.at === "slot") { const k = slotIndex(pose); x += slotX(track, k, wrapS(track, (track.total || 1) - POLE_BACK - k * GRID_SPACING)); }
    if (x && track.def && track.def.street && Tracks.wallAt) {
      const w = Tracks.wallAt(track, s, x > 0 ? 1 : -1);
      if (w > 0 && Math.abs(x) > w + FENCE) x = (x > 0 ? 1 : -1) * (w + FENCE);
    }
    return x;
  }

  function posePoint(track, pose, out) {
    if (pose.at === "centre") {
      const b = bounds(track);
      const dR = pose.distR === undefined ? 1.4 : pose.distR;
      const yR = pose.yR === undefined ? 0.5 : pose.yR;
      const d = dR > 0 ? Math.max(C_DMIN, Math.min(C_DMAX, dR * b.rad)) : 0;
      const h = yR > 0 ? Math.max(C_HMIN, Math.min(C_HMAX, yR * b.rad)) : yR * b.rad;
      const a = b.face + (pose.bear || 0);
      out[0] = b.x + Math.cos(a) * d;
      out[1] = b.y + h + (pose.y || 0);
      out[2] = b.z + Math.sin(a) * d;
      return out;
    }
    if (pose.at === "landmark") {
      const lm = landmarks(track);
      if (!lm.length) {
        const eye = (pose.distK || 0) > 0;
        return posePoint(track, { at: "centre", bear: pose.bear || 0, distR: eye ? 0.8 : 0, yR: eye ? 0.25 : 0 }, out);
      }
      const r = lm[Math.min(pose.rank || 0, lm.length - 1)];
      const size = lmSize(track, r);
      const d = lmDist(track, r, (pose.distK === undefined ? 0 : pose.distK) * size);
      const a = lmFace(track, r) + (pose.bear || 0);
      out[0] = r.x + Math.cos(a) * d;
      out[1] = lmMid(track, r) + (pose.yK === undefined ? 0 : pose.yK) * lmH(track, r) + (pose.y || 0);
      out[2] = r.z + Math.sin(a) * d;
      return out;
    }
    const s = anchorS(track, pose);
    Tracks.sample(track, s, _smp);
    const x = poseX(track, pose, s);
    out[0] = _smp.p[0] + _smp.r[0] * x;
    out[1] = _smp.p[1] + (pose.y || 0);
    out[2] = _smp.p[2] + _smp.r[2] * x;
    return out;
  }


  const _inv = [0, 0, 0];
  const r2 = (n) => Math.round(n * 100) / 100;
  const r5 = (n) => Math.round(n * 1e5) / 1e5;
  function wrapAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  function nearestCorner(track, s) {
    cornerS(track, 1);
    const cs = track._fbCorners || [], total = track.total || 1;
    let best = null;
    for (let i = 0; i < cs.length; i++) {
      if (!cs[i] || typeof cs[i].f !== "number") continue;
      let off = s - cs[i].f * total;
      off -= Math.round(off / total) * total;
      if (!best || Math.abs(off) < Math.abs(best.off)) best = { n: i + 1, off };
    }
    return best;
  }

  function trackPose(track, p, opts) {
    const pr = Tracks.project(track, p[0], p[2]);
    let s = pr.s, x = pr.lat;
    for (let it = 0; it < 4; it++) {
      Tracks.sample(track, s, _smp);
      const ex = p[0] - _smp.p[0] - _smp.r[0] * x, ez = p[2] - _smp.p[2] - _smp.r[2] * x;
      const tl = Math.hypot(_smp.t[0], _smp.t[2]) || 1, rl = Math.hypot(_smp.r[0], _smp.r[2]) || 1;
      s += (ex * _smp.t[0] + ez * _smp.t[2]) / tl;
      x += (ex * _smp.r[0] + ez * _smp.r[2]) / rl / rl;
    }
    s = wrapS(track, s); pr.s = s; pr.lat = x;
    Tracks.sample(track, s, _smp);
    const y = r2(p[1] - _smp.p[1]);
    const win = opts.cornerWindow == null ? 150 : opts.cornerWindow;
    const c = opts.at === "start" ? null : nearestCorner(track, pr.s);
    if (c && (opts.at === "corner" || Math.abs(c.off) <= win)) {
      return { at: "corner", n: c.n, off: r2(c.off), x: r2(pr.lat * cornerSide(track, c.n)), y };
    }
    const total = track.total || 1;
    return { at: "start", off: r2(pr.s > total / 2 ? pr.s - total : pr.s), x: r2(pr.lat), y };
  }

  const C_DMIN = 200, C_DMAX = 850, C_HMIN = 55, C_HMAX = 190;
  function centrePose(track, p) {
    const b = bounds(track);
    const d = Math.hypot(p[0] - b.x, p[2] - b.z);
    if (d < C_DMIN || d > C_DMAX) return null;
    const dy = p[1] - b.y, h = Math.max(C_HMIN, Math.min(C_HMAX, dy));
    const pose = { at: "centre", bear: r5(wrapAng(Math.atan2(p[2] - b.z, p[0] - b.x) - b.face)),
      distR: r5(d / b.rad), yR: r5(h / b.rad) };
    if (Math.abs(dy - h) > 0.005) pose.y = r2(dy - h);
    return pose;
  }

  function lmSize(track, r) { return Math.max(LM_MIN_SIZE, lmH(track, r), LM_SPAN * Math.max(r.w, r.d)); }

  function nearestLandmark(track, p) {
    const lm = landmarks(track);
    let best = null;
    for (let i = 0; i < lm.length; i++) {
      const d = Math.hypot(p[0] - lm[i].x, p[2] - lm[i].z);
      if (!best || d < best.d) best = { rank: i, r: lm[i], d };
    }
    return best;
  }
  function landmarkPose(track, p, rank) {
    const lm = landmarks(track);
    if (!lm.length) return null;
    const i = Math.max(0, Math.min(rank | 0, lm.length - 1)), r = lm[i];
    const d = Math.hypot(p[0] - r.x, p[2] - r.z);
    const bear = d > 1e-6 ? wrapAng(Math.atan2(p[2] - r.z, p[0] - r.x) - lmFace(track, r)) : 0;
    const cap = Math.max(LM_REACH_MIN, lmNear(track, r) + LM_REACH);
    const da = d <= cap ? d : cap + (d - cap) * 4;
    return { at: "landmark", rank: i, bear: r5(bear), distK: r5(da / lmSize(track, r)), yK: 0, y: r2(p[1] - lmMid(track, r)) };
  }

  function poseFromWorld(track, p, opts) {
    opts = opts || {};
    const at = opts.at || "auto";
    let pose = null;
    if (at === "centre") pose = centrePose(track, p);
    else if (at === "landmark") {
      const nl = opts.rank == null ? nearestLandmark(track, p) : null;
      pose = landmarkPose(track, p, opts.rank != null ? opts.rank : (nl ? nl.rank : 0));
    } else if (at === "auto") {
      const pr = Tracks.project(track, p[0], p[2]);
      const trackMax = opts.trackMax == null ? 80 : opts.trackMax;
      if (pr.dist > trackMax) {
        const nl = nearestLandmark(track, p);
        if (nl && nl.d <= 3 * lmSize(track, nl.r)) pose = landmarkPose(track, p, nl.rank);
        else pose = centrePose(track, p);
      }
    }
    if (!pose) pose = trackPose(track, p, { at, cornerWindow: opts.cornerWindow });
    posePoint(track, pose, _inv);
    const err = Math.hypot(_inv[0] - p[0], _inv[1] - p[1], _inv[2] - p[2]);
    return { pose, err: Math.round(err * 1000) / 1000 };
  }

  function shotFromView(track, eye, target, fov, opts) {
    opts = opts || {};
    const e = poseFromWorld(track, eye, opts);
    let lookOpts = { at: "track" };
    if (e.pose.at === "landmark") {
      const nl = nearestLandmark(track, target);
      if (nl && nl.rank === e.pose.rank && nl.d <= lmSize(track, nl.r)) lookOpts = { at: "landmark", rank: nl.rank };
    }
    const t = poseFromWorld(track, target, lookOpts);
    const f = Math.round((fov || 50) * 10) / 10;
    return {
      shot: { id: opts.id || "freecam", dur: opts.dur || 0.1, ease: "inOut",
        eye: [e.pose, Object.assign({}, e.pose)], look: [t.pose, Object.assign({}, t.pose)], fov: [f, f] },
      err: { eye: e.err, look: t.err },
    };
  }

  const EASE = {
    linear: (u) => u,
    in: (u) => u * u,
    out: (u) => 1 - (1 - u) * (1 - u),
    inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  };

  function trackAnchored(p) {
    return p && p.at !== "centre" && p.at !== "landmark";
  }

  function lerpPose(track, a, b, u, out) {
    if (trackAnchored(a) && trackAnchored(b)) {
      const total = track.total || 1;
      const sa = anchorS(track, a), sb = anchorS(track, b);
      let d = sb - sa;
      while (d > total / 2) d -= total;
      while (d < -total / 2) d += total;
      const xa = poseX(track, a, sa), xb = poseX(track, b, sb);
      Tracks.sample(track, wrapS(track, sa + d * u), _smp);
      const x = xa + (xb - xa) * u;
      out[0] = _smp.p[0] + _smp.r[0] * x;
      out[1] = _smp.p[1] + (a.y || 0) + ((b.y || 0) - (a.y || 0)) * u;
      out[2] = _smp.p[2] + _smp.r[2] * x;
      return out;
    }
    posePoint(track, a, _pa);
    posePoint(track, b, _pb);
    out[0] = _pa[0] + (_pb[0] - _pa[0]) * u;
    out[1] = _pa[1] + (_pb[1] - _pa[1]) * u;
    out[2] = _pa[2] + (_pb[2] - _pa[2]) * u;
    return out;
  }
  const _pa = [0, 0, 0], _pb = [0, 0, 0];

  const DEFAULT = [
    {
      id: "pit-exit", dur: 0.07, ease: "out", roll: "pitexit",
      eye: [{ at: "pitexit", off: -34, x: 0, y: 1.5 }, { at: "pitexit", off: -20, x: 0, y: 1.3 }],
      look: [{ at: "pitexit", off: 6, x: 0, y: 0.8 }, { at: "pitexit", off: 26, x: 0, y: 0.8 }],
      fov: [44, 38],
    },
    {
      id: "wide", dur: 0.07, ease: "inOut", sway: 0.35,
      eye: [{ at: "centre", bear: -0.30, distR: 1.10, yR: 0.36 },
            { at: "centre", bear: -0.12, distR: 1.00, yR: 0.32 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
      fov: [36, 38],
    },
    {
      id: "wide2", dur: 0.06, ease: "inOut", sway: 0.25,
      eye: [{ at: "centre", bear: 2.35, distR: 0.80, yR: 0.30 },
            { at: "centre", bear: 2.55, distR: 0.70, yR: 0.25 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
      fov: [36, 39],
    },
    {
      id: "landmark1", dur: 0.08, ease: "inOut",
      eye: [{ at: "landmark", rank: 0, bear: -0.28, distK: 1.7, yK: -0.15, y: 12 },
            { at: "landmark", rank: 0, bear: -0.08, distK: 1.5, yK: -0.1, y: 12 }],
      look: [{ at: "landmark", rank: 0, distK: 0, yK: 0.2 }, { at: "landmark", rank: 0, distK: 0, yK: 0.25 }],
      fov: [38, 40],
    },
    {
      id: "landmark2", dur: 0.07, ease: "inOut",
      eye: [{ at: "landmark", rank: 1, bear: 0.30, distK: 1.8, yK: -0.1, y: 12 },
            { at: "landmark", rank: 1, bear: 0.10, distK: 1.6, yK: -0.05, y: 12 }],
      look: [{ at: "landmark", rank: 1, distK: 0, yK: 0.15 }, { at: "landmark", rank: 1, distK: 0, yK: 0.2 }],
      fov: [38, 41],
    },
    {
      id: "turn-first", dur: 0.09, ease: "inOut",
      eye: [{ at: "corner", n: "first", off: -60, x: 16, y: 9 },
            { at: "corner", n: "first", off: 0, x: 18, y: 8 }],
      look: [{ at: "corner", n: "first", off: -12, x: 0, y: 0.6 },
             { at: "corner", n: "first", off: 30, x: 0, y: 0.6 }],
      fov: [38, 42],
    },
    {
      id: "turn-mid", dur: 0.09, ease: "inOut",
      eye: [{ at: "corner", n: "lore", off: -35, x: 16, y: 9 },
            { at: "corner", n: "lore", off: 0, x: 18, y: 8 }],
      look: [{ at: "corner", n: "lore", off: 0, x: 0, y: 0.6 },
             { at: "corner", n: "lore", off: 20, x: 0, y: 0.6 }],
      fov: [42, 44],
    },
    {
      id: "turn-late", dur: 0.09, ease: "inOut",
      eye: [{ at: "corner", n: "fastest", off: -35, x: 13, y: 6 },
            { at: "corner", n: "fastest", off: 20, x: 14, y: 5 }],
      look: [{ at: "corner", n: "fastest", off: 5, x: 0, y: 0.6 },
             { at: "corner", n: "fastest", off: 45, x: 0, y: 0.6 }],
      fov: [40, 43],
    },
    {
      id: "grid-walk", dur: 0.07, ease: "inOut",
      eye: [{ at: "pole", off: -118, x: 0, y: 1.7 }, { at: "pole", off: -110, x: 0, y: 1.7 }],
      look: [{ at: "slot", n: 4, off: 0, x: 0, y: 0.6 }, { at: "slot", n: 2, off: 0, x: 0, y: 0.6 }],
      fov: [50, 46],
    },
    {
      id: "grid-crane", dur: 0.09, ease: "inOut",
      eye: [{ at: "grid", off: -16, x: -1, y: 2.2 }, { at: "grid", off: -8, x: 0, y: 5.8 }],
      look: [{ at: "grid", off: 45, x: 0, y: 0.8 }, { at: "grid", off: 85, x: 0, y: 0.8 }],
      fov: [30, 32],
    },
    {
      id: "grid-front", dur: 0.10, ease: "inOut",
      eye: [{ at: "pole", off: 14, x: 3.5, y: 2.2 }, { at: "pole", off: 10, x: 2.5, y: 1.8 }],
      look: [{ at: "pole", off: -12, x: 0, y: 0.6 }, { at: "pole", off: -12, x: 0, y: 0.6 }],
      fov: [40, 40],
    },
    {
      id: "grid-mine", dur: 0.12, ease: "out",
      eye: [{ at: "slot", n: "player", off: -22, x: 0, y: 1.9 }, { at: "slot", n: "player", off: -9, x: 0, y: 1.5 }],
      look: [{ at: "slot", n: "player", off: 6, x: 0, y: 0.9 }, { at: "start", off: 30, x: 0, y: 1.2 }],
      fov: [36, 40],
    },
  ];
  const GRID_SHOTS = Object.freeze(DEFAULT.filter((shot) => /^grid/.test(shot.id || "")));
  function gridProgress(lightsLit) {
    const lit = Math.max(1, Math.min(3, lightsLit | 0));
    return (lit - 0.5) / 3;
  }

  const _eye = [0, 0, 0], _tgt = [0, 0, 0];
  const _out = { eye: _eye, tgt: _tgt, fov: 50, index: 0, id: "", cut: false, lift: 0, corner: 0 };

  let _heroCars = null, _hero = null, _heroHome = null;
  function restoreHero() {
    if (_hero && _heroHome) Object.assign(_hero, _heroHome);
  }
  function setHeroCars(cars) {
    if (cars === _heroCars) return;
    restoreHero();
    _heroCars = Array.isArray(cars) ? cars : null;
    _hero = _heroCars && (_heroCars.find((c) => c && c.isPlayer) || _heroCars[0]) || null;
    _heroHome = _hero ? {
      s: _hero.s, x: _hero.x, xVis: _hero.xVis, px: _hero.px, pz: _hero.pz, speed: _hero.speed,
      rPrevS: _hero.rPrevS, rPrevX: _hero.rPrevX, rPrevPx: _hero.rPrevPx, rPrevPz: _hero.rPrevPz,
    } : null;
  }
  const _heroSmp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function driveHero(track, apexS, t, seconds, cars) {
    if (cars !== undefined) setHeroCars(cars);
    if (!_hero || !track || typeof DrivingLine === "undefined" || !DrivingLine.speedAt ||
        typeof TrackLine === "undefined" || !TrackLine.at) return null;
    const apexV = DrivingLine.speedAt(apexS);
    if (!(apexV > 0)) return null;
    let s = apexS + (Math.max(0, Math.min(1, t)) - 0.5) * apexV * Math.max(0, seconds || 0);
    s %= track.total; if (s < 0) s += track.total;
    const line = TrackLine.at(track, s), v = DrivingLine.speedAt(s);
    return placeHero(track, s, line && isFinite(line.x) ? line.x : 0, v > 0 ? v : apexV);
  }
  function placeHero(track, s, x, speed) {
    Tracks.sample(track, s, _heroSmp);
    _hero.s = _hero.rPrevS = s; _hero.x = _hero.rPrevX = _hero.xVis = x;
    _hero.px = _hero.rPrevPx = _heroSmp.p[0] + _heroSmp.r[0] * x;
    _hero.pz = _hero.rPrevPz = _heroSmp.p[2] + _heroSmp.r[2] * x;
    _hero.speed = speed;
    return _hero;
  }

  function rollHero(track, t, cars) {
    if (cars !== undefined) setHeroCars(cars);
    if (!_hero || !track || !track.pit || !isFinite(track.pit.sOut) || typeof TrackLine === "undefined" || typeof Tracks === "undefined") return null;
    const s = wrapS(track, track.pit.sOut - 30 + 58 * Math.max(0, Math.min(1, t)));
    const lane = Tracks.pitLaneAt ? Tracks.pitLaneAt(track, s) : null;
    return placeHero(track, s, lane && isFinite(lane.centre) ? lane.centre : 0, 22);
  }

  const WARM_NOW = 2;
  let _warmGen = 0;
  function warm(track, shots) {
    const list = bindCorners(track, (shots && shots.length) ? shots : DEFAULT);
    let total = 0;
    for (let i = 0; i < list.length; i++) total += list[i].dur || 0;
    if (!(total > 0)) return;
    const gen = ++_warmGen;
    const plan = (i) => { const sh = landmarkFallback(track, list[i]); planShot(track, sh, (sh.dur || 1) / total); };
    for (let i = 0; i < Math.min(WARM_NOW, list.length); i++) plan(i);
    let i = WARM_NOW;
    const next = () => { if (gen !== _warmGen || i >= list.length) return; plan(i++); setTimeout(next, 0); };
    if (i < list.length) setTimeout(next, 0);
  }
  function cancelWarm() { _warmGen++; }
  function planSteps(track, shots) {
    const list = bindCorners(track, (shots && shots.length) ? shots : DEFAULT);
    let total = 0, i = 0;
    for (let j = 0; j < list.length; j++) total += list[j].dur || 0;
    return () => {
      if (!(total > 0) || i >= list.length) return true;
      const sh = landmarkFallback(track, list[i++]);
      planShot(track, sh, (sh.dur || 1) / total);
      return i >= list.length;
    };
  }
  const withoutSlot = (list) => { const out = list.filter(fitsGrid); return out.length && out.length < list.length ? out : list; };
  const FILMS_GRID = { grid: 1, pole: 1, slot: 1 };
  const filmsGrid = (sh) => [sh.eye[0], sh.eye[1], sh.look[0], sh.look[1]].some((p) => p && FILMS_GRID[p.at]);
  const withoutGrid = (list) => { const out = list.filter((sh) => !filmsGrid(sh)); return out.length ? out : list; };
  function shotAt(u, shots) {
    const list = (shots && shots.length) ? shots : DEFAULT;
    let total = 0;
    for (let i = 0; i < list.length; i++) total += list[i].dur || 0;
    if (!(total > 0)) total = 1;
    let at = Math.max(0, Math.min(1, +u || 0)) * total, idx = 0, acc = 0;
    for (; idx < list.length - 1; idx++) {
      if (at < acc + (list[idx].dur || 0)) break;
      acc += list[idx].dur || 0;
    }
    const dur = list[idx].dur || 1;
    return { index: idx, id: list[idx].id || String(idx), t: Math.max(0, Math.min(1, (at - acc) / dur)), total };
  }
  function warmProgress(list) {
    list = (list && list.length) ? list : DEFAULT;
    let tot = 0;
    for (let i = 0; i < list.length; i++) tot += list[i].dur || 0;
    if (!(tot > 0)) return 0;
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i].dur || 0;
      if (list[i].id === "turn-first") return (acc + 0.5 * d) / tot;
      acc += d;
    }
    return 0;
  }
  function solve(track, u, shots) {
    const list = bindCorners(track, (shots && shots.length) ? shots : DEFAULT);
    const on = shotAt(u, list), idx = on.index, t = on.t, total = on.total;
    const shot = landmarkFallback(track, list[idx]);
    const dur = shot.dur || 1;
    const e = (EASE[shot.ease] || EASE.inOut)(t);

    const plan = planShot(track, shot, dur / total);
    lerpPose(track, plan.eye[0], plan.eye[1], e, _eye);
    lerpPose(track, plan.look[0], plan.look[1], e, _tgt);
    const authoredY = _eye[1];
    if (!plan.onRoad) {
      _eye[1] += liftAt(plan.prof, e);
      floorEye(track, clearEye(track, _eye));
    }
    _out.lift = _eye[1] - authoredY;
    _out.fov = (shot.fov ? shot.fov[0] + (shot.fov[1] - shot.fov[0]) * e : 50) * (plan.fovK || 1);
    _out.cut = idx !== _lastIdx;
    _lastIdx = idx;
    _out.index = idx;
    _out.id = shot.id || String(idx);
    const k = shotCorner(shot);
    _out.corner = _airCorner = typeof k === "number" && k > 0 ? k : 0;
    const reduced = reducedMotion();
    if (_out.corner) driveHero(track, cornerS(track, _out.corner), t, dur / total * _flyS);
    else if (shot.roll === "pitexit" && track.pit && !reduced) rollHero(track, t);
    else restoreHero();
    const sway = swayAt(shot, t, reduced);
    if (sway) {
      let dx = _tgt[0] - _eye[0], dz = _tgt[2] - _eye[2], dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl; _eye[0] -= dz * sway; _eye[2] += dx * sway;
    }
    syncPresentation(presentation(u, list, reduced, on), _out.cut);
    return _out;
  }
  let _lastIdx = -1, _airCorner = 0;
  let _reduceMq = null;
  function reducedMotion() {
    if (!_reduceMq) {
      if (typeof matchMedia === "undefined") return false;
      _reduceMq = matchMedia("(prefers-reduced-motion: reduce)");
      if (!_reduceMq) return false;
    }
    return !!_reduceMq.matches;
  }
  function airCorner() { return _airCorner; }

  const LIFT_N = 32, LIFT_W = 0.3, LIFT_OK = 4, IN_STEP = 1.5, IN_MIN = 9;

  const TREES = ["pine", "stonePine", "cypress", "broadleafFall", "palm", "acacia", "tree"];
  const TREE_H = 8, TREE_M = 1;
  function treeBlockers(track) {
    if (track._fbTrees) return track._fbTrees;
    const out = [];
    const list = track.props && track.props.list;
    if (list) for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r && r.h >= TREE_H && TREES.indexOf(r.kind) !== -1) out.push(r);
    }
    track._fbTrees = out;
    return out;
  }
  function clearTrees(track, eye) {
    const b = treeBlockers(track);
    const near = nearBoxes(track._fbTreeGrid || (track._fbTreeGrid = boxGrid(b)), eye[0], eye[2], 0);
    for (let n = 0; n < near.length; n++) {
      const r = b[near[n]];
      if (Math.abs(eye[0] - r.x) < r.w / 2 && Math.abs(eye[2] - r.z) < r.d / 2 &&
          eye[1] > r.y - r.h / 2 && eye[1] < r.y + r.h / 2 + TREE_M) eye[1] = r.y + r.h / 2 + TREE_M;
    }
    return eye;
  }

  const _lp = [0, 0, 0];
  const _lq = [0, 0, 0];
  function profileOf(track, eye0, eye1) {
    const prof = new Float32Array(LIFT_N + 1);
    let max = 0, gap = 0;
    lerpPose(track, eye0, eye1, 0, _lq);
    for (let j = 1; j <= LIFT_N; j++) {
      lerpPose(track, eye0, eye1, j / LIFT_N, _lp);
      gap = Math.max(gap, Math.hypot(_lp[0] - _lq[0], _lp[1] - _lq[1], _lp[2] - _lq[2]));
      _lq[0] = _lp[0]; _lq[1] = _lp[1]; _lq[2] = _lp[2];
    }
    const m = FlybyClear.CLEAR_M + gap / 2 + 0.25;
    for (let j = 0; j <= LIFT_N; j++) {
      lerpPose(track, eye0, eye1, j / LIFT_N, _lp);
      const y0 = _lp[1];
      for (let k = 0; k < 3; k++) {
        const y = _lp[1];
        floorEye(track, clearTrees(track, clearEye(track, _lp, m)));
        if (_lp[1] === y) break;
      }
      prof[j] = _lp[1] - y0;
      if (prof[j] > max) max = prof[j];
    }
    return { prof: bridge(prof), max: max };
  }
  const BRIDGE = 0.6;
  function bridge(prof) {
    const n = prof.length, w = Math.round(BRIDGE * (n - 1)), out = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let l = 0, r = 0;
      for (let i = Math.max(0, j - w); i <= j; i++) if (prof[i] > l) l = prof[i];
      for (let i = j; i <= Math.min(n - 1, j + w); i++) if (prof[i] > r) r = prof[i];
      out[j] = Math.max(prof[j], Math.min(l, r));
    }
    return out;
  }
  const LM_STEP = 0.08, LM_IN_MIN = 0.6;
  function inset(pose, k) {
    if (pose.at === "landmark") {
      if (!((pose.distK || 0) > 0)) return pose;
      const o = Object.assign({}, pose);
      o.distK = pose.distK * Math.max(LM_IN_MIN, 1 - k * LM_STEP);
      return o;
    }
    const x = pose.x || 0, ax = Math.abs(x);
    if (pose.at !== "corner" || ax <= IN_MIN) return pose;
    const o = Object.assign({}, pose);
    o.x = (x > 0 ? 1 : -1) * Math.max(IN_MIN, ax - k * IN_STEP);
    return o;
  }

  const FB_BEAR = [1.25, -1.75];
  function landmarkFallback(track, shot) {
    let rank = -1;
    const poses = [shot.eye[0], shot.eye[1], shot.look[0], shot.look[1]];
    for (let i = 0; i < 4; i++) if (poses[i] && poses[i].at === "landmark") rank = Math.max(rank, poses[i].rank || 0);
    if (rank < 0 || rank < landmarks(track).length) return shot;
    const cache = track._fbFallback || (track._fbFallback = new WeakMap());
    let fb = cache.get(shot);
    if (fb) return fb;
    const bear = FB_BEAR[Math.min(rank, FB_BEAR.length - 1)];
    fb = Object.assign({}, shot, {
      eye: [{ at: "centre", bear: bear - 0.1, distR: 0.75, yR: 0.24 },
            { at: "centre", bear: bear + 0.1, distR: 0.66, yR: 0.2 }],
      look: [{ at: "centre", distR: 0, yR: 0 }, { at: "centre", distR: 0, yR: 0 }],
    });
    cache.set(shot, fb);
    return fb;
  }

  const SIGHT_EDGE = 1, SIGHT_MIN = 0.3;
  const _sa = [0, 0, 0], _sb = [0, 0, 0], _sm = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
  function arcDelta(track, a, b) {
    const total = track.total || 1;
    let d = anchorS(track, b) - anchorS(track, a);
    while (d > total / 2) d -= total;
    while (d < -total / 2) d += total;
    return d;
  }
  function lerpS(track, a, b, u) {
    const sa = anchorS(track, a);
    let d = anchorS(track, b) - sa;
    const total = track.total || 1;
    while (d > total / 2) d -= total;
    while (d < -total / 2) d += total;
    return sa + d * u;
  }
  function sightOff(track, eye, look) {
    let worst = -Infinity;
    const total = track.total || 1;
    for (let j = 0; j <= 4; j++) {
      lerpPose(track, eye[0], eye[1], j / 4, _sa);
      lerpPose(track, look[0], look[1], j / 4, _sb);
      const se = lerpS(track, eye[0], eye[1], j / 4);
      let dl = lerpS(track, look[0], look[1], j / 4) - se;
      while (dl > total / 2) dl -= total;
      while (dl < -total / 2) dl += total;
      for (let k = 1; k <= 8; k++) {
        const f = k / 8;
        const pr = Tracks.project(track, _sa[0] + (_sb[0] - _sa[0]) * f, _sa[2] + (_sb[2] - _sa[2]) * f, se + dl * f);
        if (!pr) continue;
        Tracks.sample(track, pr.s, _sm);
        const off = Math.abs(pr.lat) - (_sm.hw || 10);
        if (off > worst) worst = off;
      }
    }
    return worst;
  }
  function planLook(track, eye, look) {
    if (!(onRoadPose(eye[0]) && onRoadPose(eye[1]) && trackAnchored(look[0]) && trackAnchored(look[1]) &&
          look[0].at !== "corner" && look[1].at !== "corner")) return look;
    if (sightOff(track, eye, look) <= SIGHT_EDGE) return look;
    const lead = [arcDelta(track, eye[0], look[0]), arcDelta(track, eye[1], look[1])];
    let best = look;
    for (let f = 0.9; f >= SIGHT_MIN - 1e-9; f -= 0.1) {
      const cand = [0, 1].map((i) => Object.assign({}, look[i], { off: (look[i].off || 0) - (1 - f) * lead[i] }));
      best = cand;
      if (sightOff(track, eye, cand) <= SIGHT_EDGE) break;
    }
    return best;
  }

  const REF_S = 20, PAN_MAX = 25 * Math.PI / 180, PARA_MAX = 30 * Math.PI / 180, PAN_K = 0.85, PAN_MIN_K = 0.03, PAN_N = 48;
  const _pe = [0, 0, 0], _pt = [0, 0, 0];
  function panRate(track, shot, frac, eye, look, prof) {
    const ease = EASE[shot.ease] || EASE.inOut;
    let peak = 0, para = 0, px = 0, py = 0, pz = 0, ex = 0, ey = 0, ez = 0;
    for (let j = 0; j <= PAN_N; j++) {
      const e = ease(j / PAN_N);
      lerpPose(track, eye[0], eye[1], e, _pe);
      if (prof) _pe[1] += liftAt(prof, e);
      lerpPose(track, look[0], look[1], e, _pt);
      let dx = _pt[0] - _pe[0], dy = _pt[1] - _pe[1], dz = _pt[2] - _pe[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      if (j) {
        const a = Math.acos(Math.max(-1, Math.min(1, dx * px + dy * py + dz * pz)));
        if (a > peak) peak = a;
        const m = Math.hypot(_pe[0] - ex, _pe[1] - ey, _pe[2] - ez) / l;
        if (m > para) para = m;
      }
      px = dx; py = dy; pz = dz; ex = _pe[0]; ey = _pe[1]; ez = _pe[2];
    }
    const per = PAN_N / (Math.max(1e-6, frac) * _flyS);
    return Math.max(peak * per / PAN_MAX, para * per / PARA_MAX);
  }
  const PAN_RUNGS = Math.floor(Math.log(PAN_MIN_K) / Math.log(PAN_K) + 1e-9);
  let _flyS = REF_S;
  function setDuration(ms) { _flyS = ms > 0 ? ms / 1000 : REF_S; }
  function boundaries(shots) {
    const list = (shots && shots.length) ? shots : DEFAULT;
    let total = 0;
    for (const shot of list) total += shot.dur || 0;
    if (!(total > 0)) return [];
    const out = []; let acc = 0;
    for (let i = 0; i < list.length - 1; i++) { acc += list[i].dur || 0; out.push(acc / total); }
    return out;
  }
  const DIP_MS = 150, REDUCED_DIP_MS = 300;
  function presentation(u, shots, reduced, on) {
    if (!on) on = shotAt(u, shots);
    const cuts = boundaries(shots);
    let near = Infinity;
    for (const cut of cuts) near = Math.min(near, Math.abs((+u || 0) - cut) * _flyS * 1000);
    const dipMs = reduced ? REDUCED_DIP_MS : DIP_MS;
    const id = on.id || "";
    return {
      dip: near < dipMs ? 1 - near / dipMs : 0,
      dipMs,
      sectors: id === "wide" ? on.t : (/^wide/.test(id) ? 1 : 0),
    };
  }
  function swayAt(shot, t, reduced) {
    if (reduced || !(shot && shot.sway > 0)) return 0;
    return shot.sway * Math.sin(Math.max(0, Math.min(1, t)) * Math.PI * 2);
  }
  let _dipTimer = 0;
  function syncPresentation(p, cut) {
    if (typeof document === "undefined" || !document.getElementById) return;
    const el = document.getElementById("loading");
    if (!el || !el.dataset || el.dataset.phase !== "run") return;
    el.dataset.sectors = p.sectors > 0 ? p.sectors.toFixed(3) : "";
    if (!cut) return;
    el.dataset.dip = "";
    if (el.animate) el.animate([{ opacity: 1 }, { opacity: 0.78 }, { opacity: 1 }], { duration: p.dipMs, easing: "ease-in-out" });
    clearTimeout(_dipTimer);
    _dipTimer = setTimeout(() => { if (el.dataset) delete el.dataset.dip; }, p.dipMs);
  }
  function squeeze(track, pair, k) {
    const a = pair[0], b = pair[1];
    if (trackAnchored(a) && trackAnchored(b)) {
      const d = arcDelta(track, a, b) * (1 - k) / 2;
      if (!d) return pair;
      return [Object.assign({}, a, { off: (a.off || 0) + d }), Object.assign({}, b, { off: (b.off || 0) - d })];
    }
    if (a.at === b.at && (a.at === "centre" || a.at === "landmark") && (a.bear || 0) !== (b.bear || 0)) {
      const d = ((b.bear || 0) - (a.bear || 0)) * (1 - k) / 2;
      return [Object.assign({}, a, { bear: (a.bear || 0) + d }), Object.assign({}, b, { bear: (b.bear || 0) - d })];
    }
    return pair;
  }

  function planEye(track, eye) {
    const e0 = eye[0], e1 = eye[1];
    let best = profileOf(track, e0, e1), out = eye;
    if (best.max > LIFT_OK && (e0.at === "corner" || e1.at === "corner" || e0.at === "landmark" || e1.at === "landmark")) {
      for (let k = 1; k <= 8; k++) {
        const a = inset(e0, k), b = inset(e1, k);
        if (a === e0 && b === e1) break;
        const p = profileOf(track, a, b);
        if (p.max < best.max) { best = p; out = [a, b]; }
        if (p.max <= LIFT_OK) break;
      }
      for (let k = 1; best.max > LIFT_OK && k <= OUT_N; k++) {
        const a = outset(e0, k), b = outset(e1, k);
        if (a === e0 && b === e1) break;
        const p = profileOf(track, a, b);
        if (p.max < best.max - 0.5) { best = p; out = [a, b]; }
      }
      const base = out;
      for (let i = 0; best.max > LIFT_OK && i < NUDGE.length; i++) {
        const a = nudge(base[0], NUDGE[i]), b = nudge(base[1], NUDGE[i]);
        if (a === base[0] && b === base[1]) continue;
        const p = profileOf(track, a, b);
        if (p.max < best.max - 0.5) { best = p; out = [a, b]; }
      }
      if (best.max > TREE_ROAD && e0.at === "corner" && e1.at === "corner") {
        const a = roadEdge(e0), b = roadEdge(e1);
        const p = profileOf(track, a, b);
        if (p.max < best.max) { best = p; out = [a, b]; }
      }
    }
    return { eye: out, prof: best.prof };
  }
  const TREE_ROAD = 8, EDGE_X = 5.5, EDGE_Y = 3.2;
  function roadEdge(pose) {
    const o = Object.assign({}, pose);
    o.x = (pose.x >= 0 ? 1 : -1) * EDGE_X;
    o.y = Math.min(pose.y || EDGE_Y, EDGE_Y);
    return o;
  }
  const NUDGE = [1, -1, 2, -2];
  function nudge(pose, k) {
    if (pose.at === "corner") return Object.assign({}, pose, { off: (pose.off || 0) + k * 8 });
    if (pose.at === "landmark" && (pose.distK || 0) > 0) return Object.assign({}, pose, { bear: (pose.bear || 0) + k * 0.2 });
    return pose;
  }
  const OUT_STEP = 2, OUT_N = 6, OUT_MAX = 30;
  function outset(pose, k) {
    const x = pose.x || 0, ax = Math.abs(x);
    if (pose.at !== "corner" || !x) return pose;
    const o = Object.assign({}, pose);
    o.x = (x > 0 ? 1 : -1) * Math.min(OUT_MAX, ax + k * OUT_STEP);
    return o;
  }

  const NEAR_ROAD = 0.28;
  const NEAR_SUBJ = 0.25, NEAR_THIRD = 0.4, FRAME_OK = 20, FRAME_TIE = 0.1, FRAME_MISS = 5, FRAME_FAST = 15, FRAME_PLANS = 3, FRAME_SCREEN = 8;
  const _fe = [0, 0, 0], _ft = [0, 0, 0];
  const _fs = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };

  function subjectOf(track, shot) {
    const cache = track._fbSubj || (track._fbSubj = new WeakMap());
    const hit = cache.get(shot);
    if (hit && hit.n === _gridSize) return hit.subj;
    const a = shot.look[0] || {}, b = shot.look[1] || a, L = track.total || 1;
    const road = (s0, s1, step, lats) => {
      const pts = [];
      for (let s = s0; s <= s1; s += step) {
        Tracks.sample(track, wrapS(track, s), _fs);
        const rl = Math.hypot(_fs.r[0], _fs.r[2]) || 1;
        for (let i = 0; i < lats.length; i++) {
          const l = lats[i] * _fs.hw;
          pts.push([_fs.p[0] + _fs.r[0] / rl * l, _fs.p[1] + 0.3, _fs.p[2] + _fs.r[2] / rl * l]);
        }
      }
      return pts;
    };
    let subj = null;
    if (a.at === "landmark") {
      const lm = landmarks(track);
      if (lm.length) {
        const rec = lm[Math.min(a.rank || 0, lm.length - 1)], pts = [];
        for (const fx of [-0.45, 0, 0.45]) for (const fy of [-0.45, 0, 0.45]) for (const fz of [-0.45, 0, 0.45]) {
          pts.push([rec.x + fx * rec.w, rec.y + fy * rec.h, rec.z + fz * rec.d]);
        }
        subj = { pts, skip: (bx) => bx.rec === rec, box: rec };
      }
    } else if (a.at === "centre") {
      subj = { pts: road(0, L - 1, L / 32, [-0.85, 0, 0.85]), lap: true };
    } else if (a.at === "corner") {
      const sc = cornerS(track, a.n || 1);
      const rel = (s) => { let d = s - sc; while (d > L / 2) d -= L; while (d < -L / 2) d += L; return d; };
      const lo = Math.min(rel(anchorS(track, a)), rel(anchorS(track, b)), 0) - 30;
      const hi = Math.max(rel(anchorS(track, a)), rel(anchorS(track, b)), 0) + 30;
      subj = { pts: road(sc + lo, sc + hi, 8, [-0.85, 0, 0.85]), strip: 3 };
    } else {
      const pts = [];
      for (let k = 0; k < _gridSize; k++) {
        const s = wrapS(track, L - POLE_BACK - k * GRID_SPACING);
        const x = slotX(track, k, s);
        Tracks.sample(track, s, _fs);
        const tl = Math.hypot(_fs.t[0], _fs.t[2]) || 1, fx = _fs.t[0] / tl, fz = _fs.t[2] / tl;
        const cx = _fs.p[0] + _fs.r[0] * x, cz = _fs.p[2] + _fs.r[2] * x, cy = _fs.p[1] + 0.5;
        pts.push([cx, cy + 0.3, cz], [cx + fx * 2.2, cy + 0.2, cz + fz * 2.2], [cx - fx * 2.2, cy + 0.2, cz - fz * 2.2]);
      }
      subj = pts.length ? { pts, field: true } : null;
    }
    cache.set(shot, { n: _gridSize, subj });
    return subj;
  }

  const FRAME_AT = [0, 0.5, 1], SCREEN_AT = [0, 1], SKETCH_AT = [0.5];
  function frameAt(track, shot, eye, look, prof, onRoad, e, fovK) {
    lerpPose(track, eye[0], eye[1], e, _fe);
    lerpPose(track, look[0], look[1], e, _ft);
    if (!onRoad) { if (prof) _fe[1] += liftAt(prof, e); floorEye(track, clearEye(track, _fe)); }
    return (shot.fov ? shot.fov[0] + (shot.fov[1] - shot.fov[0]) * e : 50) * (fovK || 1);
  }
  function judgeMove(track, shot, eye, look, prof, onRoad, subj, at, coarse, fovK, withMix, lapCover) {
    const w = { cost: 0, near: 0, nearSubj: 0, inside: false, ground: 0, mixCost: 0, inF: 1, vis: 1, cover: null }, es = at || FRAME_AT;
    const mixed = withMix && subj.lap;
    for (let j = 0; j < es.length; j++) {
      const fov = frameAt(track, shot, eye, look, prof, onRoad, es[j], fovK);
      const f = FlybySight.frame(track, _fe, _ft, fov, subj, coarse, mixed && (j === 0 || j === es.length - 1), lapCover);
      if (f.mix) { w.ground = Math.max(w.ground, f.mix.ground); w.mixCost = Math.max(w.mixCost, f.mixCost); }
      if (f.cost - f.mixCost > w.cost) w.cost = f.cost - f.mixCost;
      if (f.near > w.near) w.near = f.near;
      if (f.nearSubj > w.nearSubj) w.nearSubj = f.nearSubj;
      if (f.inF < w.inF) w.inF = f.inF;
      if (f.vis < w.vis) w.vis = f.vis;
      if (f.cover != null && (w.cover == null || f.cover < w.cover)) w.cover = f.cover;
      if (f.inside) w.inside = true;
    }
    w.cost += w.mixCost;
    w.ok = !w.inside && w.nearSubj <= NEAR_SUBJ && w.near <= (onRoad ? NEAR_ROAD : NEAR_THIRD) && w.cost <= FRAME_OK;
    return w;
  }
  function groundOf(track, shot, eye, look, prof, onRoad, fovK) {
    let g = 0;
    for (const e of [0, 1]) {
      const fov = frameAt(track, shot, eye, look, prof, onRoad, e, fovK);
      g = Math.max(g, FlybySight.mix(track, FlybySight.camera(_fe, _ft, fov, 16 / 9)).ground);
    }
    return g;
  }

  const TILT_MAX = 0.7, TILT_PAD = 0.05;
  const _te = [0, 0, 0], _tl = [0, 0, 0];
  function tilt(track, eye, look, k) {
    return [0, 1].map((i) => {
      if (look[i].at !== "centre") return look[i];
      posePoint(track, eye[i], _te); posePoint(track, look[i], _tl);
      return Object.assign({}, look[i], { y: (look[i].y || 0) + k * Math.max(0, _te[1] - _tl[1]) });
    });
  }
  function level(track, shot, frac, fin, onRoad, subj, fovK, best, cand, ref) {
    if (fin.look[0].at !== "centre" || fin.look[1].at !== "centre") return null;
    const eye = fin.pe.eye, prof = fin.pe.prof, ok = FlybySight.GROUND_OK;
    const g0 = groundOf(track, shot, eye, fin.look, prof, onRoad, fovK);
    if (g0 <= ok) return null;
    const fov = frameAt(track, shot, eye, fin.look, prof, onRoad, 0.5, fovK);
    const H = _fe[1] - _ft[1], D = Math.hypot(_fe[0] - _ft[0], _fe[2] - _ft[2]);
    if (!(H > 1 && D > 1)) return null;
    const perRow = 2 * Math.tan(fov * Math.PI / 360) * D / H;
    let bestCost = best.cost + (best.ok ? 0 : FRAME_MISS) + FlybySight.mixCost({ ground: g0, sky: 0 }), out = null;
    let dr = 0, g = g0;
    for (let n = 0; n < 3 && g > ok; n++) {
      dr += g - ok + TILT_PAD;
      const k = Math.min(TILT_MAX, dr * perRow), lk = tilt(track, eye, fin.look, k);
      if (!fin.fast && panRate(track, shot, frac, eye, lk, prof) > 1) break;
      const j = judgeMove(track, shot, eye, lk, prof, onRoad, subj, FRAME_AT, false, fovK, true, !!(cand && cand.aim));
      g = j.ground;
      const cost = j.cost + (j.ok ? 0 : FRAME_MISS) + lapLoss(ref || best, j, cand, LAP_TILT);
      if (cost < bestCost) { bestCost = cost; out = { j, f: Object.assign({}, fin, { look: lk }) }; }
      if (k >= TILT_MAX) break;
    }
    return out;
  }

  const ROAD_X = 8, ROAD_Y = 6;
  const LONG_LENS = 0.65, C_SCALE = [1, 1.4, 1.8], C_UP = [0, 6, 12, 22], C_SLIDE = [0, -25, 25, -50, 50, -90, 90, -120, 120], R_SLIDE = [0, -12, 12, -28, 28];
  const L_DIST = [1, 1.3, 0.75], L_UP = [0, 12, 24], L_TURN = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2];
  const W_TURN = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2], W_UP = [0, 60, null], W_CREST = 23 * Math.PI / 180;
  const W_HIGH = [30 * Math.PI / 180, 36 * Math.PI / 180], W_AIM = 15 * Math.PI / 180;
  function centreD(track, p) {
    const b = bounds(track), dR = p.distR === undefined ? 1.4 : p.distR;
    return dR > 0 ? Math.max(C_DMIN, Math.min(C_DMAX, dR * b.rad)) : 0;
  }
  function crestY(track, p, ang) {
    if (p.at !== "centre") return 0;
    const b = bounds(track), yR = p.yR === undefined ? 0.5 : p.yR;
    const h = yR > 0 ? Math.max(C_HMIN, Math.min(C_HMAX, yR * b.rad)) : yR * b.rad;
    return Math.max(0, centreD(track, p) * Math.tan(ang || W_CREST) - h - (p.y || 0));
  }
  const LAP_SLACK = 0.08, LAP_LOSS = 200, LAP_TILT = 60, W_HIGH_VIS = 0.6, LAP_THIN = 0.5, LAP_THIN_K = 100, LAP_COVER = 0.006;
  function lapLoss(j0, j, cand, rate) {
    if (!(cand && cand.aim)) return 0;
    let thin = 0;
    if (j.cover != null) thin = Math.max(0, LAP_COVER - j.cover) * LAP_THIN_K * 100 + (j0.cover > 0 ? Math.max(0, LAP_THIN - j.cover / j0.cover) * LAP_THIN_K : 0);
    return Math.max(0, j0.inF - LAP_SLACK - j.inF) * (rate || LAP_LOSS) + thin;
  }
  function aimed(track, eye, look, pitch) {
    if (!pitch) return look;
    return [0, 1].map((i) => {
      if (look[i].at !== "centre") return look[i];
      posePoint(track, eye[i], _te); posePoint(track, look[i], _tl);
      const up = _te[1] - _tl[1] - Math.hypot(_te[0] - _tl[0], _te[2] - _tl[2]) * Math.tan(pitch);
      return up > 0 ? Object.assign({}, look[i], { y: (look[i].y || 0) + up }) : look[i];
    });
  }
  function framings(track, shot) {
    const e0 = shot.eye[0], e1 = shot.eye[1], at = e0 && e0.at;
    const out = [];
    let tier = 0;
    const add = (o, fovK) => { const c = [Object.assign({}, e0, o(e0)), Object.assign({}, e1, o(e1))]; c.tier = tier; c.fovK = fovK || 1; out.push(c); };
    if (onRoadPose(e0) && onRoadPose(e1)) {
      const cap = (x) => Math.max(-ROAD_X, Math.min(ROAD_X, x));
      for (const ds of R_SLIDE) {
        tier++;
        for (const dy of [0, 1.5]) for (const dx of [0, null, 2.5, -2.5, 5, -5]) {
          add((p) => ({ x: dx === null ? -(p.x || 0) : cap((p.x || 0) + dx), y: Math.min(ROAD_Y, (p.y || 0) + dy), off: (p.off || 0) + ds }));
        }
      }
    } else if (at === "corner" && e1.at === "corner") {
      for (const ds of C_SLIDE) for (const side of [1, -1]) {
        tier++;
        for (const dy of C_UP) for (const k of C_SCALE) {
          const o = (p) => ({ x: (p.x || 0) * k * side, y: (p.y || 0) + dy, off: (p.off || 0) + ds });
          add(o);
          if (dy >= 12 || Math.abs(ds) >= 50) add(o, LONG_LENS);
        }
      }
    } else if (at === "landmark" && e1.at === "landmark") {
      for (const db of L_TURN) {
        if (db <= 0) tier++;
        for (const dy of L_UP) for (const k of L_DIST) add((p) => ({ distK: (p.distK || 0) * k, y: (p.y || 0) + dy, bear: (p.bear || 0) + db }));
      }
    } else if (at === "centre" && e1.at === "centre") {
      for (const dy of W_UP) {
        if (dy === null && !(Math.min(crestY(track, e0), crestY(track, e1)) > W_UP[1] + 20)) continue;
        for (const db of W_TURN) add((p) => ({ bear: (p.bear || 0) + db, y: (p.y || 0) + (dy === null ? crestY(track, p) : dy) }));
      }
      let below = Math.max(W_UP[1], Math.min(crestY(track, e0), crestY(track, e1)));
      for (const ang of W_HIGH) {
        const up = Math.min(crestY(track, e0, ang), crestY(track, e1, ang));
        if (!(up > below + 20)) continue;
        below = up;
        for (const db of W_TURN) { add((p) => ({ bear: (p.bear || 0) + db, y: (p.y || 0) + crestY(track, p, ang) })); out[out.length - 1].aim = W_AIM; }
      }
    }
    return out;
  }

  function planShot(track, shot, frac) {
    const cache = track._fbPlan || (track._fbPlan = new WeakMap());
    let plan = cache.get(shot);
    const secs = frac * _flyS, slot = usesSlot(shot) ? _playerSlot : -1, rows = usesGrid(shot) ? Math.min(GRID_ROWS, _gridSize) : -1;
    if (plan && plan.secs <= secs + 1e-6 && plan.secs >= secs * 0.8 && plan.slot === slot && plan.rows === rows) return plan;
    const onRoad = onRoadPose(shot.eye[0]) && onRoadPose(shot.eye[1]);
    const noLift = new Float32Array(LIFT_N + 1);
    const at = (src, k) => {
      const ey = k === 1 ? src.eye : squeeze(track, src.eye, k), lk = k === 1 ? src.look : squeeze(track, src.look, k);
      const pe = onRoad ? { eye: ey, prof: noLift } : planEye(track, ey);
      const rate = panRate(track, shot, frac, pe.eye, lk, pe.prof);
      return { k, pe, look: lk, rate, fast: rate > 1 };
    };
    const canSqueeze = (src) => squeeze(track, src.eye, 0.5) !== src.eye || squeeze(track, src.look, 0.5) !== src.look;
    const ladder = (src) => {
      let best = at(src, 1);
      if (best.fast && canSqueeze(src)) {
        const rung = (n) => at(src, Math.pow(PAN_K, n));
        const ahead = (c) => Math.max(1, Math.ceil(Math.log(1 / c.rate) / Math.log(PAN_K)));
        let lo = 0, n = Math.min(PAN_RUNGS, ahead(best));
        best = rung(n);
        while (best.fast && n < PAN_RUNGS) { lo = n; best = rung(n = Math.min(PAN_RUNGS, n + ahead(best))); }
        while (!best.fast && n - lo > 1) { const m = (lo + n) >> 1, c = rung(m); if (c.fast) lo = m; else { n = m; best = c; } }
      }
      return best;
    };
    const finish = (c) => ({ pe: c.pe, k: c.k, fast: c.fast, look: c.look !== shot.look ? planLook(track, c.pe.eye, c.look) : c.look });
    let fin = finish(ladder({ eye: shot.eye, look: planLook(track, shot.eye, shot.look) })), framing = 0, fovK = 1;
    const subj = typeof FlybySight !== "undefined" ? subjectOf(track, shot) : null;
    const tried = [];
    let picked = null, lapRef = null;
    if (subj) {
      const j0 = judgeMove(track, shot, fin.pe.eye, fin.look, fin.pe.prof, onRoad, subj);
      let best = j0;
      tried.push(j0);
      if (!j0.ok || fin.fast || subj.lap) {
        const k = fin.k, n0 = Math.round(Math.log(k) / Math.log(PAN_K)), cands = framings(track, shot);
        const lk0 = k === 1 ? shot.look : squeeze(track, shot.look, k);
        let bestCost = j0.cost + (j0.ok ? 0 : FRAME_MISS) + (fin.fast ? FRAME_FAST : 0), ref = j0;
        for (let round = 0; round < 2; round++) {
          if (round === 1) {
            if (!(subj.lap && best.vis < W_HIGH_VIS)) break;
            const jr = judgeMove(track, shot, fin.pe.eye, fin.look, fin.pe.prof, onRoad, subj, FRAME_AT, false, fovK, true, true);
            bestCost += jr.cost - best.cost;
            ref = lapRef = jr;
          }
          const sketched = [], screened = [];
          for (let i = 1, pass = false; i < cands.length; i++) {
            if (!cands[i].aim !== !round) continue;
            if (pass && cands[i].tier !== cands[i - 1].tier) break;
            const ey = k === 1 ? cands[i] : squeeze(track, cands[i], k);
            const lk = aimed(track, ey, planLook(track, ey, lk0), cands[i].aim);
            const j = judgeMove(track, shot, ey, lk, null, onRoad, subj, onRoad ? FRAME_AT : SKETCH_AT, !onRoad, cands[i].fovK, false, round === 1);
            sketched.push({ i, ey, lk, cost: j.cost + i * FRAME_TIE * 0.2 + lapLoss(ref, j, cands[i]) });
            if (j.ok && !subj.lap) pass = true;
          }
          sketched.sort((a, b) => a.cost - b.cost);
          for (let m = 0; m < Math.min(FRAME_SCREEN, sketched.length); m++) {
            const c = sketched[m], j = judgeMove(track, shot, c.ey, c.lk, null, onRoad, subj, SCREEN_AT, false, cands[c.i].fovK, false, round === 1);
            screened.push({ i: c.i, cost: Math.max(j.cost + lapLoss(ref, j, cands[c.i]), c.cost) + c.i * FRAME_TIE * 0.2 + (j.ok ? 0 : FRAME_MISS) });
          }
          screened.sort((a, b) => a.cost - b.cost);
          for (let m = 0; m < Math.min(FRAME_PLANS, screened.length); m++) {
            const i = screened[m].i, src = { eye: cands[i], look: aimed(track, cands[i], planLook(track, cands[i], shot.look), cands[i].aim) };
            let n = n0, c = at(src, k);
            while (c.fast && n < PAN_RUNGS && canSqueeze(src)) c = at(src, Math.pow(PAN_K, ++n));
            const f = finish(c);
            const j = judgeMove(track, shot, f.pe.eye, f.look, f.pe.prof, onRoad, subj, FRAME_AT, false, cands[i].fovK, round === 1, round === 1);
            tried.push(j);
            const cost = j.cost + i * FRAME_TIE * 0.2 + (j.ok ? 0 : FRAME_MISS) + (f.fast ? FRAME_FAST : 0) + lapLoss(ref, j, cands[i]);
            if (cost < bestCost) { bestCost = cost; fin = f; framing = i; fovK = cands[i].fovK; best = j; picked = cands[i]; }
            if (j.ok && !subj.lap) break;
          }
        }
      }
      if (subj.lap) {
        const lv = level(track, shot, frac, fin, onRoad, subj, fovK, best, picked, lapRef);
        if (lv) { fin = lv.f; tried.push(lv.j); }
      }
    }
    plan = { eye: fin.pe.eye, look: fin.look, prof: fin.pe.prof, onRoad: onRoad, frac: frac, secs: secs, squeeze: fin.k, slot: slot, rows: rows,
             framing: framing, fovK: fovK, fast: !!fin.fast, tried: tried };
    cache.set(shot, plan);
    return plan;
  }
  function liftAt(prof, e) {
    let best = 0;
    for (let j = 0; j <= LIFT_N; j++) {
      if (!(prof[j] > 0)) continue;
      const f = 1 - Math.abs(e - j / LIFT_N) / LIFT_W;
      if (f > 0 && prof[j] * f > best) best = prof[j] * f;
    }
    return best;
  }

  const WHEN_KEYS = ["night", "wet"];
  function isNight(info) {
    const tod = info && info.tod, track = info && (info.track || info.def);
    return tod === "night" || (tod === "default" && !!(track && track.night));
  }
  function isWet(info) {
    const w = info && info.weather;
    return w === "wet" || w === "rain" || w === "storm";
  }
  function whenMatch(when, info) {
    if (when == null) return true;
    if (typeof when !== "object" || Array.isArray(when)) return false;
    if (when.night != null && !!when.night !== isNight(info)) return false;
    if (when.wet != null && !!when.wet !== isWet(info)) return false;
    return true;
  }
  function whenScore(when) {
    if (!when || typeof when !== "object") return 0;
    let n = 0;
    for (let i = 0; i < WHEN_KEYS.length; i++) if (when[WHEN_KEYS[i]] != null) n++;
    return n;
  }
  function isStockShot(shot) {
    if (!shot || !shot.id) return false;
    const stock = DEFAULT.find((s) => s && s.id === shot.id);
    if (!stock) return false;
    const key = (s) => JSON.stringify({ eye: s.eye, look: s.look, fov: s.fov, dur: s.dur, ease: s.ease });
    return key(shot) === key(stock);
  }
  function select(list, info) {
    if (!Array.isArray(list) || !list.length) return list || [];
    const session = info || {};
    let extras = null;
    try {
      if (typeof FlybyOverrides !== "undefined" && FlybyOverrides && Array.isArray(FlybyOverrides.WHEN))
        extras = FlybyOverrides.WHEN;
    } catch (_) { extras = null; }
    const catalog = list.slice();
    if (extras && extras.length && !list.some((s) => s && s.when)) {
      for (let i = 0; i < extras.length; i++) catalog.push(extras[i]);
    }
    const order = [], best = new Map();
    for (let i = 0; i < catalog.length; i++) {
      const shot = catalog[i];
      if (!shot || typeof shot !== "object") continue;
      if (!whenMatch(shot.when, session)) continue;
      const id = shot.id || ("#" + i);
      if (!best.has(id)) order.push(id);
      const prev = best.get(id);
      if (!prev) { best.set(id, shot); continue; }
      if (!prev.when && !isStockShot(prev) && shot.when) continue;
      if (whenScore(shot.when) > whenScore(prev.when)) best.set(id, shot);
    }
    return order.map((id) => best.get(id));
  }
  let _session = null;
  function setSession(info) { _session = info && typeof info === "object" ? info : null; }
  function sessionInfo() { return _session || {}; }
  const VARY_ROLES = ["first", "lore", "slowest", "fastest", "mid", "late"];
  function vary(list, seed, fit) {
    list = select(list || DEFAULT, sessionInfo());
    if (fit !== false) list = list.filter(fitsGrid);
    let h = (seed >>> 0) || 1;
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const used = {}, swapLm = rnd() < 0.35;
    return list.map((shot) => {
      if (/^grid/.test(shot.id || "")) return shot;
      const o = JSON.parse(JSON.stringify(shot));
      const at = o.eye[0] && o.eye[0].at;
      if (at === "centre") { const j = (rnd() - 0.5) * 0.5; o.eye.forEach((p) => { p.bear = (p.bear || 0) + j; }); }
      if (at === "landmark" && swapLm) [o.eye, o.look].forEach((a) => a.forEach((p) => { p.rank = (p.rank | 0) === 0 ? 1 : 0; }));
      if (at === "corner") {
        const free = VARY_ROLES.filter((r) => !used[r]);
        const n = free.length ? free[Math.floor(rnd() * free.length)] : o.eye[0].n;
        used[n] = true;
        [o.eye, o.look].forEach((a) => a.forEach((p) => { if (p.at === "corner") p.n = n; }));
      } else if (rnd() < 0.4) { o.eye.reverse(); o.look.reverse(); o.fov.reverse(); }
      return o;
    });
  }

  function reset() { _lastIdx = -1; _airCorner = 0; }

  return {
    solve, shotAt, warmProgress, airCorner, reset, clearEye, floorEye, insideProp, blockers, isSolid, onRoadPose,
    landmarks, bounds, lmBase, landmarkFallback, planShot,
    anchorS, posePoint, cornerS, cornerSide, cornerTurn,
    poseFromWorld, shotFromView, select, setSession, whenMatch, isNight, isWet, vary, setPlayerSlot, slotIndex, slotKnown, withoutSlot, withoutGrid, bindCorners, warm, cancelWarm, setDuration, planSteps,
    boundaries, presentation, swayAt, setHeroCars, driveHero, rollHero, gridProgress,
    DEFAULT, GRID_SHOTS,
    FAR, FOG, NEAR, FENCE, REF_S, PAN_MAX, PARA_MAX,
  };
})();
Object.freeze(FlybySeq);
