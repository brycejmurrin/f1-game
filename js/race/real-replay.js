const RealReplay = (function () {
  "use strict";

  const clamp = M4.clamp;

  const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
  const LEAD_S = 8;
  const HOLD_S = 5;
  const RADIO_LINK_S = 15;
  const CAPTION_S = 3;
  const SPOKEN_RATE_MAX = 2;
  const ENDED_S = 3;
  const FINISH_S = 6;
  const MAX_X = 3;
  const REEL_KINDS = { pass: 1, out: 1, sc: 1, ending: 1, green: 1, fastest: 1, pit: 1 };
  const REEL_PIT_TOP = 8;
  const KEY_SPEED_UP = "Equal", KEY_SPEED_DOWN = "Minus", KEY_NEXT = "Period", KEY_PREV = "Comma", KEY_SKIP = "KeyN";

  const ICP_ITERS = 25;
  function fitFrame(track, pts) {
    const n = track.n, total = track.total;
    const stepC = Math.max(1, Math.ceil(n / 800)), stepP = Math.max(1, Math.ceil(pts.length / 300));
    const C = [];
    for (let i = 0; i < n; i += stepC) C.push([track.px[i], track.pz[i], i * total / n]);
    const S = [];
    for (let i = 0; i < pts.length; i += stepP) S.push([pts[i][0], pts[i][1]]);
    if (S.length < 8 || C.length < 8) return null;
    const centroid = (P) => { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; };
    function index(ids, axis) {
      if (!ids.length) return null;
      ids.sort((a, b) => C[a][axis] - C[b][axis] || a - b);
      const mid = ids.length >> 1;
      return { i: ids[mid], axis, left: index(ids.slice(0, mid), 1 - axis), right: index(ids.slice(mid + 1), 1 - axis) };
    }
    const root = index(C.map((_, i) => i), 0);
    let nearest = 0, nearestD2 = Infinity;
    function visit(node, x, y) {
      if (!node) return;
      const p = C[node.i], dx = p[0] - x, dy = p[1] - y, d = dx * dx + dy * dy;
      if (d < nearestD2 || (d === nearestD2 && node.i < nearest)) { nearestD2 = d; nearest = node.i; }
      const delta = node.axis ? y - p[1] : x - p[0];
      const first = delta <= 0 ? node.left : node.right, other = delta <= 0 ? node.right : node.left;
      visit(first, x, y);
      if (!(delta * delta > nearestD2)) visit(other, x, y);
    }
    const near = (x, y) => { nearest = 0; nearestD2 = Infinity; visit(root, x, y); return nearest; };
    const cs = centroid(S), ct = centroid(C);
    const mapper = (refl, th, tx, ty) => {
      const cos = Math.cos(th), sin = Math.sin(th);
      return (p) => { const x = p[0], y = refl * p[1]; return [cos * x - sin * y + tx, sin * x + cos * y + ty]; };
    };
    let best = null;
    for (const refl of [1, -1]) for (let k = 0; k < 8; k++) {
      let th = k * Math.PI / 4;
      let cos = Math.cos(th), sin = Math.sin(th);
      const cs2 = [cs[0], refl * cs[1]];
      let tx = ct[0] - (cos * cs2[0] - sin * cs2[1]), ty = ct[1] - (sin * cs2[0] + cos * cs2[1]);
      let map = mapper(refl, th, tx, ty), rms = Infinity;
      for (let it = 0; it < ICP_ITERS; it++) {
        const T = S.map((p) => { const q = map(p); return C[near(q[0], q[1])]; });
        const ctp = centroid(T);
        let a11 = 0, a12 = 0, a21 = 0, a22 = 0;
        for (let i = 0; i < S.length; i++) {
          const ax = S[i][0] - cs[0], ay = refl * S[i][1] - refl * cs[1], cx = T[i][0] - ctp[0], cy = T[i][1] - ctp[1];
          a11 += cx * ax; a12 += cx * ay; a21 += cy * ax; a22 += cy * ay;
        }
        th = Math.atan2(a21 - a12, a11 + a22); cos = Math.cos(th); sin = Math.sin(th);
        tx = ctp[0] - (cos * cs2[0] - sin * cs2[1]); ty = ctp[1] - (sin * cs2[0] + cos * cs2[1]);
        map = mapper(refl, th, tx, ty);
        let err = 0;
        for (let i = 0; i < S.length; i++) { const q = map(S[i]); err += (q[0] - T[i][0]) ** 2 + (q[1] - T[i][1]) ** 2; }
        const r = Math.sqrt(err / S.length);
        if (Math.abs(r - rms) < 1e-3) { rms = r; break; }
        rms = r;
      }
      let fwd = 0, back = 0, sPrev = null;
      for (const p of S) { const q = map(p); const s = C[near(q[0], q[1])][2]; if (sPrev != null) { let d = s - sPrev; if (d > total / 2) d -= total; else if (d < -total / 2) d += total; if (d > 0.5) fwd++; else if (d < -0.5) back++; } sPrev = s; }
      if (back > fwd) continue;
      if (!best || rms < best.rms) best = { refl, th, tx, ty, rms, n: S.length };
    }
    return best;
  }
  function mapPoint(fit, x, y, out) {
    const yy = fit.refl * y, cos = Math.cos(fit.th), sin = Math.sin(fit.th);
    out = out || [0, 0];
    out[0] = cos * x - sin * yy + fit.tx; out[1] = sin * x + cos * yy + fit.ty;
    return out;
  }

  function trackTrace(track, fit, raw, lapStart) {
    const n = raw.length / 3 | 0, total = track.total;
    const t = new Float32Array(n), prog = new Float32Array(n), x = new Float32Array(n);
    const cos = Math.cos(fit.th), sin = Math.sin(fit.th);
    let hint = null, p = 0, speed = 0;
    const radius = 16 * total / track.n;
    const arcDelta = (s) => { const d = s - hint; return d - total * Math.round(d / total); };
    for (let i = 0; i < n; i++) {
      const xx = raw[i * 3 + 1], yy = fit.refl * raw[i * 3 + 2];
      const wx = cos * xx - sin * yy + fit.tx, wz = sin * xx + cos * yy + fit.ty;
      let pr = Tracks.project(track, wx, wz, hint);
      const dt = i ? raw[i * 3] - raw[(i - 1) * 3] : 0;
      if (i && dt > 0 && radius > 0 && (pr.dist > 8 || Math.abs(arcDelta(pr.s)) >= radius * 0.85 || speed * dt > radius)) {
        const expected = speed * dt;
        const score = (q) => q.dist * q.dist + Math.pow((arcDelta(q.s) - expected) * 0.02, 2);
        const predicted = Tracks.project(track, wx, wz, hint + expected);
        if (score(predicted) < score(pr)) pr = predicted;
        let best = score(pr);
        const ahead = Math.min(total / 2 - radius, dt * 120 + radius);
        for (let offset = -Math.min(30, dt * 10); offset <= ahead; offset += radius * 1.5) {
          const candidate = Tracks.project(track, wx, wz, hint + offset);
          const value = score(candidate);
          if (value < best) { best = value; pr = candidate; }
        }
        const refined = Tracks.project(track, wx, wz, pr.s);
        if (score(refined) < best) pr = refined;
      }
      if (i === 0) p = pr.s > total / 2 ? pr.s - total : pr.s;
      else { const d = arcDelta(pr.s); p += d; if (dt > 0) speed = clamp(d / dt, 0, 120); }
      hint = pr.s;
      t[i] = raw[i * 3]; prog[i] = p; x[i] = pr.lat;
    }
    if (n) {
      let i0 = 0;
      while (i0 < n - 1 && t[i0] < 0) i0++;
      const m = ((prog[i0] % total) + total) % total;
      let L = -1;
      if (Array.isArray(lapStart)) for (let k = 1; k < lapStart.length; k++) if (lapStart[k] != null && lapStart[k] <= t[i0]) L = k;
      let want = m > total / 2 ? m - total : m;
      if (L >= 1) {
        const next = lapStart[L + 1], prev = lapStart[L - 1];
        const dur = next != null && next > lapStart[L] ? next - lapStart[L] : prev != null && lapStart[L] > prev ? lapStart[L] - prev : 0;
        const guess = L * total + (dur > 0 ? clamp((t[i0] - lapStart[L]) / dur, 0, 1) * total : 0);
        want = m + total * Math.round((guess - m) / total);
      }
      const shift = prog[i0] - want;
      if (shift) for (let i = 0; i < n; i++) prog[i] -= shift;
    }
    return { t, prog, x, n, end: n ? t[n - 1] : 0 };
  }
  function fromTrack(o) {
    const t = Float32Array.from(o.t), prog = Float32Array.from(o.prog), x = Float32Array.from(o.x || new Array(t.length).fill(0));
    return { t, prog, x, n: t.length, end: t.length ? t[t.length - 1] : 0 };
  }
  function sampleAt(tr, tt, out) {
    out = out || {};
    const n = tr.n;
    out.before = false; out.ended = false; out.speed = 0;
    if (!n) { out.ended = true; out.prog = 0; out.x = 0; return out; }
    if (tt <= tr.t[0]) { out.before = tt < tr.t[0]; out.prog = tr.prog[0]; out.x = tr.x[0]; return out; }
    if (tt >= tr.end) { out.ended = tt > tr.end + ENDED_S; out.prog = tr.prog[n - 1]; out.x = tr.x[n - 1]; return out; }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr.t[mid] <= tt) lo = mid; else hi = mid; }
    const dt = tr.t[hi] - tr.t[lo] || 1e-3, a = (tt - tr.t[lo]) / dt;
    out.prog = tr.prog[lo] + (tr.prog[hi] - tr.prog[lo]) * a;
    out.x = tr.x[lo] + (tr.x[hi] - tr.x[lo]) * a;
    out.speed = Math.max(0, (tr.prog[hi] - tr.prog[lo]) / dt);
    if (dt > ENDED_S * 3) { out.speed = 0; out.prog = tr.prog[lo]; out.x = tr.x[lo]; }
    return out;
  }

  function highlightsFor(script) {
    const out = [];
    const byNum = {};
    for (const d of script.drivers || []) byNum[d.num] = d;
    const code = (num) => (byNum[num] ? byNum[num].code : "#" + num);
    const compoundAfter = (d, lap) => { const st = (d.stints || []).find((s) => s.from === lap + 1); return st ? st.c : ""; };
    for (const p of script.passes || []) if (p.t != null) out.push({ t: p.t, lap: p.lap, kind: "pass", num: p.by, over: p.over, pos: p.pos, text: code(p.by) + " PASSES " + code(p.over) + (p.pos ? " FOR P" + p.pos : "") });
    for (const d of script.drivers || []) {
      (d.pits || []).forEach((lap, i) => { const t = d.pitT && d.pitT[i]; if (t != null) { const c = compoundAfter(d, lap); out.push({ t, lap, kind: "pit", num: d.num, pos: d.pos, text: d.code + " PITS" + (c ? " · " + c : "") }); } });
      if (d.dnf && !d.dns && !d.dsq && d.outT != null) out.push({ t: d.outT, lap: (d.lapsDone | 0) + 1, kind: "out", num: d.num, text: d.code + " OUT" + (d.outWhere ? " · " + d.outWhere : "") });
    }
    for (const w of script.cautions || []) {
      const cause = w.cause || (w.level >= 4 ? "RED FLAG" : w.level === 3 ? "SAFETY CAR" : "VIRTUAL SAFETY CAR");
      if (w.tFrom != null) out.push({ t: w.tFrom, lap: w.from, kind: "sc", num: null, level: w.level, text: cause });
      if (w.tEnding != null) out.push({ t: w.tEnding, lap: w.to, kind: "ending", num: null, text: cause + " IN THIS LAP" });
      if (w.tTo != null) out.push({ t: w.tTo, lap: w.to, kind: "green", num: null, text: "GREEN FLAG" });
    }
    if (script.fastest && script.fastest.t != null) out.push({ t: script.fastest.t, lap: script.fastest.lap, kind: "fastest", num: script.fastest.num, dur: script.fastest.dur, text: "FASTEST LAP · " + code(script.fastest.num) + " " + fmtLap(script.fastest.dur) });
    for (const r of script.radio || []) if (r.t != null) out.push({ t: r.t, lap: r.lap || 0, kind: "radio", num: r.num, url: r.url, text: "RADIO · " + code(r.num) });
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  function reelFor(list) {
    const reel = [];
    for (const h of list) {
      if (!REEL_KINDS[h.kind]) continue;
      if (h.kind === "pit" && !(h.pos != null && h.pos <= REEL_PIT_TOP)) continue;
      const last = reel[reel.length - 1];
      if (last && h.t - last.t < HOLD_S && last.kind === h.kind) continue;
      reel.push(h);
    }
    return reel;
  }
  function eventCursor(list, T) {
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].t < T - CAPTION_S) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function fmtLap(t) { if (!(t > 0)) return "—"; const ms = Math.round(t * 1000), m = Math.floor(ms / 60000), s = (ms - m * 60000) / 1000; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3); }

  function buildTraces(track, script, traces) {
    const out = new Map();
    if (traces.frame === "track") {
      for (const k of Object.keys(traces.cars || {})) out.set(+k, fromTrack(traces.cars[k]));
      return { fit: null, byNum: out };
    }
    let fit = traces.fit || null;
    if (!fit) {
      const ref = (script.drivers || []).slice().sort((a, b) => (a.pos || 99) - (b.pos || 99)).find((d) => traces.cars[d.num] && traces.cars[d.num].length > 300);
      if (!ref) return null;
      const raw = traces.cars[ref.num];
      let from = 60, to = 180;
      if (Array.isArray(ref.lapStart) && Array.isArray(ref.laps) && script.fastest && script.fastest.num === ref.num && ref.lapStart[script.fastest.lap - 1] != null) {
        from = ref.lapStart[script.fastest.lap - 1]; to = from + (ref.laps[script.fastest.lap - 1] || 120);
      } else if (Array.isArray(ref.lapStart) && ref.lapStart[2] != null && ref.lapStart[3] != null) { from = ref.lapStart[2]; to = ref.lapStart[3]; }
      const pts = [];
      for (let i = 0; i < raw.length; i += 3) if (raw[i] >= from && raw[i] <= to) pts.push([raw[i + 1], raw[i + 2]]);
      fit = fitFrame(track, pts);
      if (!fit) return null;
      Log.info("game", "RealReplay.fit ref=" + ref.code + " pts=" + pts.length + " rms=" + fit.rms.toFixed(2) + "m rot=" + (fit.th * 180 / Math.PI).toFixed(1) + " refl=" + fit.refl);
    }
    for (const k of Object.keys(traces.cars || {})) { const d = (script.drivers || []).find((x) => +x.num === +k); out.set(+k, trackTrace(track, fit, traces.cars[k], d && d.lapStart)); }
    return { fit, byNum: out };
  }

  function create(G) {
    let run = null;
    let captionGeneration = 0;
    let transport = null;
    const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    const at = {};
    const bc = typeof Broadcast !== "undefined" ? Broadcast.create(G, { follow: (w) => follow(w), setFollow: (c) => setFollow(c), cameraOwner: () => run && run.cameraOwner }) : null;
    const bcState = {
      get script() { return run.script; }, get T() { return run.T; }, get speed() { return run.speed; },
      get list() { return run.list; }, get reel() { return !!run.reel; }, get follow() { return run.follow; },
      get followNum() { const f = run.follow && run.cars.get(run.follow); return f ? f.num : null; },
      isOut: (num) => { for (const [c, f] of run.cars) if (f.num === num) return !f.tr || !!(f.parked && c.retired); return true; },
      carOf: (num) => { for (const [c, f] of run.cars) if (f.num === num) return c; return null; },
      codeOf: (c) => { const f = run.cars.get(c); return f && f.d ? f.d.code : null; },
      colourOf: (num) => { for (const [c, f] of run.cars) if (f.num === num) return c.team && G.cssCol ? G.cssCol(c.team.color) : ""; return ""; },
      running: () => [...run.cars.keys()].filter((c) => run.cars.get(c).tr && !c.retired).sort((a, b) => b.prog - a.prog).map((c) => ({ key: c, prog: c.prog, speed: c.speed })),
    };

    function start(o) {
      stop();
      const script = o.script, track = G.track;
      if (!script || !track || !o.traces) return false;
      const built = buildTraces(track, script, o.traces);
      if (!built) { Log.warn("game", "RealReplay.start: the positions do not fit " + script.trackId); return false; }
      const cars = new Map();
      for (const c of G.cars) {
        const d = o.seats.get(c);
        const tr = d ? built.byNum.get(d.num) : null;
        cars.set(c, { num: d ? d.num : null, d, tr: tr && tr.n ? tr : null, posed: false, parked: false });
      }
      if (![...cars.values()].some((f) => f.tr)) return false;
      const traces = [...cars.values()].filter((f) => f.tr).map((f) => f.tr);
      const startT = Math.max(-30, Math.min(0, ...traces.map((tr) => tr.t[0])));
      const duration = Math.max(0, ...traces.map((tr) => tr.end));
      const list = highlightsFor(script).filter((h) => {
        if (h.t < startT || h.t > duration) return false;
        if (h.num == null) return true;
        const tr = built.byNum.get(h.num);
        return !!(tr && tr.n && h.t >= tr.t[0] && h.t <= tr.end);
      });
      const events = reelFor(list), reel = o.reel && events.length ? events : null;
      let T = 0;
      const lead = (script.drivers || []).find((d) => d.pos === 1) || (script.drivers || [])[0];
      if (o.startLap > 1 && lead && Array.isArray(lead.lapStart) && lead.lapStart[o.startLap - 1] != null) T = lead.lapStart[o.startLap - 1];
      if (reel && reel.length) T = reel[0].t - LEAD_S;
      T = clamp(T, startT, duration);
      run = { script, cars, T, speed: o.rate > 0 ? o.rate : 1, paused: false, follow: null, reel, reelIdx: 0, list, eventCursor: eventCursor(list, T), fit: built.fit, finished: false, onKey: null };
      run.startT = startT; run.duration = duration; run.events = events; run.onTimeline = o.onTimeline;
      run.savedCamera = G.camMode;
      run.cameraOwner = {};
      const modes = typeof CamModes !== "undefined" ? CamModes.CAM_MODES : [];
      const auto = o.camera === "auto";
      const camera = modes.findIndex((m) => m.id === (auto ? Broadcast.SHOTS[0] : o.camera));
      if (G.setCamMode) G.setCamMode(camera >= 0 ? camera : G.camMode, { persist: false, owner: run.cameraOwner, priority: 10 });
      pose(true);
      if (run.onTimeline) run.onTimeline(run.T);
      let follow = null;
      for (const [c, f] of cars) if (f.tr && f.d && f.d.code === o.follow) follow = c;
      if (!follow) for (const [c, f] of cars) if (f.tr && !follow) follow = c;
      setFollow(follow);
      if (bc) bc.start({ auto, tower: o.tower !== false });
      if (reel && reel.length) cutTo(reel[0]);
      if (G.raceRadio && G.raceRadio.setWatching) G.raceRadio.setWatching({
        nameOf: (c) => { const f = run && run.cars.get(c); return f && f.d && typeof RadioLines !== "undefined" ? RadioLines.surname(f.d) : null; },
        paused: () => !!(run && run.paused),
      });
      run.onKey = (e) => onKey(e);
      try { window.addEventListener("keydown", run.onKey, true); } catch (e) {  }
      pose();
      if (transport) transport.start();
      Log.info("game", "RealReplay.start T=" + T.toFixed(1) + " cars=" + [...cars.values()].filter((f) => f.tr).length + " reel=" + (reel ? reel.length : 0) + " follow=" + (follow ? follow.code : "-"));
      return true;
    }

    function stop() {
      if (!run) return;
      captionGeneration++;
      if (transport) transport.stop();
      try { if (run.onKey) window.removeEventListener("keydown", run.onKey, true); } catch (e) {  }
      if (bc) bc.stop();
      if (G.raceRadio && G.raceRadio.setWatching) G.raceRadio.setWatching(null);
      if (G.setCamMode && run.savedCamera != null) G.setCamMode(run.savedCamera, { persist: false, owner: run.cameraOwner, release: true });
      run = null;
      Log.info("game", "RealReplay.stop");
    }

    function owns(c) { return !!run && run.cars.has(c); }

    function runningOrder() { return [...run.cars.keys()].filter((c) => run.cars.get(c).tr && !c.retired).sort((a, b) => b.prog - a.prog); }

    function setFollow(c, snap = true) {
      if (!run || !c) return;
      run.follow = c;
      run.followRank = runningOrder().indexOf(c);
      if (G.followCar) G.followCar(c);
      if (snap && bc) bc.refresh(bcState);
      if (snap && G.snapGameCam) G.snapGameCam();
      if (G.refreshHud) G.refreshHud(true);
    }
    function follow(want) {
      if (!run) return null;
      const running = runningOrder();
      if (!running.length) return null;
      let c = null;
      if (typeof want === "string") c = running.find((x) => run.cars.get(x).d && run.cars.get(x).d.code === want) || null;
      else {
        const i = running.indexOf(run.follow), d = want | 0;
        const at = i >= 0 ? i + d : (run.followRank >= 0 ? run.followRank + (d > 0 ? d - 1 : d) : 0);
        c = running[(at % running.length + running.length) % running.length];
      }
      if (c) setFollow(c);
      return c ? c.code : null;
    }
    function setSpeed(v) { if (run && v > 0) { run.speed = clamp(v, SPEEDS[0], SPEEDS[SPEEDS.length - 1]); } return run ? run.speed : 0; }
    function stepSpeed(dir) {
      if (!run) return 0;
      let i = SPEEDS.findIndex((s) => s >= run.speed - 1e-6); if (i < 0) i = SPEEDS.length - 1;
      return setSpeed(SPEEDS[clamp(i + dir, 0, SPEEDS.length - 1)]);
    }
    function seek(t) {
      seekTo(t, null);
    }
    function seekTo(t, highlight) {
      if (!run || !Number.isFinite(t)) return;
      const T = clamp(t, run.startT, run.duration);
      if (run.reel) {
        const k = highlight ? run.reel.indexOf(highlight) : -1;
        const i = k >= 0 ? k : run.reel.findIndex((h) => h.t + HOLD_S >= T);
        run.reelIdx = i < 0 ? Math.max(0, run.reel.length - 1) : i;
        if (!highlight && i >= 0) highlight = run.reel[i];
      }
      reposition(T, highlight, true);
    }
    function reposition(t, highlight, paint = false, continuous = false) {
      if (!continuous) {
        captionGeneration++;
        run.T = t; run.eventCursor = eventCursor(run.list, t); run.radio = null;
        pose(true);
        if (G.raceT != null) G.raceT = Math.max(0, run.T);
        if (run.onTimeline) run.onTimeline(run.T);
        if (bc) bc.resetTiming();
      }
      if (highlight) {
        const c = carOfNum(highlight.num);
        const picture = bc && bc.status();
        if (c && !c.retired && !(picture && (picture.locked || picture.manual))) setFollow(c, false);
        else if (bc && bc.autoOn() && (!run.follow || run.follow.retired)) {
          let next = null;
          for (const [car, f] of run.cars) if (f.tr && !car.retired && (!next || car.prog > next.prog)) next = car;
          if (next) setFollow(next, false);
        }
        if (bc) bc.onCut(highlight.kind);
      }
      if (!continuous && G.raceRadio && G.raceRadio.resetTimeline) G.raceRadio.resetTimeline();
      if (bc) bc.refresh(bcState);
      if (G.refreshHud) G.refreshHud(true);
      if (G.snapGameCam) G.snapGameCam(paint);
      if (transport) transport.paint();
    }
    function setPaused(v) {
      if (!run) return false;
      run.paused = !!v;
      if (transport) transport.paint();
      return run.paused;
    }
    function setAuto(v) {
      if (!bc || !run) return false;
      if (v && bc.autoOn()) return true;
      const enabled = bc.setAuto(v);
      if (enabled) {
        bc.onCut(null);
        bc.refresh(bcState);
        if (G.snapGameCam) G.snapGameCam(!!G.paused);
      }
      return enabled;
    }
    function seekEvent(index) {
      const h = run && Number.isInteger(index) && run.events[index];
      if (!h) return null;
      seekTo(h.t - LEAD_S, h);
      return h.text;
    }
    function eventStep(dir) {
      if (!run) return null;
      const list = run.events;
      const h = dir < 0 ? list.slice().reverse().find((e) => Math.max(run.startT, e.t - LEAD_S) < run.T - 1) : list.find((e) => Math.max(run.startT, e.t - LEAD_S) > run.T + 1);
      if (!h) return null;
      seekTo(h.t - LEAD_S, h);
      return h.text;
    }

    function cutTo(h) {
      reposition(clamp(h.t - LEAD_S, run.startT, run.duration), h);
    }
    function skip() { if (!run || !run.reel) return; run.reelIdx++; if (run.reelIdx < run.reel.length) cutTo(run.reel[run.reelIdx]); else finish(); }

    function advanceReel() {
      do { run.reelIdx++; }
      while (run.reelIdx < run.reel.length && run.T > Math.min(run.duration, run.reel[run.reelIdx].t + HOLD_S));
      if (run.reelIdx >= run.reel.length) { finish(); return; }
      const h = run.reel[run.reelIdx];
      const lead = clamp(h.t - LEAD_S, run.startT, run.duration);
      if (lead > run.T) {
        const cursor = run.eventCursor;
        cutTo(h);
        run.eventCursor = Math.max(cursor, run.eventCursor);
      } else reposition(run.T, h, false, true);
    }

    function onKey(e) {
      if (!run || G.state !== "race" || G.paused || G.photoMode || !e || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target, tag = t && t.tagName;
      const ctl = t && typeof t.closest === "function" && t.closest(".watch-transport") &&
        (tag === "BUTTON" || (tag === "INPUT" && t.type === "range"));
      if (ctl ? (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter")
          : (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON")) return;
      let used = true;
      if (e.code === KEY_NEXT) { follow(-1); if (bc) bc.manual(); }
      else if (e.code === KEY_PREV) { follow(+1); if (bc) bc.manual(); }
      else if (e.code === KEY_SPEED_UP) stepSpeed(+1);
      else if (e.code === KEY_SPEED_DOWN) stepSpeed(-1);
      else if (e.code === KEY_SKIP && run.reel) skip();
      else if (e.code === "Space") setPaused(!run.paused);
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); if (G.announce && e.code !== KEY_SKIP) G.announce(followCode() + " · " + run.speed + "×", 1.2, "info"); }
    }

    function followCode() {
      const f = run.follow && run.cars.get(run.follow);
      return f && f.d && f.d.code ? f.d.code : (run.follow ? run.follow.code : "");
    }

    function idle(c) {
      c.speed = 0;
      if (typeof PhysicsConsts !== "undefined" && PhysicsConsts.IDLE_RPM > 0) c.rpm = PhysicsConsts.IDLE_RPM;
    }
    function pose(discontinuous) {
      const track = G.track, total = track.total;
      for (const [c, f] of run.cars) {
        if (!f.tr) { if (!f.parked) { f.parked = true; c.retired = true; c.dnf = f.d && f.d.dns ? "dns" : f.d && f.d.dnf ? "dnf" : null; idle(c); } continue; }
        sampleAt(f.tr, run.T, at);
        if (at.before && !discontinuous) { if (f.posed) { idle(c); } continue; }
        if (at.ended && !discontinuous) { if (!f.parked) { f.parked = true; c.retired = true; c.dnf = f.d && f.d.dnf ? "dnf" : null; idle(c); c.dnfAt = null; } continue; }
        f.posed = true; f.parked = false; c.dnf = null;
        const lap = Math.floor(at.prog / total) + 1;
        const s = at.prog - (lap - 1) * total;
        Tracks.sample(track, s, smp);
        const x = clamp(at.x, -(smp.hw + MAX_X), smp.hw + MAX_X);
        c.lap = lap; c.prog = at.prog; c.s = s; c.x = x; c.xVis = x;
        c.speed = at.speed; c.replayRate = run.speed;
        const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;
        c.px = smp.p[0] + smp.r[0] / rl * x; c.pz = smp.p[2] + smp.r[2] / rl * x;
        c.head = Math.atan2(smp.t[0], smp.t[2]);
        if (discontinuous || c.rPrevPx === undefined) { c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevHead = c.head; }
        c.retired = at.ended; c.finished = false;
        if (at.ended) { f.parked = true; c.dnf = f.d && f.d.dnf ? "dnf" : null; idle(c); c.dnfAt = null; }
        const v = at.speed / (G.vTop ? G.vTop() : 90);
        c.gear = v > 0.7 ? 8 : v > 0.45 ? 6 : v > 0.2 ? 4 : 2;
        c.braking = false;
      }
    }

    function fire() {
      const list = run.list;
      while (run.eventCursor < list.length) {
        const h = list[run.eventCursor];
        if (h.t > run.T) break;
        run.eventCursor++;
        if (h.t < run.T - CAPTION_S) continue;
        if (h.kind === "radio") { caption(h.text, "info"); run.radio = h; continue; }
        const rr = G.raceRadio;
        if (rr && rr.replayEvent && rr.commentates && rr.commentates() && run.speed <= SPOKEN_RATE_MAX) {
          if (rr.replayEvent(h, carOfNum(h.num), h.over != null ? carOfNum(h.over) : null)) continue;
        }
        caption("L" + h.lap + " · " + h.text, "race");
      }
    }
    function caption(text, kind) {
      const generation = captionGeneration;
      if (G.announce) G.announce(text, CAPTION_S, kind, () => !!run && !run.finished && generation === captionGeneration);
    }
    function carOfNum(num) {
      if (num == null) return null;
      for (const [c, f] of run.cars) if (f.num === num) return c;
      return null;
    }
    function finish() {
      if (!run || run.finished) return;
      run.finished = true;
      for (const [c, f] of run.cars) {
        const d = f.d;
        c.speed = 0; c.dnfAt = null; c.finished = false; c.finishT = null; c.penalty = 0; c.dsq = null;
        c.retired = !d || !!(d.dnf || d.dns);
        c.dnf = !d || d.dns ? "dns" : d.dnf ? "dnf" : null;
        if (!d) continue;
        if (typeof d.code === "string" && d.code.trim()) c.code = d.code.trim();
        if (typeof d.name === "string" && d.name.trim()) c.name = d.name.trim();
        if (d.dsq) { c.retired = false; c.dnf = null; c.dsq = "real race classification"; }
        const done = d.lapsDone > 0 ? d.lapsDone | 0 : (d.laps || []).filter((t) => t > 0).length;
        if (done) c.lap = done + 1;
        if (!c.retired && !d.dsq && d.pos > 0) {
          c.finished = true;
          const last = done - 1, starts = d.lapStart || [], laps = d.laps || [];
          c.finishT = last >= 0 && starts[last] != null && laps[last] > 0 ? starts[last] + laps[last] : null;
        }
      }
      const order = [...run.cars.keys()].sort((a, b) => {
        const da = run.cars.get(a).d, db = run.cars.get(b).d;
        const pa = da && da.pos > 0 ? da.pos : Infinity, pb = db && db.pos > 0 ? db.pos : Infinity;
        return pa - pb || (b.prog || 0) - (a.prog || 0);
      });
      Log.info("game", "RealReplay.finish T=" + run.T.toFixed(1));
      if (G.endRace) G.endRace(order);
    }

    function tick(dt) {
      if (!run || run.finished) return;
      if (G.state !== "race" && G.state !== "count") return;
      if (transport) transport.tick(dt);
      if (run.paused) { for (const [c, f] of run.cars) if (f.tr && !c.retired) c.speed = 0; return; }
      if (G.state === "race") run.T += dt * run.speed;
      pose();
      { const i = runningOrder().indexOf(run.follow); if (i >= 0) run.followRank = i; }
      if (run.onTimeline) run.onTimeline(run.T);
      if (G.state !== "race") return;
      fire();
      if (bc) bc.tick(dt, bcState);
      if (G.raceT != null) G.raceT = Math.max(0, run.T);
      if (run.reel) {
        const h = run.reel[run.reelIdx];
        if (!h || run.T > Math.min(run.duration, h.t + HOLD_S)) advanceReel();
        return;
      }
      if (run.T > run.duration + FINISH_S) finish();
    }

    function status() {
      if (!run) return null;
      const followed = run.follow && run.cars.get(run.follow);
      return { T: +run.T.toFixed(2), duration: run.duration, paused: run.paused, speed: run.speed, follow: followed && followed.d ? followed.d.code : null, reel: run.reel ? run.reel.length : 0, reelIdx: run.reelIdx,
               highlights: run.list.length, fit: run.fit ? { rms: +run.fit.rms.toFixed(2), refl: run.fit.refl } : null, finished: run.finished,
               cars: [...run.cars.values()].filter((f) => f.tr).length, broadcast: bc ? bc.status() : null,
               radio: run.radio && run.T - run.radio.t <= RADIO_LINK_S ? { text: run.radio.text, lap: run.radio.lap, url: run.radio.url || "" } : null };
    }

    const api = { start, stop, owns, tick, follow, setSpeed, stepSpeed, seek, skip, status, setPaused, eventStep, seekEvent, isRunning: () => !!run,
             describe: () => run ? { name: run.script.name || run.script.circuit || "REAL RACE", startT: run.startT, drivers: [...run.cars.entries()].filter(([, f]) => f.tr && f.d).map(([c, f]) => ({ code: f.d.code, name: f.d.name, get available() { return !c.retired; } })), events: run.events, speeds: SPEEDS } : null,
             setLocked: (v) => (bc && run ? bc.setLocked(v) : false),
             setAuto, autoOn: () => !!(bc && run && bc.autoOn()),
             takePicture: () => { if (bc && run) bc.manual(); } };
    if (typeof WatchTransport !== "undefined") transport = WatchTransport.create(G, api);
    return api;
  }

  return { create, fitFrame, mapPoint, trackTrace, buildTraces, sampleAt, highlightsFor, reelFor, fmtLap, LEAD_S, HOLD_S, ENDED_S };
})();
Object.freeze(RealReplay);
