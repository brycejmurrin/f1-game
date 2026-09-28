/* Apex 26 — REAL REPLAY (RealReplay.create(G)) Recreates a real Grand Prix from OpenF1's car positions: every car posed each frame where it really was (x/y traces fitted onto the circuit), so the field can be WATCHED from any lap or as a HIGHLIGHTS reel (every pass, stop, retirement and flag cut together, team radio at the moment it was sent), with the camera on any car. The director in js/race/real-race.js starts and stops it. */
const RealReplay = (function () {
  "use strict";

  const clamp = M4.clamp;   // js/core/mat4.js — bound at eval (HARD_EDGES pair in tools/manifest.cjs)

  // ── The reel and the clock ───────────────────────────────────────────────
  const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];   // replay speeds the +/- keys step through
  const LEAD_S = 8;       // a highlight starts this many real seconds before its moment
  const HOLD_S = 5;       // and holds this long after it
  const CAPTION_S = 3;    // a caption stays this long; an event further back than this on a seek is not re-announced
  const ENDED_S = 3;      // a trace with no sample this long is a stopped car
  const FINISH_S = 6;     // the results come this long after the winner's last sample
  const MAX_X = 3;        // a car this far outside the road edge (the pit lane) is drawn at the edge
  const REEL_KINDS = { pass: 1, out: 1, sc: 1, green: 1, fastest: 1, pit: 1 };
  const REEL_PIT_TOP = 8;   // a stop makes the reel only for the top classified drivers
  const KEY_SPEED_UP = "Equal", KEY_SPEED_DOWN = "Minus", KEY_NEXT = "Period", KEY_PREV = "Comma", KEY_SKIP = "KeyN";

  // ── Frame fit (pure): OpenF1's x/y onto the circuit's centreline ─────────
  // The feed's frame is track-local metres with an unknown origin, rotation and
  // handedness, so a rigid transform (rotation, translation, optional mirror —
  // never a scale: the game circuit is built from the same real geometry) is
  // fitted by ICP against the centreline from sixteen starts, keeping the one
  // that runs the lap FORWARD with the least residual.
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
    const near = (x, y) => { let b = 0, bd = Infinity; for (let i = 0; i < C.length; i++) { const dx = C[i][0] - x, dy = C[i][1] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = i; } } return b; };
    const cs = centroid(S), ct = centroid(C);
    const mapper = (refl, th, tx, ty) => (p) => { const x = p[0], y = refl * p[1], cos = Math.cos(th), sin = Math.sin(th); return [cos * x - sin * y + tx, sin * x + cos * y + ty]; };
    let best = null;
    for (const refl of [1, -1]) for (let k = 0; k < 8; k++) {
      let th = k * Math.PI / 4;
      let cos = Math.cos(th), sin = Math.sin(th);
      const cs2 = [cs[0], refl * cs[1]];
      let tx = ct[0] - (cos * cs2[0] - sin * cs2[1]), ty = ct[1] - (sin * cs2[0] + cos * cs2[1]);
      let map = mapper(refl, th, tx, ty), rms = Infinity;
      for (let it = 0; it < ICP_ITERS; it++) {
        // Pair every source point with its nearest centreline point, then the closed-form rigid fit (Kabsch, 2-D).
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
      // Direction: the mapped trace must run the lap forward (a mirrored fit can lie on the ring the wrong way round).
      let fwd = 0, back = 0, sPrev = null;
      for (const p of S) { const q = map(p); const s = C[near(q[0], q[1])][2]; if (sPrev != null) { let d = s - sPrev; if (d > total / 2) d -= total; else if (d < -total / 2) d += total; if (d > 0.5) fwd++; else if (d < -0.5) back++; } sPrev = s; }
      if (back > fwd) continue;
      if (!best || rms < best.rms) best = { refl, th, tx, ty, rms, n: S.length };
    }
    return best;
  }
  /** World (x, z) of a feed point under a fit. */
  function mapPoint(fit, x, y, out) {
    const yy = fit.refl * y, cos = Math.cos(fit.th), sin = Math.sin(fit.th);
    out = out || [0, 0];
    out[0] = cos * x - sin * yy + fit.tx; out[1] = sin * x + cos * yy + fit.ty;
    return out;
  }

  // ── Traces (pure with Tracks): a feed trace → progress along the circuit ──
  /** raw: Float32Array [t, x, y, …] (t seconds from lights out; x, y feed metres).
   *  Returns {t, prog, x, n, end}: prog is the unwrapped arc length so a lap is
   *  prog/total, x the lateral offset (+right). A car behind the line on the
   *  grid starts at a negative prog (lap 0, as gridUp lays it). */
  function trackTrace(track, fit, raw) {
    const n = raw.length / 3 | 0, total = track.total;
    const t = new Float32Array(n), prog = new Float32Array(n), x = new Float32Array(n);
    const w = [0, 0];
    let hint = null, p = 0;
    for (let i = 0; i < n; i++) {
      mapPoint(fit, raw[i * 3 + 1], raw[i * 3 + 2], w);
      const pr = Tracks.project(track, w[0], w[1], hint);
      if (i === 0) p = pr.s > total / 2 ? pr.s - total : pr.s;
      else { let d = pr.s - hint; if (d > total / 2) d -= total; else if (d < -total / 2) d += total; p += d; }
      hint = pr.s;
      t[i] = raw[i * 3]; prog[i] = p; x[i] = pr.lat;
    }
    // Anchor at lights out: the trace begins in the garage or on the formation
    // lap, so the unwrapped arc there is a lap or more; at t = 0 a car on the
    // grid (just behind the line) reads lap 0, one already past it (a pit-lane
    // start) reads lap 1 — the same convention gridUp lays the field in.
    if (n) {
      let i0 = 0;
      while (i0 < n - 1 && t[i0] < 0) i0++;
      const m = ((prog[i0] % total) + total) % total;
      const shift = prog[i0] - (m > total / 2 ? m - total : m);
      if (shift) for (let i = 0; i < n; i++) prog[i] -= shift;
    }
    return { t, prog, x, n, end: n ? t[n - 1] : 0 };
  }
  /** A trace already in the track frame ({t, prog, x} arrays): the test and probe form. */
  function fromTrack(o) {
    const t = Float32Array.from(o.t), prog = Float32Array.from(o.prog), x = Float32Array.from(o.x || new Array(t.length).fill(0));
    return { t, prog, x, n: t.length, end: t.length ? t[t.length - 1] : 0 };
  }
  /** The car at time tt: out.prog, out.x, out.speed (m/s), out.before (not yet in the data), out.ended (its data ran out). */
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
    // A gap in the data (a garage stop, a red flag) is a parked car, not a teleport.
    if (dt > ENDED_S * 3) { out.speed = 0; out.prog = tr.prog[lo]; out.x = tr.x[lo]; }
    return out;
  }

  // ── The highlights (pure): every moment of the race, in time order ───────
  /** [{t, lap, kind, text, num, url?}] from a v4 script (real-race-tab.js). */
  function highlightsFor(script) {
    const out = [];
    const byNum = {};
    for (const d of script.drivers || []) byNum[d.num] = d;
    const code = (num) => (byNum[num] ? byNum[num].code : "#" + num);
    const compoundAfter = (d, lap) => { const st = (d.stints || []).find((s) => s.from === lap + 1); return st ? st.c : ""; };
    for (const p of script.passes || []) if (p.t != null) out.push({ t: p.t, lap: p.lap, kind: "pass", num: p.by, text: code(p.by) + " PASSES " + code(p.over) + (p.pos ? " FOR P" + p.pos : "") });
    for (const d of script.drivers || []) {
      (d.pits || []).forEach((lap, i) => { const t = d.pitT && d.pitT[i]; if (t != null) { const c = compoundAfter(d, lap); out.push({ t, lap, kind: "pit", num: d.num, pos: d.pos, text: d.code + " PITS" + (c ? " · " + c : "") }); } });
      if (d.dnf && !d.dns && d.outT != null) out.push({ t: d.outT, lap: (d.lapsDone | 0) + 1, kind: "out", num: d.num, text: d.code + " OUT" + (d.outWhere ? " · " + d.outWhere : "") });
    }
    for (const w of script.cautions || []) {
      const cause = w.cause || (w.level >= 4 ? "RED FLAG" : w.level === 3 ? "SAFETY CAR" : "VIRTUAL SAFETY CAR");
      if (w.tFrom != null) out.push({ t: w.tFrom, lap: w.from, kind: "sc", num: null, text: cause });
      if (w.tTo != null) out.push({ t: w.tTo, lap: w.to, kind: "green", num: null, text: cause + " IN THIS LAP" });
    }
    if (script.fastest && script.fastest.t != null) out.push({ t: script.fastest.t, lap: script.fastest.lap, kind: "fastest", num: script.fastest.num, text: "FASTEST LAP · " + code(script.fastest.num) + " " + fmtLap(script.fastest.dur) });
    for (const r of script.radio || []) if (r.t != null) out.push({ t: r.t, lap: r.lap || 0, kind: "radio", num: r.num, url: r.url, text: "RADIO · " + code(r.num) });
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  /** The reel: the highlights worth a cut, no two closer than the hold. */
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
  function fmtLap(t) { if (!(t > 0)) return "—"; const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3); }

  // ── Traces for a whole field ──────────────────────────────────────────────
  /** Build every car's track trace (pure with Tracks and Log): one frame fit on the reference lap, then a projection per sample. */
  function buildTraces(track, script, traces) {
    const out = new Map();
    if (traces.frame === "track") {
      for (const k of Object.keys(traces.cars || {})) out.set(+k, fromTrack(traces.cars[k]));
      return { fit: null, byNum: out };
    }
    let fit = traces.fit || null;
    if (!fit) {
      // The reference lap: the winner's fastest, else the first clean minute after the start of whoever has data.
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
    for (const k of Object.keys(traces.cars || {})) out.set(+k, trackTrace(track, fit, traces.cars[k]));
    return { fit, byNum: out };
  }

  // ── The engine ────────────────────────────────────────────────────────────
  function create(G) {
    let run = null;   // {script, cars: Map car->{num, tr, d}, T, speed, follow, reel, reelIdx, list, fired, fit, finished, onKey, audio}
    const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
    const at = {};

    /** start({script, traces, seats: Map car->driver, startLap, follow, speed, reel}) — false when no trace fits. */
    function start(o) {
      const script = o.script, track = G.track;
      if (!script || !track || !o.traces) return false;
      const built = buildTraces(track, script, o.traces);
      if (!built) { Log.warn("game", "RealReplay.start: the positions do not fit " + script.trackId); return false; }
      const cars = new Map();
      for (const c of G.cars) {
        const d = o.seats.get(c);
        const tr = d ? built.byNum.get(d.num) : null;
        cars.set(c, { num: d ? d.num : null, d, tr: tr || null, posed: false, parked: false });
      }
      const list = highlightsFor(script);
      const reel = o.reel ? reelFor(list) : null;
      let T = 0;
      const lead = (script.drivers || []).find((d) => d.pos === 1) || (script.drivers || [])[0];
      if (o.startLap > 1 && lead && Array.isArray(lead.lapStart) && lead.lapStart[o.startLap - 1] != null) T = lead.lapStart[o.startLap - 1];
      if (reel && reel.length) T = reel[0].t - LEAD_S;
      run = { script, cars, T, speed: o.speed > 0 ? o.speed : 1, follow: null, reel, reelIdx: 0, list, fired: new Set(), fit: built.fit, finished: false, onKey: null, audio: null };
      // Every car is a puppet — the seat too: the camera and HUD follow it, nobody drives it.
      let follow = null;
      for (const [c, f] of cars) if (f.d && f.d.code === o.follow) follow = c;
      if (!follow) for (const [c, f] of cars) if (f.tr && !follow) follow = c;
      setFollow(follow);
      if (reel && reel.length) cutTo(reel[0]);
      run.onKey = (e) => onKey(e);
      try { window.addEventListener("keydown", run.onKey, true); } catch (e) { /* no window: a VM */ }
      pose();
      Log.info("game", "RealReplay.start T=" + T.toFixed(1) + " cars=" + [...cars.values()].filter((f) => f.tr).length + " reel=" + (reel ? reel.length : 0) + " follow=" + (follow ? follow.code : "-"));
      return true;
    }

    function stop() {
      if (!run) return;
      try { if (run.onKey) window.removeEventListener("keydown", run.onKey, true); } catch (e) { /* no window */ }
      if (run.audio) { try { run.audio.pause(); } catch (e) { /* already gone */ } run.audio = null; }
      run = null;
      Log.info("game", "RealReplay.stop");
    }

    function owns(c) { return !!run && run.cars.has(c); }

    function setFollow(c) {
      if (!run || !c) return;
      run.follow = c;
      if (G.followCar) G.followCar(c);
      if (G.snapGameCam) G.snapGameCam();
      if (G.refreshHud) G.refreshHud(true);
    }
    /** follow(+1 / -1): the next car up or down the running order; follow("VER"): by code. */
    function follow(want) {
      if (!run) return null;
      const running = [...run.cars.keys()].filter((c) => run.cars.get(c).tr && !c.retired).sort((a, b) => b.prog - a.prog);
      if (!running.length) return null;
      let c = null;
      if (typeof want === "string") c = running.find((x) => run.cars.get(x).d && run.cars.get(x).d.code === want) || null;
      else { const i = running.indexOf(run.follow); c = running[((i < 0 ? 0 : i + (want | 0)) % running.length + running.length) % running.length]; }
      if (c) setFollow(c);
      return c ? c.code : null;
    }
    function setSpeed(v) { if (run && v > 0) run.speed = clamp(v, SPEEDS[0], SPEEDS[SPEEDS.length - 1]); return run ? run.speed : 0; }
    function stepSpeed(dir) {
      if (!run) return 0;
      let i = SPEEDS.findIndex((s) => s >= run.speed - 1e-6); if (i < 0) i = SPEEDS.length - 1;
      return setSpeed(SPEEDS[clamp(i + dir, 0, SPEEDS.length - 1)]);
    }
    function seek(t) { if (!run) return; run.T = Math.max(-30, t); run.fired = new Set(); pose(); }

    function cutTo(h) {
      run.T = h.t - LEAD_S;
      run.fired = new Set();
      const c = h.num != null ? [...run.cars.keys()].find((x) => run.cars.get(x).num === h.num) : null;
      pose();
      if (c && !c.retired) setFollow(c); else if (!run.follow) follow(+1);
    }
    function skip() { if (!run || !run.reel) return; run.reelIdx++; if (run.reelIdx < run.reel.length) cutTo(run.reel[run.reelIdx]); else finish(); }

    function onKey(e) {
      if (!run || G.state !== "race" || !e || e.repeat) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      let used = true;
      if (e.code === KEY_NEXT) follow(-1);            // up the order
      else if (e.code === KEY_PREV) follow(+1);       // down the order
      else if (e.code === KEY_SPEED_UP) stepSpeed(+1);
      else if (e.code === KEY_SPEED_DOWN) stepSpeed(-1);
      else if (e.code === KEY_SKIP && run.reel) skip();
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); if (G.announce && e.code !== KEY_SKIP) G.announce((run.follow ? run.follow.code : "") + " · " + run.speed + "×", 1.2, "info"); }
    }

    /** Pose every car at the clock. */
    function pose() {
      const track = G.track, total = track.total;
      for (const [c, f] of run.cars) {
        if (!f.tr) { if (!f.parked) { f.parked = true; c.retired = true; c.dnf = c.dnf || "dns"; c.speed = 0; } continue; }
        sampleAt(f.tr, run.T, at);
        if (at.before) { if (f.posed) { c.speed = 0; } continue; }   // still on the grid where gridUp put it
        if (at.ended) { if (!f.parked) { f.parked = true; c.retired = true; c.dnf = c.dnf || "accident"; c.speed = 0; c.dnfAt = null; } continue; }
        f.posed = true;
        const lap = Math.floor(at.prog / total) + 1;
        const s = at.prog - (lap - 1) * total;
        Tracks.sample(track, s, smp);
        const x = clamp(at.x, -(smp.hw + MAX_X), smp.hw + MAX_X);
        c.lap = lap; c.prog = at.prog; c.s = s; c.x = x; c.xVis = x; c.speed = at.speed;
        const rl = Math.hypot(smp.r[0], smp.r[2]) || 1;
        c.px = smp.p[0] + smp.r[0] / rl * x; c.pz = smp.p[2] + smp.r[2] / rl * x;
        c.head = Math.atan2(smp.t[0], smp.t[2]);
        if (c.rPrevPx === undefined) { c.rPrevPx = c.px; c.rPrevPz = c.pz; c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevHead = c.head; }
        c.retired = false; c.finished = false;
        c.gear = at.speed > 60 ? 8 : at.speed > 40 ? 6 : at.speed > 20 ? 4 : 2;
        c.braking = false;
      }
    }

    function fire() {
      const list = run.list;
      for (let i = 0; i < list.length; i++) {
        const h = list[i];
        if (h.t > run.T) break;
        if (run.fired.has(i)) continue;
        run.fired.add(i);
        if (h.t < run.T - CAPTION_S) continue;   // seeked past: not news any more
        if (h.kind === "radio") { if (run.speed === 1) playRadio(h); continue; }
        if (G.announce) G.announce("L" + h.lap + " · " + h.text, CAPTION_S, "race");
      }
    }
    function playRadio(h) {
      if (!h.url || typeof Audio === "undefined") return;
      try {
        if (run.audio) run.audio.pause();
        const a = new Audio(h.url); a.volume = 0.9; run.audio = a;
        const p = a.play(); if (p && p.catch) p.catch(() => { /* autoplay refused: the caption still says who called */ });
        if (G.announce) G.announce(h.text, CAPTION_S, "info");
      } catch (e) { /* no audio: silent replay */ }
    }
    function finish() {
      if (!run || run.finished) return;
      run.finished = true;
      const order = [...run.cars.keys()].sort((a, b) => (b.prog || 0) - (a.prog || 0));
      Log.info("game", "RealReplay.finish T=" + run.T.toFixed(1));
      if (G.endRace) G.endRace(order);
    }

    function tick(dt) {
      if (!run || run.finished) return;
      if (G.state !== "race" && G.state !== "count") return;
      if (G.state === "race") run.T += dt * run.speed;
      pose();
      if (G.state !== "race") return;
      fire();
      if (G.raceT != null) G.raceT = Math.max(0, run.T);
      if (run.reel) {
        const h = run.reel[run.reelIdx];
        if (!h || run.T > h.t + HOLD_S) skip();
        return;
      }
      const lead = (run.script.drivers || []).find((d) => d.pos === 1);
      const tr = lead ? run.cars.get([...run.cars.keys()].find((c) => run.cars.get(c).num === lead.num)) : null;
      const end = tr && tr.tr ? tr.tr.end : 0;
      if (end > 0 && run.T > end + FINISH_S) finish();
    }

    function status() {
      if (!run) return null;
      return { T: +run.T.toFixed(2), speed: run.speed, follow: run.follow ? run.follow.code : null, reel: run.reel ? run.reel.length : 0, reelIdx: run.reelIdx,
               highlights: run.list.length, fit: run.fit ? { rms: +run.fit.rms.toFixed(2), refl: run.fit.refl } : null, finished: run.finished,
               cars: [...run.cars.values()].filter((f) => f.tr).length };
    }

    return { start, stop, owns, tick, follow, setSpeed, stepSpeed, seek, skip, status, isRunning: () => !!run };
  }

  return { create, fitFrame, mapPoint, trackTrace, fromTrack, buildTraces, sampleAt, highlightsFor, reelFor, fmtLap, SPEEDS, LEAD_S, HOLD_S, ENDED_S };
})();
Object.freeze(RealReplay);
