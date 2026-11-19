const IncidentSim = (function () {
  "use strict";

  const FIXED_DT = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.FIXED_DT) || 1 / 60;

  const _boundary = {}, _boundaryPost = {};

  let G = null;

  let _r2 = true;
  let _r3 = true;
  let _c1 = true;

  const _owned = new Set();
  let _incidents = [];
  const _cand = [];
  let _seq = 0;
  let _tick = 0;
  let _promoted = 0, _handbacks = 0, _fallbacks = 0, _lastKind = "";
  const _rejected = { inactive: 0, disabledKind: 0, belowThreshold: 0, incidentCap: 0,
    ownershipFilter: 0, eligibilityFilter: 0, takeoverCap: 0, failedPromotion: 0 };
  let _forced = 0;

  const R3_CAR_V = 15;
  const R2_CAR_V = 24;
  const R2_WALL_SEV = 34;
  const C1_MIN_CARS = 3;
  const MAX_TAKEOVER = 8;
  const MAX_INCIDENTS = 3;
  const WINDOW_MAX_S = 3.0;
  const SETTLE_HOLD_S = 0.30;
  const SETTLE_V = 3.0;
  const SETTLE_W = 2.5;
  const LAUNCH_VY_MAX = 6.5;
  const ROLL_CLAMP = 3.0;
  const YAW_CLAMP = 6.0;
  const RETAIN_MAX = 0.71;
  const RETAIN_FLOOR = 0.43;
  const REVERSE_MAX = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.REVERSE_MAX) || -5;
  const INVERT_UP_Y = 0.40;

  function rng32(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fin(v) { return typeof v === "number" && Number.isFinite(v); }
  const clamp = M4.clamp;

  function create(ctx) {
    Log.info("game", "IncidentSim.create");
    G = ctx;
    try { _r2 = (localStorage.getItem("apex26.r2Airborne") || "1") !== "0"; } catch (e) {  }
    try { _r3 = (localStorage.getItem("apex26.r3Contact") || "1") !== "0"; } catch (e) {  }
    try { _c1 = (localStorage.getItem("apex26.c1Pileup") || "1") !== "0"; } catch (e) {  }
    return { owns, active, notifyWall, notifyCar, preStep, postStep, status,
             setFlags, reset, forceLaunch, release };
  }

  function active() {
    return (_r2 || _r3 || _c1) && typeof DebrisWorld !== "undefined" &&
           DebrisWorld.active() && DebrisWorld.rapierReady();
  }
  function owns(c) {
    return !!(c && c._incidentOwned);
  }

  function setFlags(o) {
    if (o && typeof o === "object") {
      if ("r2Airborne" in o) _r2 = !!o.r2Airborne;
      if ("r3Contact" in o) _r3 = !!o.r3Contact;
      if ("c1Pileup" in o) _c1 = !!o.c1Pileup;
      if (_incidents.length) {
        for (const inc of _incidents.slice()) {
          if ((inc.kind === "r2" && !_r2) || (inc.kind === "r3" && !_r3) || (inc.kind === "c1" && !_c1))
            for (const i of inc.cars.slice()) handbackCar(inc, i, true);
        }
      }
    }
    return { r2Airborne: _r2, r3Contact: _r3, c1Pileup: _c1 };
  }

  function release(c) {
    const i = G && G.cars ? G.cars.indexOf(c) : -1;
    if (i < 0 || !_owned.has(i)) return false;
    for (const inc of _incidents.slice())
      if (inc.cars.includes(i)) handbackCar(inc, i, true);
    return true;
  }

  function reset() {
    for (const inc of _incidents.slice())
      for (const i of inc.cars.slice()) handbackCar(inc, i, true);
    _incidents = []; _owned.clear(); _cand.length = 0;
    if (G && G.cars) for (const c of G.cars) if (c) c._incidentOwned = false;
    _seq = 0; _tick = 0; _promoted = 0; _handbacks = 0; _fallbacks = 0; _lastKind = ""; _forced = 0;
    for (const key in _rejected) _rejected[key] = 0;
    return status();
  }

  function notifyWall(c, side, sev) {
    if (!c) return;
    if (!active()) { _rejected.inactive++; return; }
    if (!_r2) { _rejected.disabledKind++; return; }
    if (!fin(sev) || sev < R2_WALL_SEV) { _rejected.belowThreshold++; return; }
    const i = G.cars ? G.cars.indexOf(c) : -1;
    if (i < 0) return;
    _cand.push({ a: i, b: -1, sev, kind: "wall" });
  }
  function notifyCar(a, b, relV) {
    if (!a || !b) return;
    if (!active()) { _rejected.inactive++; return; }
    if (!fin(relV) || relV < R3_CAR_V * Math.max(G.PACE, 0.05)) { _rejected.belowThreshold++; return; }
    const cars = G.cars; if (!cars) return;
    const ia = cars.indexOf(a), ib = cars.indexOf(b);
    if (ia < 0 || ib < 0) return;
    _cand.push({ a: ia, b: ib, sev: relV, kind: "car" });
  }

  function preStep(dt) {
    if (!active()) { _cand.length = 0; return; }
    if (_forced > 0) {
      _forced = 0;
      const p = G.player, pi = G.cars ? G.cars.indexOf(p) : -1;
      if (pi >= 0 && !_owned.has(pi)) _cand.push({ a: pi, b: -1, sev: R2_WALL_SEV + 40, kind: "wall" });
    }
    if (!_cand.length) return;
    const cars = G.cars;
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
    const wallCand = new Map();
    let maxRelV = new Map();
    for (const cd of _cand) {
      if (cd.kind === "wall") {
        wallCand.set(cd.a, Math.max(wallCand.get(cd.a) || 0, cd.sev));
      } else {
        add(cd.a); add(cd.b);
        const ra = find(cd.a), rb = find(cd.b);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
    const clusters = new Map();
    for (const cd of _cand) {
      if (cd.kind !== "car") continue;
      const r = find(cd.a);
      let s = clusters.get(r); if (!s) { s = new Set(); clusters.set(r, s); }
      s.add(cd.a); s.add(cd.b);
      maxRelV.set(r, Math.max(maxRelV.get(r) || 0, cd.sev));
    }
    _cand.length = 0;

    for (const [root, set] of clusters) {
      if (_incidents.length >= MAX_INCIDENTS) { _rejected.incidentCap++; continue; }
      let idxs = [...set].filter((i) => {
        if (_owned.has(i)) { _rejected.ownershipFilter++; return false; }
        if (!cars[i] || cars[i].finished || cars[i].retired) { _rejected.eligibilityFilter++; return false; }
        return true;
      });
      if (!idxs.length) continue;
      const relV = maxRelV.get(root) || 0;
      let kind;
      if (idxs.length >= C1_MIN_CARS) { if (!_c1) { _rejected.disabledKind++; continue; } kind = "c1"; }
      else if (relV >= R2_CAR_V * Math.max(G.PACE, 0.05)) { if (!_r2) { _rejected.disabledKind++; continue; } kind = "r2"; }
      else { if (!_r3) { _rejected.disabledKind++; continue; } kind = "r3"; }
      startIncident(kind, idxs, relV, dt);
    }
    for (const [i, sev] of wallCand) {
      if (!_r2) { _rejected.disabledKind++; continue; }
      if (_owned.has(i)) { _rejected.ownershipFilter++; continue; }
      if (!cars[i] || cars[i].finished || cars[i].retired) { _rejected.eligibilityFilter++; continue; }
      if (_incidents.length >= MAX_INCIDENTS) { _rejected.incidentCap++; continue; }
      startIncident("r2", [i], sev, dt);
    }
  }

  function snapOf(c) {
    return { px: c.px, pz: c.pz, head: c.head, speed: c.speed, s: c.s, x: c.x,
             vLat: c.vLat, yawRateCur: c.yawRateCur, prog: c.prog };
  }

  function startIncident(kind, idxs, sev, dt) {
    const cars = G.cars, track = G.track;
    if (!cars || !track) return;
    let gen = 0; try { gen = DebrisWorld.worldGen(); } catch (e) { return; }
    const snap = new Map(), good = new Map(), settle = new Map();
    const promoted = [];
    for (const i of idxs) {
      const c = cars[i];
      if (!c || _owned.has(i) || c.finished || c.retired) continue;
      if (_owned.size >= MAX_TAKEOVER) { _rejected.takeoverCap++; continue; }
      let head = 0;
      if (c.human && fin(c.head)) head = c.head;
      else { try { Tracks.sample(track, c.s, G.smp); head = Math.atan2(G.smp.t[0], G.smp.t[2]); } catch (e) { head = fin(c.head) ? c.head : 0; } }
      const spd = fin(c.speed) ? c.speed : 0;
      const vLat = fin(c.vLat) ? c.vLat : 0;
      const fx = Math.sin(head), fz = Math.cos(head);
      const vWx = spd * fx - vLat * fz;
      const vWz = spd * fz + vLat * fx;
      const seed = (Math.imul(i + 1, 0x9E3779B1) ^ Math.imul((c.s | 0) + 1, 0x85EBCA6B)
                  ^ Math.imul(_seq + 1, 0xC2B2AE35) ^ (_tick + 1)) | 0;
      const r = rng32(seed);
      let vy = 0, rollX = 0, rollZ = 0;
      if (kind === "r2") {
        vy = clamp(1.5 + (sev || 0) * 0.08, 0, LAUNCH_VY_MAX);
        rollX = clamp((r() - 0.5) * 2 * (1 + (sev || 0) * 0.03), -ROLL_CLAMP, ROLL_CLAMP);
        rollZ = clamp((r() - 0.5) * 2 * (1 + (sev || 0) * 0.03), -ROLL_CLAMP, ROLL_CLAMP);
      } else {
        vy = clamp((r() - 0.5) * 0.6, -0.5, 0.8);
      }
      const yaw = clamp(-(fin(c.yawRateCur) ? c.yawRateCur : 0) + (r() - 0.5) * 1.5, -YAW_CLAMP, YAW_CLAMP);
      const lin = { x: fin(vWx) ? vWx : 0, y: vy, z: fin(vWz) ? vWz : 0 };
      const ang = { x: rollX, y: yaw, z: rollZ };
      let ok = false;
      try { ok = DebrisWorld.promoteCarDynamic(i, lin, ang); } catch (e) { ok = false; }
      if (!ok) { _rejected.failedPromotion++; continue; }
      snap.set(i, snapOf(c));
      good.set(i, snapOf(c));
      settle.set(i, 0);
      _owned.add(i);
      c._incidentOwned = true;
      c.incidentInvalidLap = true;
      promoted.push(i);
    }
    if (!promoted.length) return;
    _incidents.push({ kind, cars: promoted, tick0: _tick, seq: _seq, snap, good, raw: new Map(), settle, gen, elapsed: 0 });
    _seq++; _promoted += promoted.length; _lastKind = kind;
    Log.info("game", "IncidentSim start " + kind + " cars=" + promoted.length);
  }

  function postStep(dt) {
    _tick++;
    if (!_incidents.length) return;
    let worldOk = false, gen = -1;
    try { worldOk = DebrisWorld.active() && DebrisWorld.rapierReady(); gen = DebrisWorld.worldGen(); }
    catch (e) { worldOk = false; }
    const stepBound = 6 + 240 * (fin(dt) ? Math.abs(dt) : FIXED_DT);

    for (const inc of _incidents.slice()) {
      if (!worldOk || gen !== inc.gen) {
        for (const i of inc.cars.slice()) handbackCar(inc, i, true);
        continue;
      }
      for (const i of inc.cars.slice()) {
        const c = G.cars && G.cars[i];
        if (!c) { finishCar(inc, i); continue; }
        if (c.retired || c.finished) { handbackCar(inc, i, true); continue; }
        let pose = null;
        try { pose = DebrisWorld.carBodyPose(i); } catch (e) { pose = null; }
        if (!pose || !fin(pose.x) || !fin(pose.z) || !fin(pose.qw)) { handbackCar(inc, i, true); continue; }
        const px = pose.x, pz = pose.z;
        const head = yawOf(pose);
        const lg = inc.raw.get(i) || inc.snap.get(i);
        if (!fin(px) || !fin(pz) || !fin(head) ||
            (lg && (Math.abs(px - lg.px) > stepBound || Math.abs(pz - lg.pz) > stepBound))) {
          handbackCar(inc, i, true); continue;
        }
        let tf = null;
        try { tf = G.trackFrom(px, pz, c.s); } catch (e) { tf = null; }
        if (!tf || !fin(tf.s) || !fin(tf.x)) { handbackCar(inc, i, true); continue; }
        if (G.track && typeof Tracks !== "undefined" && Tracks.wallAt) {
          const lim = ContactGeometry.wallLimits(G.track, tf.s, tf.x, _boundary, _boundaryPost, c);
          if (fin(lim.r) && tf.x > lim.r) tf.x = lim.r;
          if (fin(lim.l) && tf.x < -lim.l) tf.x = -lim.l;
          if (fin(lim.laneMin) && lim.laneMin > 0 && tf.x * lim.side < lim.laneMin) tf.x = lim.laneMin * lim.side;
        }
        const vWx = pose.vx || 0, vWz = pose.vz || 0;
        const fxh = Math.sin(head), fzh = Math.cos(head);
        const vFwd = vWx * fxh + vWz * fzh;
        const vSide = vWz * fxh - vWx * fzh;
        const vHoriz = Math.hypot(vWx, vWz);
        let speed = fin(vFwd) ? vFwd : (lg ? lg.speed : 0);
        if (!c.human && G.track && G.smp) {
          try {
            Tracks.sample(G.track, tf.s, G.smp);
            const vT = vWx * G.smp.t[0] + vWz * G.smp.t[2];
            if (fin(vT)) speed = vT;
          } catch (e) {  }
        }
        let wx = px, wz = pz;
        if (G.worldFromTrack) {
          try {
            const w = G.worldFromTrack(tf.s, tf.x);
            if (w && fin(w.x) && fin(w.z)) { wx = w.x; wz = w.z; }
          } catch (e) {  }
        }
        const L = (G.track && G.track.total) || 1;
        let ds = tf.s - c.s; ds = ((ds + L / 2) % L + L) % L - L / 2;
        if (fin(ds)) { c.prog += ds; _lapCross(c, ds, tf.s, L); }
        c.s = tf.s; c.x = tf.x; c.speed = speed; c.head = head;
        c.px = wx; c.pz = wz; c.vLat = fin(vSide) ? vSide : 0;
        inc.good.set(i, snapOf(c));
        inc.raw.set(i, { px, pz });
        const settling = pose.sleeping ||
          (vHoriz < SETTLE_V && Math.hypot(pose.wx || 0, pose.wy || 0, pose.wz || 0) < SETTLE_W);
        let st = (inc.settle.get(i) || 0);
        st = settling ? st + (fin(dt) ? dt : FIXED_DT) : 0;
        inc.settle.set(i, st);
        const windowUp = (inc.elapsed || 0) >= WINDOW_MAX_S;
        if (st >= SETTLE_HOLD_S || windowUp) handbackCar(inc, i, false, pose);
      }
      inc.elapsed = (inc.elapsed || 0) + (fin(dt) ? dt : FIXED_DT);
    }
    _incidents = _incidents.filter((inc) => inc.cars.length);
  }

  function _lapCross(c, ds, newS, L) {
    const cross = RaceControl.lineTransition(c, c.s, newS, ds, L,
      G.lapsTarget, G.cars, G.raceT);
    if (!cross) return;
    if (G.onIncidentLineCross) G.onIncidentLineCross(c, cross, newS);
    else if (cross.direction > 0 && c.isPlayer) { G.sectorIdx = 0; G.sectorStartT = 0; }
  }

  function yawOf(pose) {
    const x = pose.qx, y = pose.qy, z = pose.qz, w = pose.qw;
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  }
  function upYOf(pose) {
    const x = pose.qx, z = pose.qz;
    return 1 - 2 * (x * x + z * z);
  }

  function handbackCar(inc, i, anomaly, pose) {
    const c = G.cars && G.cars[i];
    try { DebrisWorld.demoteCarKinematic(i); } catch (e) {  }
    if (c) {
      if (anomaly) {
        const lg = inc.good.get(i) || inc.snap.get(i);
        if (lg) {
          if (fin(lg.px)) c.px = lg.px;
          if (fin(lg.pz)) c.pz = lg.pz;
          if (fin(lg.head)) c.head = lg.head;
          if (fin(lg.s)) c.s = lg.s;
          if (fin(lg.x)) c.x = lg.x;
          if (fin(lg.speed)) c.speed = Math.max(c.human ? REVERSE_MAX : 0, lg.speed);
          c.vLat = 0; c.yawRateCur = 0;
        }
        _fallbacks++;
      } else {
        const snap = inc.snap.get(i);
        const inV = snap && fin(snap.speed) ? Math.abs(snap.speed) : 0;
        const inverted = pose ? upYOf(pose) < INVERT_UP_Y : false;
        if (inverted) {
          if (c.human && G.rescuePlayer) { finishCar(inc, i); try { G.rescuePlayer(c); } catch (e) {  } }
          else rescueAI(c);
        } else {
          try {
            if (G.worldFromTrack && fin(c.s) && fin(c.x)) {
              const w = G.worldFromTrack(c.s, c.x);
              if (w && fin(w.x) && fin(w.z)) { c.px = w.x; c.pz = w.z; }
            }
          } catch (e) {  }
          let tX = NaN, tZ = NaN;
          try {
            Tracks.sample(G.track, c.s, G.smp);
            const t = G.smp && G.smp.t;
            if (t) { const tl = Math.hypot(t[0], t[2]) || 1; tX = t[0] / tl; tZ = t[2] / tl; }
          } catch (e) {  }
          const haveT = fin(tX) && fin(tZ);
          const pvx = pose && fin(pose.vx) ? pose.vx : 0, pvz = pose && fin(pose.vz) ? pose.vz : 0;
          const settled = !pose || !!pose.sleeping || Math.hypot(pvx, pvz) < SETTLE_V;
          let v = fin(c.speed) ? c.speed : 0;
          if (!c.human && haveT && pose) v = pvx * tX + pvz * tZ;
          if (settled || v >= 0) {
            if (c.human && settled && haveT && fin(c.head) && Math.sin(c.head) * tX + Math.cos(c.head) * tZ < 0) c.head = Math.atan2(tX, tZ);
            let outV = v > 0 ? v : 0;
            if (inV > 0) outV = clamp(outV || inV * RETAIN_FLOOR, inV * RETAIN_FLOOR, inV * RETAIN_MAX);
            c.speed = fin(outV) ? outV : inV * RETAIN_FLOOR;
          } else {
            c.speed = Math.max(REVERSE_MAX, v);
          }
          c.vLat = 0; c.yawRateCur = 0;
          c.wasOnWall = false; c.rescueT = 0;
        }
        _handbacks++;
      }
      if (fin(c.s)) c._prevS = c.s;
    }
    Log.info("game", "IncidentSim end idx=" + i + (anomaly ? " anomaly" : ""));
    finishCar(inc, i);
  }

  function rescueAI(c) {
    const track = G.track; if (!track || !c) return;
    try {
      Tracks.sample(track, c.s, G.smp);
      c.x = clamp(c.x || 0, -(G.smp.hw - 1.5), G.smp.hw - 1.5);
      c.speed = Math.min(G.vTop(), Math.max(fin(c.speed) ? c.speed : 0, 14 * Math.max(G.PACE, 0.05)));
      c.head = Math.atan2(G.smp.t[0], G.smp.t[2]);
      if (G.worldFromTrack) {
        const w = G.worldFromTrack(c.s, c.x);
        if (w) { c.px = w.x; c.pz = w.z; }
      }
      c.vLat = 0; c.yawRateCur = 0; c.offT = 0; c.stuckT = 0; c.rescueT = 0;
    } catch (e) {  }
  }

  function finishCar(inc, i) {
    _owned.delete(i);
    const c = G.cars && G.cars[i];
    if (c) c._incidentOwned = false;
    inc.cars = inc.cars.filter((k) => k !== i);
    inc.snap.delete(i); inc.good.delete(i); inc.raw.delete(i); inc.settle.delete(i);
  }

  function forceLaunch() { _forced = 1; return status(); }

  function status() {
    return {
      r2Airborne: _r2, r3Contact: _r3, c1Pileup: _c1,
      active: active(),
      owned: _owned.size,
      incidents: _incidents.map((inc) => ({ kind: inc.kind, cars: inc.cars.slice(),
                                            ticks: _tick - inc.tick0, seq: inc.seq })),
      count: _incidents.length,
      lastKind: _lastKind,
      promoted: _promoted, handbacks: _handbacks, fallbacks: _fallbacks,
      seq: _seq, stepped: _tick,
      rejected: { ..._rejected },
    };
  }

  return { create, owns, active, notifyWall, notifyCar, preStep, postStep, status,
           setFlags, reset, forceLaunch, release };
})();
Object.freeze(IncidentSim);
