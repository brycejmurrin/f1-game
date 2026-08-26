/* Apex 26 — Rapier bounded-takeover incident sim (adoption layer R2 + R3 + C1 + C3, see spike/ADOPTION-PLAN.md Part 2 R2/R3 and Part 3 C1/C3). THE HIGH-RISK LAYER… */
const IncidentSim = (function () {
  "use strict";

  let G = null;             // game.js ctx façade (live getters + trackFrom/worldFromTrack helpers)

  // flags (all DEFAULT ON, each its own disable flag)
  let _r2 = true;           // apex26.r2Airborne — R2 airborne / rollover
  let _r3 = true;           // apex26.r3Contact — R3/C3 car-car contact resolution
  let _c1 = true;           // apex26.c1Pileup  — C1 multi-car pile-ups

  const _owned = new Set(); // cars[] indices currently under takeover (owns())
  let _incidents = [];      // [{ kind, cars:[idx], tick0, seq, snap:Map, good:Map, settle:Map, gen }]
  const _cand = [];         // candidate contacts queued this tick by notify*(): {a,b,sev,kind}
  let _seq = 0;             // deterministic incident sequence counter
  let _tick = 0;            // ticks this module has stepped (deterministic clock)
  let _promoted = 0, _handbacks = 0, _fallbacks = 0, _lastKind = "";
  let _forced = 0;          // one-shot manual trigger requested via __apex

  // Closing speeds scale with OVERALL SPEED (PACE is a ground-speed scale), so
  // both promotion thresholds are applied ×Math.max(G.PACE, 0.05) at their
  // comparison sites — un-scaled, pace 10 turned every midfield tap into a
  // launch and pace 0.5 never promoted a genuine shunt.
  const R3_CAR_V = 15;         // m/s closing (at PACE 1) → resolve via Rapier
  const R2_CAR_V = 24;         // m/s closing (at PACE 1) → a launch (airborne 6-DoF)
  // Wall hit severity (xOver*60 + speed*0.15, the DebrisWorld severity units) → a
  // launch. Genuinely hard hits only; ordinary scrapes never trigger.
  const R2_WALL_SEV = 34;
  const C1_MIN_CARS = 3;       // a cluster of this many tangled cars = a pile-up
  const MAX_TAKEOVER = 8;      // hard cap on cars promoted at once (budget guard)
  const MAX_INCIDENTS = 3;     // hard cap on concurrent incidents
  // Window bounds. The takeover ALWAYS ends: either the car settles, or the hard
  // time cap fires and forces a handback. It can never get stuck in Rapier.
  const WINDOW_MAX_S = 3.0;    // hard cap (s) — force handback past this
  const SETTLE_HOLD_S = 0.30;  // low-velocity / sleeping this long → settled
  // SETTLE_V/SETTLE_W are DELIBERATELY absolute: they measure the Rapier body's
  // own dynamics (has the wreck stopped tumbling), which do not pace-scale.
  const SETTLE_V = 3.0;        // m/s — linear speed below this counts as settling
  const SETTLE_W = 2.5;        // rad/s — angular speed below this counts as settling
  // Launch seeding (clamped — "clamp imparted roll energy at hand-to", DEEP-DIVE).
  const LAUNCH_VY_MAX = 6.5;   // m/s max synthesised upward launch velocity
  const ROLL_CLAMP = 3.0;      // rad/s cap on imparted roll (about fwd / lateral axes)
  const YAW_CLAMP = 6.0;       // rad/s cap on imparted yaw
  // Handback speed retention: DEEP-DIVE measured 0.43–0.71× out/in. We take the
  // body's real horizontal speed but never let it EXCEED 0.71× the pre-incident
  // speed (Rapier's energy bleed naturally lands it in-band); a floor keeps an
  // upright landing from a dead stop that would instantly trip rescue.
  const RETAIN_MAX = 0.71;
  const RETAIN_FLOOR = 0.43;
  const INVERT_UP_Y = 0.40;

  // Deterministic PRNG (mulberry32), seeded purely from game state.
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
  const clamp = M4.clamp;                     // shared scalar helper (js/mat4.js)

  function create(ctx) {
    Log.info("game", "IncidentSim.create");
    G = ctx;
    try { _r2 = (localStorage.getItem("apex26.r2Airborne") || "1") !== "0"; } catch (e) {}
    try { _r3 = (localStorage.getItem("apex26.r3Contact") || "1") !== "0"; } catch (e) {}
    try { _c1 = (localStorage.getItem("apex26.c1Pileup") || "1") !== "0"; } catch (e) {}
    return { owns, active, notifyWall, notifyCar, preStep, postStep, status,
             setFlags, reset, forceLaunch, release };
  }

  function active() {
    return (_r2 || _r3 || _c1) && typeof DebrisWorld !== "undefined" &&
           DebrisWorld.active() && DebrisWorld.rapierReady();
  }
  // The one call game.js guards its per-car early-outs with. O(1) flag —
  // updateCar / collision loops hit this every tick per car; never indexOf.
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

  // Teleport authority: __apex.jump() and rescuePlayer() overwrite a car's pose,
  // and a live takeover would silently re-impose the Rapier body's old pose over
  // them every tick (measured: a wall-wedged car jumped a lap away kept reading
  // its old wall position at handback crawl speed). The teleporting caller hands
  // the car back FIRST; the anomaly path restores last-good state, which the
  // caller then overwrites — deterministic either way. Returns whether a
  // takeover was actually released.
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
    return status();
  }

  // Wall contact. sev is the DebrisWorld severity (xOver*60 + speed*0.15).
  function notifyWall(c, side, sev) {
    if (!active() || !_r2 || !c) return;
    if (!fin(sev) || sev < R2_WALL_SEV) return;
    const i = G.cars ? G.cars.indexOf(c) : -1;
    if (i < 0) return;
    _cand.push({ a: i, b: -1, sev, kind: "wall" });
  }
  function notifyCar(a, b, relV) {
    if (!active() || !(_r2 || _r3 || _c1) || !a || !b) return;
    if (!fin(relV) || relV < R3_CAR_V * Math.max(G.PACE, 0.05)) return;
    const cars = G.cars; if (!cars) return;
    const ia = cars.indexOf(a), ib = cars.indexOf(b);
    if (ia < 0 || ib < 0) return;
    _cand.push({ a: ia, b: ib, sev: relV, kind: "car" });
  }

  function preStep(dt) {
    if (!active()) { _cand.length = 0; return; }
    // Manual test trigger: launch the player once.
    if (_forced > 0) {
      _forced = 0;
      const p = G.player, pi = G.cars ? G.cars.indexOf(p) : -1;
      if (pi >= 0 && !_owned.has(pi)) _cand.push({ a: pi, b: -1, sev: R2_WALL_SEV + 40, kind: "wall" });
    }
    if (!_cand.length) return;
    // Union-find over car-car candidates → clusters of tangled cars.
    const cars = G.cars;
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
    const wallCand = new Map();   // idx → max wall sev
    let maxRelV = new Map();      // cluster root → max relV seen
    for (const cd of _cand) {
      if (cd.kind === "wall") {
        wallCand.set(cd.a, Math.max(wallCand.get(cd.a) || 0, cd.sev));
      } else {
        add(cd.a); add(cd.b);
        const ra = find(cd.a), rb = find(cd.b);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
    // Gather car-car clusters.
    const clusters = new Map();   // root → Set(idx)
    for (const cd of _cand) {
      if (cd.kind !== "car") continue;
      const r = find(cd.a);
      let s = clusters.get(r); if (!s) { s = new Set(); clusters.set(r, s); }
      s.add(cd.a); s.add(cd.b);
      maxRelV.set(r, Math.max(maxRelV.get(r) || 0, cd.sev));
    }
    _cand.length = 0;

    // Promote car-car clusters.
    for (const [root, set] of clusters) {
      if (_incidents.length >= MAX_INCIDENTS) break;
      let idxs = [...set].filter((i) => !_owned.has(i) && cars[i] && !cars[i].finished && !cars[i].retired);
      if (!idxs.length) continue;
      const relV = maxRelV.get(root) || 0;
      let kind;
      if (idxs.length >= C1_MIN_CARS) { if (!_c1) continue; kind = "c1"; }
      else if (relV >= R2_CAR_V * Math.max(G.PACE, 0.05)) { if (!_r2) continue; kind = "r2"; }
      else { if (!_r3) continue; kind = "r3"; }
      if (idxs.length > MAX_TAKEOVER) idxs = idxs.slice(0, MAX_TAKEOVER);
      startIncident(kind, idxs, relV, dt);
    }
    for (const [i, sev] of wallCand) {
      if (!_r2 || _owned.has(i) || !cars[i] || cars[i].finished || cars[i].retired) continue;
      if (_incidents.length >= MAX_INCIDENTS) break;
      startIncident("r2", [i], sev, dt);
    }
  }

  // Snapshot a car's authoritative bespoke state (the last-good to revert to).
  function snapOf(c) {
    return { px: c.px, pz: c.pz, head: c.head, speed: c.speed, s: c.s, x: c.x,
             vLat: c.vLat, yawRateCur: c.yawRateCur, prog: c.prog };
  }

  // Promote a set of cars to Rapier dynamic bodies for a bounded window.
  function startIncident(kind, idxs, sev, dt) {
    const cars = G.cars, track = G.track;
    if (!cars || !track) return;
    let gen = 0; try { gen = DebrisWorld.worldGen(); } catch (e) { return; }
    const snap = new Map(), good = new Map(), settle = new Map();
    const promoted = [];
    for (const i of idxs) {
      const c = cars[i];
      if (!c) continue;
      const head = fin(c.head) ? c.head : 0;
      const spd = fin(c.speed) ? c.speed : 0;
      const vLat = fin(c.vLat) ? c.vLat : 0;
      const fx = Math.sin(head), fz = Math.cos(head);
      const vWx = spd * fx + vLat * fz;
      const vWz = spd * fz - vLat * fx;
      // Deterministic seed for the launch kick — pure game state.
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
      if (!ok) continue;
      snap.set(i, snapOf(c));
      good.set(i, snapOf(c));
      settle.set(i, 0);
      _owned.add(i);
      c._incidentOwned = true;
      c.incidentInvalidLap = true;
      promoted.push(i);
    }
    if (!promoted.length) return;
    _incidents.push({ kind, cars: promoted, tick0: _tick, seq: _seq, snap, good, settle, gen, elapsed: 0 });
    _seq++; _promoted += promoted.length; _lastKind = kind;
    Log.info("game", "IncidentSim start " + kind + " cars=" + promoted.length);
  }

  function postStep(dt) {
    _tick++;
    if (!_incidents.length) return;
    let worldOk = false, gen = -1;
    try { worldOk = DebrisWorld.active() && DebrisWorld.rapierReady(); gen = DebrisWorld.worldGen(); }
    catch (e) { worldOk = false; }
    const stepBound = 6 + 240 * (fin(dt) ? Math.abs(dt) : 1 / 60);

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
        // Candidate world position + heading from the 6-DoF body.
        const px = pose.x, pz = pose.z;
        const head = yawOf(pose);
        const lg = inc.good.get(i) || inc.snap.get(i);
        // Teleport / non-finite guard against the last-good pose.
        if (!fin(px) || !fin(pz) || !fin(head) ||
            (lg && (Math.abs(px - lg.px) > stepBound || Math.abs(pz - lg.pz) > stepBound))) {
          handbackCar(inc, i, true); continue;
        }
        // Resync (s, x) LOCALLY off the last s (never a global search — see
        // trackFrom): trackFrom pins the perpendicular foot within a few m of
        // c.s, so it can't snap onto the wrong leg of a hairpin.
        let tf = null;
        try { tf = G.trackFrom(px, pz, c.s); } catch (e) { tf = null; }
        if (!tf || !fin(tf.s) || !fin(tf.x)) { handbackCar(inc, i, true); continue; }
        if (G.track && typeof Tracks !== "undefined" && Tracks.wallAt) {
          const wr = Tracks.wallAt(G.track, tf.s, 1);
          const wl = Tracks.wallAt(G.track, tf.s, -1);
          if (fin(wr) && tf.x > wr) tf.x = wr;
          if (fin(wl) && tf.x < -wl) tf.x = -wl;
        }
        const vHoriz = Math.hypot(pose.vx || 0, pose.vz || 0);
        const speed = fin(vHoriz) ? vHoriz : (lg ? lg.speed : 0);
        let wx = px, wz = pz;
        if (G.worldFromTrack) {
          try {
            const w = G.worldFromTrack(tf.s, tf.x);
            if (w && fin(w.x) && fin(w.z)) { wx = w.x; wz = w.z; }
          } catch (e) {}
        }
        if (c.human) {
          c.px = wx; c.pz = wz; c.head = head;
          const L = (G.track && G.track.total) || 1;
          let ds = tf.s - c.s; ds = ((ds + L / 2) % L + L) % L - L / 2;
          if (fin(ds)) { c.prog += ds; _lapCross(c, ds, tf.s, L); }
          c.s = tf.s; c.x = tf.x;
          c.speed = speed; c.vLat = 0;
        } else {
          const L = (G.track && G.track.total) || 1;
          let ds = tf.s - c.s; ds = ((ds + L / 2) % L + L) % L - L / 2;
          if (fin(ds)) { c.prog += ds; _lapCross(c, ds, tf.s, L); }
          c.s = tf.s; c.x = tf.x; c.speed = speed; c.head = head;
          c.px = wx; c.pz = wz;
          c.vLat = 0;   // same as the human branch — a stale vLat is not Rapier's
        }
        // Advance the last-good snapshot to this validated pose.
        inc.good.set(i, snapOf(c));
        // Settle detection: sleeping OR both velocities below the settle bands.
        const settling = pose.sleeping ||
          (vHoriz < SETTLE_V && Math.hypot(pose.wx || 0, pose.wy || 0, pose.wz || 0) < SETTLE_W);
        let st = (inc.settle.get(i) || 0);
        st = settling ? st + (fin(dt) ? dt : 1 / 60) : 0;
        inc.settle.set(i, st);
        const windowUp = (inc.elapsed || 0) >= WINDOW_MAX_S;
        if (st >= SETTLE_HOLD_S || windowUp) handbackCar(inc, i, false, pose);
      }
      inc.elapsed = (inc.elapsed || 0) + (fin(dt) ? dt : 1 / 60);
    }
    _incidents = _incidents.filter((inc) => inc.cars.length);
  }

  // updateCar's line-crossing block is skipped while Rapier owns a car, and
  // handback seeds _prevS = c.s, so a takeover that carries the car across
  // s=0 would lose the lap for good — HUD one short forever, c.finished a
  // whole lap late for a final-corner shunt. Count it here. Timing and PB
  // stay invalidated (incidentInvalidLap is set at promote); classification
  // must not be. Uses the same wrapped-ds crossing test as updateCar's.
  function _lapCross(c, ds, newS, L) {
    if (!(ds > 0) || !(c.s > L * 0.5 && newS < L * 0.5)) return;
    c.lap++;
    c._lapTimeAtLine = c.lapTime;
    c.lapTime = 0;
    const target = G.lapsTarget;
    if (fin(target) && target > 0 && c.lap > target) {
      c.finished = true;
      c.finishT = fin(G.raceT) ? G.raceT : 0;
    }
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
    try { DebrisWorld.demoteCarKinematic(i); } catch (e) {}
    if (c) {
      if (anomaly) {
        // Degrade to bespoke: restore the last validated (or promote) state so
        // the car is exactly where a valid tick left it — never NaN / stranded.
        const lg = inc.good.get(i) || inc.snap.get(i);
        if (lg) {
          if (fin(lg.px)) c.px = lg.px;
          if (fin(lg.pz)) c.pz = lg.pz;
          if (fin(lg.head)) c.head = lg.head;
          if (fin(lg.s)) c.s = lg.s;
          if (fin(lg.x)) c.x = lg.x;
          if (fin(lg.speed)) c.speed = lg.speed;
          c.vLat = 0; c.yawRateCur = 0;
        }
        _fallbacks++;
      } else {
        const snap = inc.snap.get(i);
        const inV = snap && fin(snap.speed) ? Math.abs(snap.speed) : 0;
        const inverted = pose ? upYOf(pose) < INVERT_UP_Y : false;
        if (inverted) {
          if (c.human && G.rescuePlayer) { try { G.rescuePlayer(c); } catch (e) {} }
          else rescueAI(c);
        } else {
          try {
            if (G.worldFromTrack && fin(c.s) && fin(c.x)) {
              const w = G.worldFromTrack(c.s, c.x);
              if (w && fin(w.x) && fin(w.z)) { c.px = w.x; c.pz = w.z; }
            }
          } catch (e) {}
          let outV = fin(c.speed) ? Math.abs(c.speed) : 0;
          if (inV > 0) outV = clamp(outV || inV * RETAIN_FLOOR, inV * RETAIN_FLOOR, inV * RETAIN_MAX);
          c.speed = fin(outV) ? outV : (inV * RETAIN_FLOOR);
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
      // Pace-scaled restore floor, capped at vTop() — the exact sibling of the
      // rescue floors in game.js; a bare 14 was 39% of top speed at pace 0.5
      // and effectively top speed at pace 0.2.
      c.speed = Math.min(G.vTop(), Math.max(fin(c.speed) ? c.speed : 0, 14 * Math.max(G.PACE, 0.05)));
      c.head = Math.atan2(G.smp.t[0], G.smp.t[2]);
      if (G.worldFromTrack) {
        const w = G.worldFromTrack(c.s, c.x);
        if (w) { c.px = w.x; c.pz = w.z; }
      }
      c.vLat = 0; c.yawRateCur = 0; c.offT = 0; c.stuckT = 0; c.rescueT = 0;
    } catch (e) {}
  }

  function finishCar(inc, i) {
    _owned.delete(i);
    const c = G.cars && G.cars[i];
    if (c) c._incidentOwned = false;
    inc.cars = inc.cars.filter((k) => k !== i);
    inc.snap.delete(i); inc.good.delete(i); inc.settle.delete(i);
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
    };
  }

  return { create, owns, active, notifyWall, notifyCar, preStep, postStep, status,
           setFlags, reset, forceLaunch, release };
})();
