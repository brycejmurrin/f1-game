/* Apex 26 — Rapier bounded-takeover incident sim (adoption layer R2 + R3 + C1 +
   C3, see spike/ADOPTION-PLAN.md Part 2 R2/R3 and Part 3 C1/C3). THE HIGH-RISK
   LAYER: unlike R0/R1/Group A/B (which never move a car), this module is allowed
   to move the player/AI car during a BOUNDED incident window — it is an
   EXTENSION of the two sacred exceptions (the barrier clamp `xPinned` and the
   car-car collision resolver), not a new authority.

   Safety contract (non-negotiable — read spike/ADOPTION-PLAN.md and CLAUDE.md
   Physics):
     - The bespoke world-space-rigid-body model stays the ALWAYS-AVAILABLE
       authority. A takeover is a bounded window (launch → touchdown + settle,
       hard-capped at WINDOW_MAX_S) that hands back; outside the window every car
       runs the bespoke model exactly as today.
     - FALLBACK IS MANDATORY. Every pose write is (a) inside an active takeover
       window for that car AND (b) guarded by finite-checks + a per-tick teleport
       bound. Any anomaly (non-finite px/pz/head/speed/(s,x), NaN, absurd
       teleport, a rebuilt/lost Rapier world, or Rapier throwing) immediately
       REVERTS that car to its last-good bespoke state and hands control back. A
       glitch degrades to the bespoke model — it never bricks or strands a car.
     - It NEVER changes LONG_GRIP / slipFactor / the friction ellipse.
     - DETERMINISTIC: everything is seeded from game state (car index, tick,
       quantised s, incident sequence). No Date.now / Math.random. Rapier is
       bitwise deterministic per platform for a fixed body order.
     - A takeover invalidates the involved car's lap/ghost EXPLICITLY (sets
       c.incidentInvalidLap, which game.js reads at the lap line) — timing is
       never silently corrupted.

   Machinery: R2/R3/C1 are ONE takeover engine over DIFFERENT entry triggers.
   The engine promotes a set of cars' kinematic mirrors (owned by DebrisWorld's
   side-world) to Rapier 6-DoF DYNAMIC bodies, seeds them from the cars' current
   world pose+velocity (roll energy clamped at hand-to), lets DebrisWorld.step()
   advance them on the real road trimesh, reads the 6-DoF pose back into the cars
   each tick, and hands each car back to the bicycle model once it settles
   (reconstructing the road position, resyncing (s,x) via trackFrom, blending
   speed by the measured retention factor, routing inverted-rest into the
   existing rescue flow).

     - R2 (flag apex26.r2Airborne) — single-car airborne/rollover from a launch
       (hard wall strike or a big collision). Synthesises a clamped vertical +
       roll kick and tumbles the car on the road until it settles.
     - R3 + C3 (flag apex26.r3Contact) — a car-car contact whose severity clears
       R3_CAR_V is resolved through Rapier (both cars promoted, brief planar
       window) instead of the (prog,x) plane. Below the threshold the cheap
       (prog,x) plane still runs — THAT event-scoping IS C3. (Car-WALL contact
       resolution stays bespoke: the side-world has no barrier colliders, so the
       xPinned clamp remains the authority — the safe, reversible choice.)
     - C1 (flag apex26.c1Pileup) — a cluster of ≥3 cars in simultaneous
       above-threshold contact is promoted AS ONE and resolved together, then
       each survivor is handed back via the R2 protocol.

   Created with the G ctx façade from game.js (IncidentSim.create(G)); must load
   AFTER js/game/debrisworld.js and BEFORE js/game.js (see index.html /
   tools/manifest.cjs). Reuses DebrisWorld's Rapier world — inert (owns() is an
   O(1) `_incidentOwned` flag read) whenever DebrisWorld is disabled or every
   flag is off. */
const IncidentSim = (function () {
  "use strict";

  let G = null;             // game.js ctx façade (live getters + trackFrom/worldFromTrack helpers)

  // ── flags (all DEFAULT ON, each its own disable flag) ─────────────────────
  let _r2 = true;           // apex26.r2Airborne — R2 airborne / rollover
  let _r3 = true;           // apex26.r3Contact — R3/C3 car-car contact resolution
  let _c1 = true;           // apex26.c1Pileup  — C1 multi-car pile-ups

  // ── takeover state ────────────────────────────────────────────────────────
  const _owned = new Set(); // cars[] indices currently under takeover (owns())
  let _incidents = [];      // [{ kind, cars:[idx], tick0, seq, snap:Map, good:Map, settle:Map, gen }]
  const _cand = [];         // candidate contacts queued this tick by notify*(): {a,b,sev,kind}
  let _seq = 0;             // deterministic incident sequence counter
  let _tick = 0;            // ticks this module has stepped (deterministic clock)
  let _promoted = 0, _handbacks = 0, _fallbacks = 0, _lastKind = "";
  let _forced = 0;          // one-shot manual trigger requested via __apex

  // ── tuning (CONSERVATIVE — only genuine big incidents trigger) ────────────
  // Car-car closing speed (m/s) gates. R3 = a real shunt (not a draft bump); R2
  // = a heavy shunt that could launch a car. Below R3, the cheap (prog,x) plane
  // keeps running (this is the C3 event-scoping).
  const R3_CAR_V = 15;         // m/s closing → resolve this car-car pair via Rapier
  const R2_CAR_V = 24;         // m/s closing → a launch (airborne 6-DoF)
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
  // Inverted at rest: the car's local +Y, rotated to world, points below this →
  // it settled on its side/roof → route into the existing rescue flow.
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
    G = ctx;
    try { _r2 = (localStorage.getItem("apex26.r2Airborne") || "1") !== "0"; } catch (e) {}
    try { _r3 = (localStorage.getItem("apex26.r3Contact") || "1") !== "0"; } catch (e) {}
    try { _c1 = (localStorage.getItem("apex26.c1Pileup") || "1") !== "0"; } catch (e) {}
    return { owns, active, notifyWall, notifyCar, preStep, postStep, status,
             setFlags, reset, forceLaunch, release };
  }

  // Any incident feature on AND the Rapier side-world available. A cheap read;
  // owns() works off the set regardless so the game-side early-outs are correct
  // even mid-teardown.
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
      // Turning a feature off mid-incident hands any of its takeovers straight
      // back (safe: the bespoke model resumes from the last-good pose).
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

  // Full reset (tests / before makeCars): abort every takeover back to bespoke,
  // clear ownership flags, zero counters. handbackCar clears each flag; the
  // cars[] sweep catches any stray after a field rebuild dropped an index.
  function reset() {
    for (const inc of _incidents.slice())
      for (const i of inc.cars.slice()) handbackCar(inc, i, true);
    _incidents = []; _owned.clear(); _cand.length = 0;
    if (G && G.cars) for (const c of G.cars) if (c) c._incidentOwned = false;
    _seq = 0; _tick = 0; _promoted = 0; _handbacks = 0; _fallbacks = 0; _lastKind = ""; _forced = 0;
    return status();
  }

  // ── game-side triggers (called from game.js at the SAME sites as the debris
  // hooks; both no-ops unless active()). They only QUEUE candidates — promotion
  // happens in preStep so the whole tick's contacts are clustered together. ────

  // Wall contact. sev is the DebrisWorld severity (xOver*60 + speed*0.15).
  function notifyWall(c, side, sev) {
    if (!active() || !_r2 || !c) return;
    if (!fin(sev) || sev < R2_WALL_SEV) return;
    const i = G.cars ? G.cars.indexOf(c) : -1;
    if (i < 0) return;
    _cand.push({ a: i, b: -1, sev, kind: "wall" });
  }
  // Car-car contact from the (prog,x) resolver, relV = closing speed (m/s).
  // _r2 belongs in this gate: a car-car hit above R2_CAR_V is an R2 launch
  // (preStep classifies it), so gating on only _r3/_c1 made the r2-airborne-only
  // config unreachable from car contacts. preStep still gates each kind on its
  // own flag — letting candidates through here widens nothing.
  function notifyCar(a, b, relV) {
    if (!active() || !(_r2 || _r3 || _c1) || !a || !b) return;
    if (!fin(relV) || relV < R3_CAR_V) return;
    const cars = G.cars; if (!cars) return;
    const ia = cars.indexOf(a), ib = cars.indexOf(b);
    if (ia < 0 || ib < 0) return;
    _cand.push({ a: ia, b: ib, sev: relV, kind: "car" });
  }

  // ── preStep: build incidents from this tick's candidates and PROMOTE. Runs
  // BEFORE DebrisWorld.step so promoted bodies are dynamic when the world steps
  // (DebrisWorld skips re-posing any index we mark dynamic). ──────────────────
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
      // A retirement is parked, not racing: taking one over would hand it back to
      // Rapier and drive it off the spot retireCar() put it on.
      let idxs = [...set].filter((i) => !_owned.has(i) && cars[i] && !cars[i].finished && !cars[i].retired);
      if (!idxs.length) continue;
      const relV = maxRelV.get(root) || 0;
      let kind;
      if (idxs.length >= C1_MIN_CARS) { if (!_c1) continue; kind = "c1"; }
      else if (relV >= R2_CAR_V) { if (!_r2) continue; kind = "r2"; }
      else { if (!_r3) continue; kind = "r3"; }
      if (idxs.length > MAX_TAKEOVER) idxs = idxs.slice(0, MAX_TAKEOVER);
      startIncident(kind, idxs, relV, dt);
    }
    // Promote single-car wall launches (R2), skipping any car already taken over
    // by a cluster this tick.
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
      // Seed world velocity from the car's own heading + speed + body slip — the
      // exact decomposition game.js integrates (see the world-velocity lines).
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
      // Vertical launch + roll ONLY for R2 (airborne). R3/C1 stay planar (a small
      // settling nudge). Roll energy CLAMPED at hand-to per the deep-dive.
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
      // EXPLICIT lap/ghost invalidation: the involved car's current timed lap is
      // no longer clean (game.js reads this flag at the start/finish line).
      c.incidentInvalidLap = true;
      promoted.push(i);
    }
    if (!promoted.length) return;
    _incidents.push({ kind, cars: promoted, tick0: _tick, seq: _seq, snap, good, settle, gen });
    _seq++; _promoted += promoted.length; _lastKind = kind;
  }

  // ── postStep: read the 6-DoF pose back into each owned car, detect settle /
  // window cap, and hand cars back. Runs AFTER DebrisWorld.step. Every pose
  // write below is inside a live window AND guarded by finite + teleport checks;
  // any failure reverts that car to its last-good state and hands back. ────────
  function postStep(dt) {
    _tick++;
    if (!_incidents.length) return;
    // If the Rapier world is gone (disabled) or was rebuilt (track/field change),
    // every takeover is invalid — degrade all to bespoke immediately.
    let worldOk = false, gen = -1;
    try { worldOk = DebrisWorld.active() && DebrisWorld.rapierReady(); gen = DebrisWorld.worldGen(); }
    catch (e) { worldOk = false; }
    // Per-tick teleport bound (metres this tick): scales with dt so headless
    // big-dt stepping is not falsely tripped, while NaN / Inf / absurd jumps are.
    const stepBound = 6 + 240 * (fin(dt) ? Math.abs(dt) : 1 / 60);

    for (const inc of _incidents.slice()) {
      if (!worldOk || gen !== inc.gen) {
        for (const i of inc.cars.slice()) handbackCar(inc, i, true);
        continue;
      }
      for (const i of inc.cars.slice()) {
        const c = G.cars && G.cars[i];
        if (!c) { finishCar(inc, i); continue; }
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
        const vHoriz = Math.hypot(pose.vx || 0, pose.vz || 0);
        const speed = fin(vHoriz) ? vHoriz : (lg ? lg.speed : 0);
        // ── WRITE-BACK (window-scoped + guarded). HUMAN-car authority is
        // px/pz/head/(s,x); AI authority is (s,x)/prog. See report. ──
        if (c.human) {
          c.px = px; c.pz = pz; c.head = head;
          c.s = tf.s; c.x = tf.x;
          c.speed = speed; c.vLat = 0;
        } else {
          const L = (G.track && G.track.total) || 1;
          let ds = tf.s - c.s; ds = ((ds + L / 2) % L + L) % L - L / 2;
          if (fin(ds)) c.prog += ds;
          c.s = tf.s; c.x = tf.x; c.speed = speed; c.head = head;
        }
        // Advance the last-good snapshot to this validated pose.
        inc.good.set(i, snapOf(c));
        // Settle detection: sleeping OR both velocities below the settle bands.
        const settling = pose.sleeping ||
          (vHoriz < SETTLE_V && Math.hypot(pose.wx || 0, pose.wy || 0, pose.wz || 0) < SETTLE_W);
        let st = (inc.settle.get(i) || 0);
        st = settling ? st + (fin(dt) ? dt : 1 / 60) : 0;
        inc.settle.set(i, st);
        const windowUp = (_tick - inc.tick0) * (fin(dt) ? dt : 1 / 60) >= WINDOW_MAX_S;
        if (st >= SETTLE_HOLD_S || windowUp) handbackCar(inc, i, false, pose);
      }
    }
    _incidents = _incidents.filter((inc) => inc.cars.length);
  }

  // Yaw (heading about world +Y) from a body quaternion. Exact for a pure-Y
  // rotation (the mirror seeding convention); an approximation while tumbling —
  // good enough to hand back, the bespoke model re-derives from there.
  function yawOf(pose) {
    const x = pose.qx, y = pose.qy, z = pose.qz, w = pose.qw;
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  }
  // World-Y component of the body's local +Y — < INVERT_UP_Y means it settled on
  // its side/roof (inverted-rest → rescue flow).
  function upYOf(pose) {
    const x = pose.qx, z = pose.qz;
    return 1 - 2 * (x * x + z * z);
  }

  // Hand ONE car back to the bespoke model. anomaly=true reverts to the last-good
  // (or promote) snapshot with no blending — the safe degrade path. Otherwise a
  // clean settle: reconstruct the road position, blend speed by the retention
  // band, and route inverted-rest into the rescue flow.
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
          // Settled on its side/roof → the existing rescue flow (aligns heading,
          // clears slip, restores a modest speed, resets wall/off/rescue timers).
          if (c.human && G.rescuePlayer) { try { G.rescuePlayer(c); } catch (e) {} }
          else rescueAI(c);
        } else {
          // Upright: reconstruct the ROAD position from (s,x) (NOT the body's
          // resting y — cuboid rests ~0.36 m vs the model's ~0.6 m ride height),
          // so world ↔ (s,x) stays the exact identity the bespoke model needs.
          try {
            if (G.worldFromTrack && fin(c.s) && fin(c.x)) {
              const w = G.worldFromTrack(c.s, c.x);
              if (w && fin(w.x) && fin(w.z)) { c.px = w.x; c.pz = w.z; }
            }
          } catch (e) {}
          // Speed retention: take the real horizontal speed, capped at RETAIN_MAX×
          // the pre-incident speed, floored at RETAIN_FLOOR× so a clean settle
          // isn't handed back dead-stopped into an instant rescue. The old
          // min(floor, outV) lower bound meant the floor only ever applied at
          // EXACTLY zero — every nonzero settle handed back at crawl speed.
          let outV = fin(c.speed) ? Math.abs(c.speed) : 0;
          if (inV > 0) outV = clamp(outV || inV * RETAIN_FLOOR, inV * RETAIN_FLOOR, inV * RETAIN_MAX);
          c.speed = fin(outV) ? outV : (inV * RETAIN_FLOOR);
          c.vLat = 0; c.yawRateCur = 0;
          c.wasOnWall = false; c.rescueT = 0;
        }
        _handbacks++;
      }
      // Continuity for the bespoke re-entry: the next updateCar computes ds from
      // c._prevS, so anchor it to the handed-back s (no spurious wrong-way/lap).
      if (fin(c.s)) c._prevS = c.s;
    }
    finishCar(inc, i);
  }

  // Lightweight AI rescue mirror of rescuePlayer (AI has no world-space head
  // authority): drop back onto the racing surface at current progress.
  function rescueAI(c) {
    const track = G.track; if (!track || !c) return;
    try {
      Tracks.sample(track, c.s, G.smp);
      c.x = clamp(c.x || 0, -(G.smp.hw - 1.5), G.smp.hw - 1.5);
      c.speed = Math.max(fin(c.speed) ? c.speed : 0, 14);
      c.head = Math.atan2(G.smp.t[0], G.smp.t[2]);
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

  // Manual test trigger (__apex.incident({launch:true})): launch the player next
  // preStep. Deterministic (no wall clock).
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
