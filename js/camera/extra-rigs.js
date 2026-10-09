/* Apex 26 — EXTRA player camera rigs (RIVAL LOCK, PIT WALL, DRONE FOLLOW): append-only CAM_MODES solvers kept out of vantage.js for file-size headroom. Broadcast-only framing; never touches car state. */
const ExtraRigs = (function () {
  "use strict";

  const clamp = M4.clamp, lerp = M4.lerp;
  const BATTLE_S = 1.0;          // match Broadcast's battle window (seconds of gap)
  const FALLBACK_S = 2.5;        // nearest-rival search when no battle is live
  const DRONE_BACK = 11;         // m behind the car along heading
  const DRONE_UP = 7.2;          // m above the road
  const DRONE_LEAD = 18;         // m of look-ahead along the centreline
  const DRONE_SMOOTH = 0.14;     // per-frame blend toward ideal (snap resets)
  const DRONE_SMOOTH_COMFORT = 0.05;
  const PIT_EYE_OUT = 5.5;       // m past the half-width onto the pit wall
  const PIT_EYE_UP = 3.4;
  const PIT_BACK = 8;            // m of arc behind the car

  const _smpA = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  const _smpB = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  const _idealEye = [0, 0, 0], _idealTgt = [0, 0, 0];
  const _droneEye = [0, 0, 0], _droneTgt = [0, 0, 0];
  let _droneLive = false;
  let _droneSideSign = 0;
  let _autoPrev = -1;            // camMode restored after a pit auto-cut (-1 = idle)
  let _autoOn = false;           // we currently hold an ephemeral pitwall cut
  let _wasInPit = false;

  function wrapS(track, s) {
    const L = track.total;
    let v = s % L;
    return v < 0 ? v + L : v;
  }

  const _rvRows = [], _rvOut = [];

  /** Closest battle partner for the player, reusing Broadcast.battles when present. */
  function pickRival(cars, player) {
    if (!cars || !player || cars.length < 2) return null;
    // Pooled rows + array (Broadcast.battles pools its fights the same way):
    // rival mode calls this every rendered frame, and the rows never escape.
    const running = _rvOut;
    let n = 0;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c || c.retired || c.finished) continue;
      if (c.pitState && c.pitState !== "none") continue;
      let r = _rvRows[n];
      if (!r) { r = { key: null, prog: 0, speed: 0, pos: 0 }; _rvRows[n] = r; }
      r.key = c; r.prog = c.prog || 0; r.speed = c.speed || 0; r.pos = c.rank || 0;
      running[n++] = r;
    }
    running.length = n;
    running.sort((a, b) => b.prog - a.prog);
    const fights = (typeof Broadcast !== "undefined" && Broadcast.battles)
      ? Broadcast.battles(running)
      : localBattles(running);
    for (let i = 0; i < fights.length; i++) {
      const f = fights[i];
      if (f.key === player) return f.ahead;
      if (f.ahead === player) return f.key;
    }
    // No live battle — nearest car within FALLBACK_S by arc gap.
    let best = null, bestG = FALLBACK_S;
    for (let i = 0; i < running.length; i++) {
      const o = running[i].key;
      if (o === player) continue;
      const v = Math.max(player.speed || 0, o.speed || 0, 20);
      const g = Math.abs((o.prog || 0) - (player.prog || 0)) / v;
      if (g < bestG) { bestG = g; best = o; }
    }
    return best;
  }

  function localBattles(cars) {
    const out = [];
    for (let i = 1; i < cars.length; i++) {
      const a = cars[i - 1], b = cars[i];
      const v = Math.max(b.speed || 0, 20);
      const g = (a.prog - b.prog) / v;
      if (g >= 0 && g < BATTLE_S) out.push({ key: b.key, ahead: a.key, gapS: g, score: g + i * 0.08 });
    }
    return out.sort((x, y) => x.score - y.score);
  }

  function carSample(track, car, out) {
    const s = wrapS(track, car.s || 0), x = car.x || 0;
    Tracks.sample(track, s, out);
    return { s, x, p: out.p, t: out.t, r: out.r, hw: out.hw };
  }

  /** Frame the car ahead or behind in a battle — both cars stay in shot. */
  function rivalLock(track, s, x, spd, extra, eye, tgt) {
    const spN = clamp(spd / 72, 0, 1);
    Tracks.sample(track, wrapS(track, s), _smpA);
    const p = _smpA.p, t = _smpA.t, r = _smpA.r;
    const bankDy = (extra && extra.bankDy) || 0;
    const rival = extra && extra.rival;
    if (!rival) {
      // Solo fallback: a pulled-back three-quarter chase so the mode still frames.
      eye[0] = p[0] - t[0] * 9 + r[0] * 3.5;
      eye[1] = p[1] + 4.2 + bankDy;
      eye[2] = p[2] - t[2] * 9 + r[2] * 3.5;
      tgt[0] = p[0] + t[0] * 6; tgt[1] = p[1] + 0.9; tgt[2] = p[2] + t[2] * 6;
      return lerp(48, 56, spN);
    }
    const rv = carSample(track, rival, _smpB);
    // Midpoint of the two cars' world positions (lateral applied).
    const px = p[0] + r[0] * x, pz = p[2] + r[2] * x;
    const rx = rv.p[0] + rv.r[0] * rv.x, rz = rv.p[2] + rv.r[2] * rv.x;
    const midX = (px + rx) * 0.5, midZ = (pz + rz) * 0.5;
    const midY = (p[1] + rv.p[1]) * 0.5 + bankDy + 0.7;
    // Along-track back from the trailing car, raised, slight outside offset.
    const trailS = ((rival.prog || 0) < (extra.playerProg || 0)) ? (rival.s || s) : s;
    Tracks.sample(track, wrapS(track, trailS - 10), _smpB);
    const side = 6.5;
    eye[0] = _smpB.p[0] + _smpB.r[0] * side;
    eye[1] = _smpB.p[1] + 5.5 + bankDy;
    eye[2] = _smpB.p[2] + _smpB.r[2] * side;
    tgt[0] = midX; tgt[1] = midY; tgt[2] = midZ;
    return lerp(42, 50, spN);
  }

  /** Pit-wall / pit-lane camera — sits on the pit side looking across the car. */
  function pitWall(track, s, x, spd, extra, eye, tgt) {
    const spN = clamp(spd / 72, 0, 1);
    const side = (track.pit && track.pit.side) || (track.def && track.def.pitZone && track.def.pitZone.side) || 1;
    Tracks.sample(track, wrapS(track, s - PIT_BACK), _smpA);
    const hw = _smpA.hw || 7;
    let lat = side * (hw + PIT_EYE_OUT);
    // In the pit complex, stand on the garage side of the working lane.
    const rib = (typeof Tracks !== "undefined" && Tracks.pitLaneAt) ? Tracks.pitLaneAt(track, s) : null;
    if (rib) {
      const outer = rib.outer != null ? rib.outer : rib.centre + side * 4;
      lat = outer + side * 2.5;
    }
    eye[0] = _smpA.p[0] + _smpA.r[0] * lat;
    eye[1] = _smpA.p[1] + PIT_EYE_UP + (extra.bankDy || 0) + (rib ? 1.2 : 0);
    eye[2] = _smpA.p[2] + _smpA.r[2] * lat;
    Tracks.sample(track, wrapS(track, s), _smpB);
    const cx = _smpB.p[0] + _smpB.r[0] * x;
    const cz = _smpB.p[2] + _smpB.r[2] * x;
    tgt[0] = cx; tgt[1] = _smpB.p[1] + 0.85 + (extra.bankDy || 0); tgt[2] = cz;
    return lerp(44, 52, spN);
  }

  /** Smoothed tether drone — higher than chase, calmer than heli, corner look-ahead. */
  function droneFollow(track, s, x, spd, now, extra, eye, tgt) {
    const spN = clamp(spd / 72, 0, 1);
    const comfort = !!(extra && extra.reduceMotion);
    Tracks.sample(track, wrapS(track, s), _smpA);
    const p = _smpA.p, t = _smpA.t, r = _smpA.r;
    const bankDy = (extra && extra.bankDy) || 0;
    // Ideal eye: tether behind the car (car heading when known, else road tangent).
    let hx = t[0], hz = t[2];
    if (extra && extra.carPos && extra.carHead != null) {
      hx = Math.sin(extra.carHead); hz = Math.cos(extra.carHead);
    }
    const cx = (extra && extra.carPos) ? extra.carPos[0] : (p[0] + r[0] * x);
    const cz = (extra && extra.carPos) ? extra.carPos[1] : (p[2] + r[2] * x);
    const cy = p[1] + bankDy;
    // Mild sway on the outside of the next bend — broadcast-only curvature read.
    let side = 1.8;
    if (!comfort && typeof Tracks.curvature === "function") {
      const kHere = Tracks.curvature(track, wrapS(track, s));
      const kAhead = Tracks.curvature(track, wrapS(track, s + lerp(20, 50, spN)));
      const kA = Math.abs(kHere) >= Math.abs(kAhead) ? kHere : kAhead;
      const mag = Math.abs(kA) > 0.001 ? 3.2 : 1.8;
      const sgn = Math.abs(kA) > 0.001 ? (kA > 0 ? 1 : -1) : 1;
      const flipping = _droneSideSign !== 0 && _droneSideSign !== sgn;
      _droneSideSign = sgn;
      const lam = flipping ? 6.2 : 2.4;
      side = (typeof CamFeel !== "undefined")
        ? CamFeel.follow("droneSide", sgn * mag, lam, (extra && extra.dt) || 0)
        : sgn * mag;
    }
    if (typeof CamTune !== "undefined" && typeof CamTune.cornerHang === "function") {
      const hang = CamTune.cornerHang("drone");
      if (hang != null) side *= hang;
    }
    _idealEye[0] = cx - hx * DRONE_BACK + (-hz) * side;
    _idealEye[1] = cy + DRONE_UP;
    _idealEye[2] = cz - hz * DRONE_BACK + hx * side;
    // Aim: blend car nose with centreline look-ahead so the tether swings into corners.
    Tracks.sample(track, wrapS(track, s + DRONE_LEAD), _smpB);
    const leadAmt = comfort ? 0.25 : 0.54;
    const leadStored = (typeof CamTune !== "undefined" && CamTune.cornerLead)
      ? CamTune.cornerLead("drone") : null;
    const lead = clamp(leadStored != null ? leadStored : leadAmt, 0, 1);
    const aimCarX = cx + hx * 8, aimCarZ = cz + hz * 8;
    _idealTgt[0] = lerp(aimCarX, _smpB.p[0] + _smpB.r[0] * x * 0.3, lead);
    _idealTgt[1] = lerp(cy + 0.8, _smpB.p[1] + 0.9 + bankDy, lead);
    _idealTgt[2] = lerp(aimCarZ, _smpB.p[2] + _smpB.r[2] * x * 0.3, lead);
    const dt = (extra && extra.dt) || 0;
    const a = dt > 0
      ? (1 - Math.exp(-(comfort ? 3.2 : 9) * dt))
      : (comfort ? DRONE_SMOOTH_COMFORT : DRONE_SMOOTH);
    if (!_droneLive || (extra && extra.snap)) {
      _droneEye[0] = _idealEye[0]; _droneEye[1] = _idealEye[1]; _droneEye[2] = _idealEye[2];
      _droneTgt[0] = _idealTgt[0]; _droneTgt[1] = _idealTgt[1]; _droneTgt[2] = _idealTgt[2];
      _droneLive = true;
    } else {
      for (let i = 0; i < 3; i++) {
        _droneEye[i] = lerp(_droneEye[i], _idealEye[i], a);
        _droneTgt[i] = lerp(_droneTgt[i], _idealTgt[i], a);
      }
    }
    eye[0] = _droneEye[0]; eye[1] = _droneEye[1]; eye[2] = _droneEye[2];
    tgt[0] = _droneTgt[0]; tgt[1] = _droneTgt[1]; tgt[2] = _droneTgt[2];
    void now;
    return lerp(40, 48, spN);
  }

  function solve(mode, track, s, x, spd, now, extra, eye, tgt) {
    if (mode === "rival") return rivalLock(track, s, x, spd, extra, eye, tgt);
    if (mode === "pitwall") return pitWall(track, s, x, spd, extra, eye, tgt);
    if (mode === "drone") return droneFollow(track, s, x, spd, now, extra, eye, tgt);
    return null;
  }

  function reset(mode) {
    if (!mode || mode === "drone") _droneLive = false;
  }

  function inPit(c) {
    return !!(c && c.pitState && c.pitState !== "none");
  }

  /** Optional auto-cut onto PIT WALL around pit entry/exit. Returns the mode
   *  id it switched to, or null. Reads apex26.pitCamAuto — OFF unless the
   *  player opts in: taking the camera away on every pit entry (and handing it
   *  back on exit) was reported as unwanted on 2026-10-02, so the player's own
   *  camera stays put; PIT WALL is still one press of the camera button away. */
  function tickPitAuto(G) {
    if (!G || !G.player || typeof CamModes === "undefined") return null;
    const store = G.store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    const enabled = !!store && store.get("pitCamAuto", false) === true;
    const nowIn = inPit(G.player);
    const modes = CamModes.CAM_MODES;
    const pitIdx = modes.findIndex((m) => m.id === "pitwall");
    if (pitIdx < 0) { _wasInPit = nowIn; return null; }
    if (!enabled) {
      if (_autoOn) { _autoOn = false; _autoPrev = -1; }
      _wasInPit = nowIn;
      return null;
    }
    if (nowIn && !_wasInPit) {
      // Entering the pits — ephemeral cut to pitwall unless already there.
      if (G.camMode !== pitIdx) {
        _autoPrev = G.camMode;
        if (typeof G.setCamMode === "function") G.setCamMode(pitIdx, { persist: false });
        else G.camMode = pitIdx;
        _autoOn = true;
        _wasInPit = nowIn;
        return "pitwall";
      }
      _autoOn = false; _autoPrev = -1;
    } else if (!nowIn && _wasInPit && _autoOn && _autoPrev >= 0) {
      const restore = _autoPrev;
      _autoPrev = -1; _autoOn = false;
      if (G.camMode === pitIdx) {
        if (typeof G.setCamMode === "function") G.setCamMode(restore, { persist: false });
        else G.camMode = restore;
        _wasInPit = nowIn;
        return (modes[restore] || {}).id || null;
      }
    } else if (!nowIn) {
      _autoOn = false; _autoPrev = -1;
    } else if (_autoOn && G.camMode !== pitIdx) {
      // Player manually left pitwall while still in the pits — release the hold.
      _autoOn = false; _autoPrev = -1;
    }
    _wasInPit = nowIn;
    return null;
  }

  function pitCamAuto(store, v) {
    const st = store || (typeof GameStore !== "undefined" ? GameStore.store : null);
    if (!st) return false;
    if (v == null) return st.get("pitCamAuto", false) === true;
    st.set("pitCamAuto", !!v);
    return !!v;
  }

  return {
    solve, reset, pickRival, tickPitAuto, pitCamAuto, localBattles,
    BATTLE_S, FALLBACK_S, DRONE_BACK, DRONE_UP,
  };
})();
Object.freeze(ExtraRigs);
