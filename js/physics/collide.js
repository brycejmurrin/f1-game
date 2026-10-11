"use strict";
// Collide — car-to-car contact in the Frenet (prog, x) plane: the arc-bucket
// broadphase, the mass-weighted relaxation passes, the hard separation pass,
// the barrier clamp and the world-pose writeback. Extracted from game.js
// (Collide.create(G, collideFx, ownsPose)); game.js keeps collideFx (shake/hit-stop/
// rumble — game feel state) and hands it in as the second argument, the rest
// (track/player/netPlay/PACE/wrapS/worldFromTrack) through G. The takeover
// incident owner is IncidentSim's static owns()/notifyCar(); ownsPose excludes
// externally posed replay puppets from local collision state. Physics-visible: every
// number here is gated by tests/specs/physics-characterization.spec.js.

const Collide = (() => {
  const clamp = M4.clamp;   // js/core/mat4.js (eval-time: HARD_EDGES mat4 -> collide)
  const wrapDelta = M4.wrapDelta, TWO_PI = 2 * Math.PI;
  // The loop's fixed step (js/physics/consts.js FIXED_DT); the literal is the
  // fallback for a bare test VM that loads this file without PhysicsConsts.
  const FIXED_DT = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.FIXED_DT) || 1 / 60;
  const LCAR = 4.8, WCAR = 2.0;
  // Per-car half extents; LCAR/WCAR above are the COMBINED pair extents.
  const HL = LCAR / 2, WL = WCAR / 2;          // 2.4 long, 1.0 wide

  // YAW-AWARE EXTENTS — the spun-car hole.
  //
  // (prog, x) is a plane and every car was axis-aligned in it: heading relative
  // to the tangent never entered the contact test. A car crossways is 4.8 m
  // across the road and the collider gave the PAIR 2.0 m of lateral reach, so a
  // rival passing at |dX| between 2.0 and 3.4 m drove through bodywork the
  // renderer was drawing. Measured miss, against a normally-oriented rival:
  //
  //     psi   30°    45°    60°    75°    90°
  //     miss  1.07   1.40   1.58   1.58   1.40  metres
  //
  // The peak is 60-75°, the three-quarters-on car — NOT the fully sideways one,
  // whose LONGITUDINAL extent has shrunk to 3.4 m against the fixed 4.8 m, i.e.
  // there a fixed-box test over-detects. So this both adds and removes contacts.
  //
  // WHOSE yaw. Only a car with a REAL heading can be crossways here: AI cars
  // are driven by a kinematic controller that writes `head = atan2(tangent)`
  // (game.js — "AI cars still damp, they have no real heading") and their
  // `yawVis` is a cosmetic lean of up to ~36°, which is presentation, not a
  // pose. Widening a car because it LOOKS tilted would be the render quietly
  // entering the physics. A car in a genuine spin is owned by the incident sim,
  // and pairContact's callers skip Rapier-owned cars outright. So this reads
  // psi for the player only, every AI car keeps exactly 2.4 x 1.0, and the
  // reachable half of the hole — an AI driving through a spun PLAYER — closes.
  //
  // The 20°→60° blend keeps ordinary cornering out of it: below 20° nothing
  // changes at all, and the term is only at full strength past where the miss
  // peaks. A car at psi = 0 measures 2.4 x 1.0 exactly, so an unyawed field is
  // bit-identical to before this existed.
  const YAW_LO = 20 * Math.PI / 180, YAW_HI = 60 * Math.PI / 180;
  function yawMix(psi) {
    const a = psi < 0 ? -psi : psi;
    if (!(a > YAW_LO)) return 0;               // NaN-safe: falls to 0
    if (a >= YAW_HI) return 1;
    const t = (a - YAW_LO) / (YAW_HI - YAW_LO);
    return t * t * (3 - 2 * t);                // smoothstep, C1 at both ends
  }
  // Support half-widths of one car along the tangent / across it.
  function extLong(c) {
    const psi = c.human ? (c.yawVis || 0) : 0;
    const k = yawMix(psi);
    return HL * Math.abs(Math.cos(psi * k)) + WL * Math.abs(Math.sin(psi * k));
  }
  function extLat(c) {
    const psi = c.human ? (c.yawVis || 0) : 0;
    const k = yawMix(psi);
    return HL * Math.abs(Math.sin(psi * k)) + WL * Math.abs(Math.cos(psi * k));
  }
  function bodyAngle(c) { const psi = c.human && Number.isFinite(c.yawVis) ? c.yawVis : 0; return psi * yawMix(psi); }
  // Both cars can be human and rotated: each support is bounded by its
  // half-diagonal. Use the pair bound for rejection AND arc buckets.
  const LCAR_MAX = 2 * Math.hypot(HL, WL);

  // Wrap-aware arc buckets shared by resolveCollisions (width = LCAR_MAX) and
  // updateCar's traffic / slipstream / OT-ahead scans (wider reach, same fill).
  // floor(L/width), not ceil: a sliver last bucket put a seam pair two ids
  // apart so the neighbour walk missed them. Tail folds into bucket 0.
  // Arrays are reused: clear is length=0, a slot is allocated once per id.
  const _arcBuckets = [];
  const _arcBucketIds = [];
  let _arcNB = 0, _arcWidth = LCAR_MAX, _arcL = 1;
  function _arcProg(c) {
    if (c && c._snapProg != null && Number.isFinite(c._snapProg)) return c._snapProg;
    return c && c._nOk ? c._nProg : (c ? c.prog : 0);
  }
  function _arcClear() {
    for (let i = 0; i < _arcBucketIds.length; i++) {
      const id = _arcBucketIds[i];
      const arr = _arcBuckets[id];
      if (arr) arr.length = 0;
    }
    _arcBucketIds.length = 0;
  }
  function fillArcBuckets(ranked, L, width, progOf) {
    _arcClear();
    L = L || 1;
    width = width || LCAR_MAX;
    const nB = Math.max(1, Math.floor(L / width) | 0);
    _arcNB = nB; _arcWidth = width; _arcL = L;
    const of = progOf || _arcProg;
    const n = ranked.length;
    for (let i = 0; i < n; i++) {
      const c = ranked[i];
      const prog = of(c);
      let b = Math.floor((((prog % L) + L) % L) / width) % nB;
      if (b < 0) b += nB;
      let arr = _arcBuckets[b];
      if (!arr) { arr = _arcBuckets[b] = []; }
      if (arr.length === 0) _arcBucketIds.push(b);
      arr.push(c);
    }
    return nB;
  }
  // Visit other cars in buckets covering ±reach of c (wrap-aware). `fn` is a
  // caller-owned stable function — this must not allocate. Cheap-reject stays
  // at the call site. span = floor(reach/width)+1 so a car on a bucket edge
  // still sees someone `reach` metres away; if that covers the whole lap we
  // walk occupied ids once instead of duplicating.
  function forArcNear(c, L, reach, fn, progOf) {
    const nB = _arcNB;
    if (!nB || !fn) return;
    const of = progOf || _arcProg;
    const p = of(c);
    const W = _arcWidth;
    const LL = L || _arcL || 1;
    let b0 = Math.floor((((p % LL) + LL) % LL) / W) % nB;
    if (b0 < 0) b0 += nB;
    const span = Number.isFinite(reach) ? (Math.floor(reach / W) | 0) + 1 : nB;
    if (!Number.isFinite(reach) || nB <= 2 * span + 1) {
      const nIds = _arcBucketIds.length;
      for (let k = 0; k < nIds; k++) {
        const arr = _arcBuckets[_arcBucketIds[k]];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const o = arr[i];
          if (o !== c) fn(o);
        }
      }
      return;
    }
    for (let d = -span; d <= span; d++) {
      let id = b0 + d;
      id %= nB;
      if (id < 0) id += nB;
      const arr = _arcBuckets[id];
      if (!arr || !arr.length) continue;
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (o !== c) fn(o);
      }
    }
  }
  function _liveProg(c) { return c.prog; }
  const PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : {};
  const _towRange = PC.TOW_RANGE || 34, _towHalfW = PC.TOW_HALF_W || 4, _blockerHalfW = PC.BLOCKER_HALF_W || 2.2;
  const _traf = {
    c: null, L: 0, BACK: 0, REJ: 0, MIN_GAP: 0, street: false,
    roomL: 0, roomR: 0, nearbyN: 0, sep: 0,
    blocker: null, blockerGap: Infinity, towCar: null, towGap: Infinity,
    chaser: null, chaserGap: Infinity,
    alongO: null, alongDx: 0, alongDprog: 0, alongAdx: Infinity,
  };
  function _onTrafO(o) {
    const s = _traf, c = s.c;
    if (o.finished) return;
    let dprog = o._snapProg - c.prog;
    if (!Number.isFinite(dprog)) return;
    const ad = dprog < 0 ? -dprog : dprog, L = s.L, REJ = s.REJ;
    if (ad > REJ && ad < L - REJ) return;
    dprog = ((dprog + L / 2) % L + L) % L - L / 2;
    if (dprog < -s.BACK || dprog > 34) return;
    const dx = o._snapX - c.x;
    const adp = dprog < 0 ? -dprog : dprog;
    if (adp < 5.5) {
      if (dx >= 0) s.roomR = Math.min(s.roomR, Math.abs(dx) - 1.0);
      else s.roomL = Math.min(s.roomL, Math.abs(dx) - 1.0);
      const adx = dx < 0 ? -dx : dx;
      if (adx < s.alongAdx) { s.alongO = o; s.alongDx = dx; s.alongDprog = dprog; s.alongAdx = adx; }
    }
    if (adp < 6.5) {
      s.nearbyN++;
      const deficit = s.MIN_GAP - (dx < 0 ? -dx : dx);
      if (deficit > 0) s.sep += (dx <= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);
    }
    if (dprog > 0.5 && dprog < s.blockerGap && Math.abs(dx) < (o === c.passFailOf && c.passFailT > 0 && !s.street ? 6 : _blockerHalfW)) { s.blocker = o; s.blockerGap = dprog; }
    if (dprog > 0.5 && dprog < s.towGap && Math.abs(dx) < _towHalfW) { s.towCar = o; s.towGap = dprog; }
    if (dprog < -0.5 && -dprog < s.chaserGap && Math.abs(dx) < (!s.street && -dprog < 0.5 * Math.max(c.speed, 10) ? 5.5 : 3)) { s.chaser = o; s.chaserGap = -dprog; }
  }
  function scanTraffic(c, L, BACK, REJ, MIN_GAP, street, roomL, roomR) {
    const s = _traf;
    s.c = c; s.L = L; s.BACK = BACK; s.REJ = REJ; s.MIN_GAP = MIN_GAP; s.street = !!street;
    s.roomL = roomL; s.roomR = roomR; s.nearbyN = 0; s.sep = 0;
    s.blocker = null; s.blockerGap = Infinity; s.towCar = null; s.towGap = Infinity;
    s.chaser = null; s.chaserGap = Infinity;
    s.alongO = null; s.alongDx = 0; s.alongDprog = 0; s.alongAdx = Infinity;
    forArcNear(c, L, REJ, _onTrafO, _liveProg);
    s.roomL = Math.max(0, s.roomL); s.roomR = Math.max(0, s.roomR);
    return s;
  }
  const _ot = { c: null, L: 0, W: 0, ahead: null, gapAhead: Infinity, skip: null };
  function _onOtO(o) {
    const s = _ot, c = s.c;
    if (o.finished || o.retired || (s.skip && s.skip(o))) return;
    const dp = o._snapProg - c.prog, adp = dp < 0 ? -dp : dp, L = s.L, otW = s.W;
    if (adp > otW && adp < L - otW) return;
    const d = ((dp + L / 2) % L + L) % L - L / 2;
    if (d > 0.5 && d < s.gapAhead) { s.ahead = o; s.gapAhead = d; }
  }
  function scanOtAhead(c, L, otW, skip) {
    _ot.c = c; _ot.L = L; _ot.W = otW; _ot.ahead = null; _ot.gapAhead = Infinity; _ot.skip = skip || null;
    forArcNear(c, L, otW, _onOtO, _liveProg);
    return _ot;
  }
  const _tow = { c: null, L: 0, tc: null, tg: Infinity };
  function _onTowO(o) {
    const s = _tow, c = s.c;
    if (o.finished || o.retired) return;
    let dprog = o._snapProg - c.prog;
    if (!Number.isFinite(dprog)) return;
    const ad = dprog < 0 ? -dprog : dprog, L = s.L;
    if (ad > _towRange + 0.1 && ad < L - _towRange - 0.1) return;
    dprog = ((dprog + L / 2) % L + L) % L - L / 2;
    if (dprog > 0.5 && dprog < s.tg && Math.abs(o._snapX - c.x) < _towHalfW) { s.tc = o; s.tg = dprog; }
  }
  function scanTow(c, L) {
    _tow.c = c; _tow.L = L; _tow.tc = null; _tow.tg = Infinity;
    forArcNear(c, L, _towRange + 0.1, _onTowO, _liveProg);
    return _tow;
  }

  // "This frame actually separated them" is a millimetre, never `corr > 0`: at
  // the slop distance the penetration is `LCAR - |dProg|` with LCAR's own
  // rounding still in it, so corr lands at ~3e-16 — positive, and therefore true
  // — while nothing moves. Measured at dProg = -4.75.
  const CORR_EPS = 1e-3;

  // Per-side driving limits at (s, x): Tracks.wallAt, the pit wall / exit wall face and
  // the gantry legs — a copy of the limit block at the top of WallClamp.apply
  // (js/physics/wall-clamp.js; keep the two in step). Fills `out` {r, l, laneMin, side}.
  const _lim = { r: 0, l: 0, laneMin: 0, side: 0 }, _postLim = { r: 0, l: 0, minOut: 0, side: 0 };
  function _wallLimits(track, s, x, out) {
    let wallR = Tracks.wallAt(track, s, 1), wallL = Tracks.wallAt(track, s, -1);
    let laneMin = 0, pitSd = 0;
    const p = track.pit;
    if (p && !p.painted) {
      const k = ((Math.round(s / track.total * track.n) % track.n) + track.n) % track.n;
      if (p.v[k] >= 0.98) {
        pitSd = p.side;
        const face = track.hw[k] + p.bands.verge;
        if (x * pitSd < face + 0.125) { if (pitSd > 0) wallR = Math.min(wallR, face - 1.1); else wallL = Math.min(wallL, face - 1.1); }
        else laneMin = track.hw[k] + p.off.fastIn + 1.0;
      } else if (p.w[k] >= TrackPit.EXIT_WALL_W && ((s - p.sOut) % track.total + track.total) % track.total < p.exitRoadM) {
        pitSd = p.side;
        const wallLat = track.hw[k] + p.bands.verge * p.v[k];
        if (x * pitSd < wallLat + 0.125) { if (pitSd > 0) wallR = Math.min(wallR, wallLat - 1.15); else wallL = Math.min(wallL, wallLat - 1.15); }
        else laneMin = wallLat + 0.30 + 1.0;
      }
    }
    if (track.posts && track.posts.length) {
      Tracks.postLimits(track, s, x, _postLim);
      if (_postLim.r < wallR) wallR = _postLim.r;
      if (_postLim.l < wallL) wallL = _postLim.l;
      if (_postLim.minOut > laneMin) { laneMin = _postLim.minOut; pitSd = _postLim.side; }
    }
    out.r = wallR; out.l = wallL; out.laneMin = laneMin; out.side = pitSd;
    return out;
  }

  function create(G, collideFx, ownsPose = () => false) {
    Log.info("game", "Collide.create");
    const wrapS = G.wrapS;
    const incidentSim = IncidentSim;   // static owns()/notifyCar() — one instance per page
    let track = null, player = null, netPlay = null;   // bound at resolveCollisions entry
    let motion = new WeakMap(), motionTrack = null, motionTime = -1;
    let sweepGeneration = 0;
    const _swP = [];   // sweepContacts: motion.get(ranked[i]), read ONCE per car per step
    const geom = {}, swept = {}, impulse = {}, bodyA = {}, bodyB = {};
    function deltaS(d) { const L = track.total; return ((d + L / 2) % L + L) % L - L / 2; }
    // Cache only within this sweep; contact responses invalidate both cars.
    // Ownership stays live at the pair checks, outside this numeric cache.
    function sweepMotion(c, p, dt) {
      if (p.sweepGeneration === sweepGeneration) return;
      p.sweepGeneration = sweepGeneration;
      p.sweepD = deltaS(c.prog - p.prog); p.sweepX = c.x - p.x;
      p.sweepEligible = false;
      if (Math.hypot(p.sweepD, p.sweepX) > Math.max(6, Math.abs(c.speed) * dt * 2 + 1)) return;
      p.sweepAngle = bodyAngle(c);
      p.sweepEligible = !(Math.abs(wrapDelta(p.sweepAngle - p.angle, TWO_PI)) > 0.15);
    }
    // Body velocity in the contact plane (prog, x), +x RIGHT, angle + = nose
    // toward +x: forward (cs, sn), RIGHT (−sn, cs). c.vLat is +RIGHT (the
    // PlayerForces frame and game.js's world writeback); until 2026-10-04 both
    // maps below used the LEFT vector, so a sliding car's lateral motion and a
    // shove's lateral impulse entered the contact with the wrong sign.
    function body(c, speed, out) {
      const angle = c.human ? (c.yawVis || 0) : 0, cs = Math.cos(angle), sn = Math.sin(angle);
      out.angle = bodyAngle(c);
      out.vx = speed * cs - (c.vLat || 0) * sn;
      out.vy = speed * sn + (c.vLat || 0) * cs;
      out.omega = c.human ? (c.yawRateCur || 0) : 0;
      out.invMass = netPlay.owns(c) ? 0 : c.human ? AiDrive.humanInvMass(!!track.street) : 1;
      out.invInertia = c.human ? out.invMass / ContactGeometry.INERTIA : 0;
      return out;
    }
    // A HUMAN ALREADY REVERSING KEEPS ITS SIGN. Every contact response floored
    // c.speed at 0, so a player backing out of a side-by-side wedge lost the
    // whole -5 m/s on the first touch and rebuilt it at REVERSE_ACCEL. Forward
    // contacts, and every AI car (which never reverses on purpose), keep the floor.
    function floorFwd(c, v) { return c.human && c.speed < 0 ? v : Math.max(0, v); }
    // A scrub is a loss of MAGNITUDE, whichever way the car is rolling.
    function scrub(v, d) { return v > 0 ? Math.max(0, v - d) : Math.min(0, v + d); }
    function pushVelocity(c, state, dx, dy, dw) {
      if (netPlay.owns(c)) return;
      const angle = c.human ? (c.yawVis || 0) : 0, cs = Math.cos(angle), sn = Math.sin(angle);
      const vx = state.vx + dx, vy = state.vy + dy;
      c.speed = floorFwd(c, vx * cs + vy * sn);
      if (c.human) {
        c.vLat = clamp(vy * cs - vx * sn, -40, 40);   // V · RIGHT, the inverse of body()
        c.yawRateCur = clamp(state.omega + dw, -4, 4);
      }
    }
    function orientedResponse(a, b, ct, last) {
      const correction = Math.max(0, ct.depth - COL_SLOP) * 0.7;
      shiftLong(a, ct.nx * correction * ct.sA); shiftLong(b, -ct.nx * correction * ct.sB);
      a.x += ct.ny * correction * ct.sA; b.x -= ct.ny * correction * ct.sB;
      const ba = body(a, ct.aSp, bodyA), bb = body(b, ct.bSp, bodyB);
      const j = ContactGeometry.impulse(ba, bb, ct.dProg, ct.dX, ct, impulse);
      pushVelocity(a, ba, j.ax, j.ay, j.aw); pushVelocity(b, bb, j.bx, j.by, j.bw);
      if (correction > CORR_EPS || j.magnitude > CORR_EPS) {
        if (!netPlay.owns(a)) a.contactT = 0.22;
        if (!netPlay.owns(b)) b.contactT = 0.22;
        if (last) collideFx(a, b, clamp(j.closing * 0.03, 0.15, 1));
        // The first impulse carries severity; later relaxation passes have
        // already removed closing velocity. Both worlds retain their own gates.
        if (j.magnitude > CORR_EPS && !netPlay.owns(a) && !netPlay.owns(b)) {
          if (DebrisWorld.active()) DebrisWorld.carImpact(a, b, j.closing);
          incidentSim.notifyCar(a, b, j.closing);
        }
      }
    }
    function sweepContacts(ranked, dt) {
      sweepGeneration++;
      // Previous resolved poses are local collision state, never render history.
      // A teleport or rapidly rotating body is not a linear driving sweep.
      // The rotation test is on the WRAPPED angle: yawVis lives in (-π, π], so
      // a car turning through ±π (spun, facing back up the road) read as a
      // ~2π "rotation" and its swept contact was skipped every such step.
      // ONE motion lookup per car, not one per pair (231 WeakMap gets a step
      // before the arc reject); nothing below sets or deletes an entry.
      _swP.length = ranked.length;
      for (let i = 0; i < ranked.length; i++) _swP[i] = motion.get(ranked[i]);
      for (let i = 0; i < ranked.length; i++) {
        const a = ranked[i], pa = _swP[i];
        if (!pa || ownsPose(a) || incidentSim.owns(a) || netPlay.owns(a)) continue;
        sweepMotion(a, pa, dt);
        if (!pa.sweepEligible) continue;
        const da = pa.sweepD, xa = pa.sweepX, reachA = LCAR_MAX + Math.abs(da) + 1;
        for (let k = i + 1; k < ranked.length; k++) {
          const b = ranked[k], pb = _swP[k];
          if (!pb) continue;
          // FAR APART on the arc, decided before the ownership calls and
          // sweepMotion (each pair paid both, 231 pairs a step). A pair that
          // reaches the arc test below passes it only if |x0| - |da| - |db| <=
          // LCAR_MAX, and an eligible b has |db| <= its own sweep bound (the
          // hypot gate in sweepMotion), so past that sum (+1 m for rounding)
          // every path below ends in `continue` anyway. sweepMotion is a
          // per-generation cache of live state: computed later, it is the same.
          // A NaN sweep (non-finite prog or NaN x skips that hypot gate) never rejects here.
          const sx = b.x - pb.x, sd = b.prog - pb.prog;
          if (sx === sx && sd - sd === 0 && Math.abs(deltaS(pa.prog - pb.prog)) > reachA + Math.max(6, Math.abs(b.speed) * dt * 2 + 1)) continue;
          if (ownsPose(b) || incidentSim.owns(b) || netPlay.owns(b)) continue;
          sweepMotion(b, pb, dt);
          if (!pb.sweepEligible) continue;
          const db = pb.sweepD, xb = pb.sweepX;
          if (Math.hypot(da - db, xa - xb) < 1) continue;
          const x0 = deltaS(pa.prog - pb.prog), y0 = pa.x - pb.x, x1 = x0 + da - db, y1 = y0 + xa - xb;
          if (Math.min(x0, x1) > LCAR_MAX || Math.max(x0, x1) < -LCAR_MAX) continue;
          if (ContactGeometry.overlap(x1, y1, pa.sweepAngle, pb.sweepAngle, geom)) continue;
          const hit = ContactGeometry.sweep(x0, y0, x1, y1, pa.angle, pb.angle, swept);
          if (!hit) continue;
          const t = hit.time;
          shiftLong(a, da * (t - 1)); shiftLong(b, db * (t - 1));
          a.x = pa.x + xa * t; b.x = pb.x + xb * t;
          const shares = sepShares(a, b);
          hit.dProg = x0 + (da - db) * t; hit.dX = y0 + (xa - xb) * t;
          hit.aSp = a.speed; hit.bSp = b.speed; hit.sA = shares.sA; hit.sB = shares.sB;
          orientedResponse(a, b, hit, true);
          pa.sweepGeneration = pb.sweepGeneration = 0;
          break; // let the ordinary solver settle a cluster before another sweep
        }
      }
    }

    // Shift a car along the track. Both s and prog advance together so multi-pass
    // pairContact (which keys on prog) sees the push immediately — skipping human
    // prog left penLong stale across relaxation passes. _prevS is NOT moved: the
    // lap-line test compares c.s to _prevS, and moving both hid a shove across the
    // line (re-cross = a SECOND lap; forward shove = none). _pushD banks the push.
    function shiftLong(c, d) {
      if (d === 0) return;
      c.s = wrapS(c.s + d);
      c.prog += d; c._pushD = (c._pushD || 0) + d;
      _colShifted = true;
    }

    // Collision masses AND separation shares for one pair.
    //
    // The two are NOT the same, and that is the whole point. `iA`/`iB` are the
    // momentum masses: a human car is "heavier" (0.5) so the AI cannot shove it
    // around, and between two humans they are equal so neither out-muscles the
    // other. The SPEED exchange uses those, because both cars are real and both
    // genuinely slow down.
    //
    // `sA`/`sB` are how much of the POSITIONAL correction each car absorbs, and a
    // car posed from the network takes none of it. Its owner integrates it on
    // their machine and we re-pose it from their next packet, so any push we apply
    // is discarded a frame later — splitting 50/50 with a car whose half is thrown
    // away leaves the pair still overlapping, frame after frame. The car we own
    // absorbs all of it. That is the ownership rule made concrete: contact moves
    // YOUR car, based on where you see the other one.
    //
    // Returns a shared scratch object; every call site destructures it immediately,
    // so nothing aliases across a pair and the relaxation loop stays allocation-free.
    const _sep = { iA: 1, iB: 1, iSum: 2, sA: 0.5, sB: 0.5 };
    const _ct = { dProg: 0, dX: 0, penLong: 0, penLat: 0, iA: 1, iB: 1, iSum: 2, sA: 0.5, sB: 0.5, aSp: 0, bSp: 0, sideContact: false };  // shared like _sep: both pairContact call sites destructure at once, keeping the relaxation loop allocation-free as its own comment promises
    // Reused AiDrive ctxs — not a fresh object literal to wantBoost /
    // otShouldFire / brakeDecision / wantX / adaptLane / otPull / defendPull /
    // isBoxed every physics step (~8 × 20 cars × 60 Hz). Same
    // read-before-next-call contract as _ct / AiDrive.traits.
    // Arc-bucket broadphase for resolveCollisions. Bucket width = LCAR so any
    // contacting pair shares a bucket or sits in adjacent ones (wrap-aware).
    const COL_BUCKET_M = LCAR_MAX;   // was LCAR — see LCAR_MAX: two yawed cars can span 5.2 m
    let _colShifted = false;  // shiftLong this step — skip idle re-buckets
    function _colProgOf(c) { return c._nOk ? c._nProg : c.prog; }
    function _colFillBuckets(ranked) {
      return fillArcBuckets(ranked, track.total || 1, COL_BUCKET_M, _colProgOf);
    }
    function sepShares(a, b) {
      const hum = AiDrive.humanInvMass(!!track.street);
      const iA = a.human ? hum : 1, iB = b.human ? hum : 1;
      const netA = netPlay.owns(a), netB = netPlay.owns(b);
      _sep.iA = iA; _sep.iB = iB; _sep.iSum = iA + iB;
      _sep.sA = netA ? 0 : (netB ? 1 : iA / _sep.iSum);
      _sep.sB = netB ? 0 : (netA ? 1 : iB / _sep.iSum);
      return _sep;
    }

    // Bucket-pair callbacks + per-pass inputs in module state — no closure per pass.
    let _colCbLast = false, _colCbRub = 1;
    const COL_SLOP = 0.05;   // separation slop — small, avoids a hard per-frame snap
    function _colResolveCB(a, b) { _colResolvePair(a, b, _colCbLast, _colCbRub); }
    function _colSepCB(a, b) { _colSepPair(a, b, COL_SLOP); }

    // Wrap-aware (prog, x) overlap + rear-vs-side decision. Hoisted out of
    // resolveCollisions so each phys step does not allocate a nested function.
    // Exact cheap-reject before wrap: |dProg| in (LCAR, L-LCAR) cannot contact.
    function pairContact(a, b) {
      // Trace-owned replay cars keep their recorded pose and speed, including
      // overlaps and pit-lane positions. They are never local contact bodies.
      if (ownsPose(a) || ownsPose(b)) return null;
      // Net remotes draw from delayed sample() but contact must use predict()
      // (netplay tick writes _nOk/_nProg/_nX/_nSpd). Local cars keep prog/x/speed.
      const aProg = a._nOk ? a._nProg : a.prog;
      const bProg = b._nOk ? b._nProg : b.prog;
      const aX = a._nOk ? a._nX : a.x;
      const bX = b._nOk ? b._nX : b.x;
      const aSp = a._nOk ? a._nSpd : a.speed;
      const bSp = b._nOk ? b._nSpd : b.speed;
      let dProg = aProg - bProg;
      if (!Number.isFinite(dProg)) return null;
      const L = track.total;
      const adProg = dProg < 0 ? -dProg : dProg;
      if (adProg > LCAR_MAX && adProg < L - LCAR_MAX) return null;
      dProg = ((dProg + L / 2) % L + L) % L - L / 2;
      if (Math.abs(dProg) > LCAR_MAX) return null;
      const dX = aX - bX;
      if (!Number.isFinite(dX)) return null;
      // Pair extents, yaw-aware (see LCAR_MAX above). Identical to LCAR/WCAR
      // for any pair that is not yawed past the blend's floor.
      const eLong = extLong(a) + extLong(b);
      const eLat = extLat(a) + extLat(b);
      const penLong = eLong - Math.abs(dProg);
      const penLat = eLat - Math.abs(dX);
      if (penLong <= 0 || penLat <= 0) return null;
      const angleA = bodyAngle(a), angleB = bodyAngle(b);
      const oriented = angleA !== 0 || angleB !== 0;
      const exact = oriented ? ContactGeometry.overlap(dProg, dX, angleA, angleB, geom) : null;
      if (oriented && !exact) return null;
      const { iA, iB, iSum, sA, sB } = sepShares(a, b);
      const closing = (dProg >= 0 ? bSp - aSp : aSp - bSp) > 0.5;
      const nestEdge = closing && penLong > 1.0 && penLat < 0.5;
      const forceRear = nestEdge && ((dProg >= 0 && b.human) || (dProg < 0 && a.human));
      _ct.dProg = dProg; _ct.dX = dX; _ct.penLong = penLong; _ct.penLat = penLat;
      _ct.iA = iA; _ct.iB = iB; _ct.iSum = iSum; _ct.sA = sA; _ct.sB = sB;
      _ct.aSp = aSp; _ct.bSp = bSp;
      _ct.oriented = oriented;
      if (exact) { _ct.depth = exact.depth; _ct.nx = exact.nx; _ct.ny = exact.ny; }
      // Least penetration is the MTV rule, and the MTV is not the contact FACE
      // on a box that is 2.4x longer than it is wide. Raw `penLat < penLong`
      // expands to |dProg| < 2.8 + |dX|, so a car 2.5 m DIRECTLY BEHIND another
      // under braking — |dX| = 0, no lateral overlap to speak of — classified as
      // a side rub and got squirted sideways by `sgn = dX >= 0 ? 1 : -1`, which
      // at dX = 0 is not a direction, just the sign of zero. Scale each
      // penetration by its own extent first (penLat/WCAR vs penLong/LCAR, here
      // cross-multiplied to dodge the divides): the test becomes
      // |dX| > (WCAR/LCAR)*|dProg|, i.e. the contact bearing against the car's
      // own aspect ratio. Nose-to-tail is now unreachable as a side contact, so
      // the sgn-of-zero case cannot be entered at all.
      _ct.sideContact = (penLat * eLong < penLong * eLat) && !forceRear;   // the pair's OWN aspect ratio, so a yawed car is judged on the box it presents
      return _ct;
    }

    // Frenet-frame collisions: (prog, x) is treated as a 2D plane. Each car is a
    // capsule ~4.8 m long and ~2.0 m wide (combined extents). We pick the contact
    // normal by EXTENT-SCALED penetration, not raw least penetration — see
    // pairContact — lateral penetration => a side rub
    // (separate on x, scrub speed); longitudinal => a rear-end (separate along the
    // track, transfer speed rear->front). Mass-weighted, several relaxation passes
    // to settle clusters, then a hard min-separation pass so cars can never render
    // merged. The player is "heavier" (AiDrive.humanInvMass) so the AI can't shove them off.
    function _colResolvePair(a, b, last, rubScrub) {
      if (incidentSim.owns(a) || incidentSim.owns(b)) return;
      if (a.finished && b.finished) return;   // coasting home: kinematic, and never racing each other
      const ct = pairContact(a, b);
      if (!ct) return;
      if (ct.oriented) { orientedResponse(a, b, ct, last); return; }
      const { dProg, dX, penLong, penLat, iA, iB, iSum, sA, sB, sideContact, aSp, bSp } = ct;
      if (sideContact) {
        // side-by-side contact: separate laterally, scrub a little speed. Mark
        // both cars "in contact" so the AI eases off steering this way and
        // stops fighting the push (the cause of the side-by-side vibration).
        const sgn = dX >= 0 ? 1 : -1;
        const corr = Math.max(penLat - 0.05, 0) * 0.35;   // gentler push -> rub, not bounce
        a.x += sgn * corr * sA;
        b.x -= sgn * corr * sB;
        // Skip scrub when corr≈0 (nest-edge / at-slop) — perpetual zero-corr side
        // contact was draining speed without separating the cars, and CORR_EPS is
        // what makes that guard actually hold. The FLAG takes the same gate:
        // contactT is not cosmetic (it gates the player's own stuck rescue), so it
        // must mean "we are colliding", not "we rounded".
        // AI vs AI: ONE car yields (AiDrive.sideYieldsA — behind on arc, or the
        // outer car when level) and only it is scrubbed AND flagged. Scrubbing and
        // softening BOTH gave neither priority, so both mirrored each other and
        // both sank to the throttle-vs-scrub balance (17.4 m/s at vmax 70) for as
        // long as the corner geometry kept them touching; flagging both while
        // scrubbing one was measured too (bench: prolonged-contact pairs 0 -> 3 on
        // monza) — the leader going compliant is what keeps the rub alive.
        // With a HUMAN in the pair there is no planner to mirror, so both flags keep
        // their original meaning: the human's gates their stuck rescue (a car
        // rubbing another is shuffling, not wedged), the AI's makes it compliant so
        // a player leaning on it can move it. The yielder still pays the scrub.
        // `rubScrub` is this STEP's speed loss (AiDrive.rubDecel x dt) and this runs
        // once per relaxation pass — four times a frame — so it is taken on the last
        // pass only. The old form was a 0.995 factor applied on every pass: 2 % a
        // frame, 48 m/s^2 at 40 m/s, and a player rubbing wheels lost 18 m/s in a
        // second (collision bench S5). The flag is idempotent and stays.
        if (corr > CORR_EPS) {
          if (a.human || b.human) a.contactT = b.contactT = 0.22;
          // The next corner (kTurn, AI-only) owns a level pair only between AI cars: a curvature read must not decide a PLAYER's scrub.
          if (AiDrive.sideYieldsA(dProg, a.x, b.x, a.human || b.human ? 0 : a.kTurn ?? b.kTurn)) { if (last) a.speed = scrub(a.speed, rubScrub); a.contactT = 0.22; }
          else { if (last) b.speed = scrub(b.speed, rubScrub); b.contactT = 0.22; }
          // INSIDE the guard, like everything else in this branch. It was the
          // one statement outside it, so a settled side-by-side rub — two cars
          // touching with no correction left to apply — re-fired audio, shake
          // and hit-stop every frame and banked a career `hits` count of ~14 in
          // five seconds of contact that the solver had already resolved.
          if (last) collideFx(a, b, Math.abs(aSp - bSp) * 0.02 + 0.18);
        }
      } else {
        // rear-end: separate along the track and nudge speeds together (gentle,
        // so hitting a car ahead doesn't slam you to a stop — you bump and tuck in)
        const sgn = dProg >= 0 ? 1 : -1;
        const corr = Math.max(penLong - 0.05, 0) * 0.4;
        shiftLong(a, sgn * corr * sA);
        shiftLong(b, -sgn * corr * sB);
        const relV = sgn >= 0 ? bSp - aSp : aSp - bSp;   // >0 means the rear car is closing
        if (relV > 0) {
          // Soft momentum exchange. Skip only cars Rapier already owns — a
          // relV≥15 skip would drop jImp even when promoteCarDynamic fails
          // later, leaving the pair with no resolver. owns() cars are
          // also skipped in _colSepPair; this is the same rule at the impulse.
          // notifyCar still queues a shunt; below threshold it no-ops (C3).
          if (!(incidentSim.owns(a) || incidentSim.owns(b))) {
            // A real impulse: j = (1 + e) * relV / (invA + invB). The old 0.5 was
            // (1 + e) = 0.5, i.e. e = -0.5 — after it the cars were STILL closing at
            // half speed, and penetration plus the position passes ate the rest over
            // ~30 frames: a bump read as being pushed along (collision bench S1,
            // both cars welded at the slop distance at one speed). Real cars are
            // near-inelastic at racing speeds (COR ~0.1 above ~7 m/s); below 1 m/s
            // closing the contact is resting and e is 0 (Box2D's velocity
            // threshold), so a following car does not jitter off a bumper.
            // ...and the coefficient off the pre-step reference, so the same
            // pair bounces the same way whoever else is in the queue.
            const aSp0 = Number.isFinite(a._preColSpd) ? a._preColSpd : aSp;
            const bSp0 = Number.isFinite(b._preColSpd) ? b._preColSpd : bSp;
            const relV0 = sgn >= 0 ? bSp0 - aSp0 : aSp0 - bSp0;
            const e = AiDrive.bumpRestitution(relV0 > 0 ? relV0 : relV);
            const jImp = (1 + e) * relV / iSum;
            // The car in front takes the punt in full — that is the kick you feel
            // and see. A HUMAN in front is capped: an AI misjudging a braking zone
            // must not launch the player down the road (the cap is a closing speed,
            // pace-scaled), while the AI behind still pays its whole share.
            const capV = AiDrive.humanPuntCap() * Math.max(G.PACE, 0.05);
            if (sgn >= 0) {
              b.speed = floorFwd(b, b.speed - iB * jImp);
              a.speed += iA * (a.human ? Math.min(jImp, (1 + e) * capV / iSum) : jImp);
            } else {
              a.speed = floorFwd(a, a.speed - iA * jImp);
              b.speed += iB * (b.human ? Math.min(jImp, (1 + e) * capV / iSum) : jImp);
            }
          }
          if (corr > CORR_EPS) a.contactT = b.contactT = 0.22;   // see the side branch: settled pairs must let it decay
          if (last) collideFx(a, b, clamp(relV * 0.03 + penLong * 0.05, 0.15, 1));
          // Debris hook (render-only side-world): closing speed = severity.
          if (last && DebrisWorld.active()) DebrisWorld.carImpact(a, b, relV);
          // Incident sim (R3/C3 + C1): a hard closing contact queues a
          // candidate. Only clears the R3 threshold for a real shunt (see
          // incidentsim); below it the cheap (prog,x) plane above stays the
          // resolver — THAT event-scoping is C3. Self-guarding no-op otherwise.
          if (last && !netPlay.owns(a) && !netPlay.owns(b)) incidentSim.notifyCar(a, b, relV);   // as the oriented path: a rival is POSED, never simulated here
        }
      }
    }

    function _colSepPair(a, b, SLOP) {
      if (incidentSim.owns(a) || incidentSim.owns(b)) return;
      if (a.finished && b.finished) return;   // coasting home: kinematic, and never racing each other
      const ct = pairContact(a, b);
      if (!ct) return;
      if (ct.oriented) {
        const corr = Math.max(0, ct.depth - SLOP);
        shiftLong(a, ct.nx * corr * ct.sA); shiftLong(b, -ct.nx * corr * ct.sB);
        a.x += ct.ny * corr * ct.sA; b.x -= ct.ny * corr * ct.sB;
        return;
      }
      const { dProg, dX, penLong, penLat, sA, sB, sideContact } = ct;
      if (sideContact) {
        const c = Math.max(penLat - SLOP, 0) * 0.6;
        if (c <= 0) return;
        const sgn = dX >= 0 ? 1 : -1;
        a.x += sgn * c * sA;
        b.x -= sgn * c * sB;
      } else {
        const c = Math.max(penLong - SLOP, 0) * 0.6;
        if (c <= 0) return;
        const sgn = dProg >= 0 ? 1 : -1;
        shiftLong(a, sgn * c * sA);
        shiftLong(b, -sgn * c * sB);
      }
    }

    // Walk each occupied bucket against itself and the next bucket (mod nB).
    // Bucket width = LCAR → any contacting pair is co-bucketed or adjacent.
    // Each unordered pair is visited once (within-bucket i<j; across only b→b+1).
    // `fwd` alternates the SWEEP DIRECTION, and its absence here was a real
    // asymmetry between the two paths. Relaxation is Gauss-Seidel: each pair is
    // resolved against positions already moved by the pairs before it, so the
    // result carries a bias in the direction of the sweep. The all-pairs branch
    // has always cancelled that by reversing on odd passes (`fwd = (pass & 1)
    // === 0`) — and the BUCKET branch, which is the one every race over twelve
    // cars actually takes, always walked the buckets forward. So the small
    // field got the symmetrised solver and the full grid did not.
    // Same pair SET either way (each undirected edge is still visited exactly
    // once, via the forward-neighbour rule below) — only the order changes,
    // which is the whole point. Omitted (the separation pass, which runs once)
    // it stays forward, exactly as before.
    function _colForBucketPairs(nB, fn, fwd) {
      const nIds = _arcBucketIds.length;
      for (let k = 0; k < nIds; k++) {
        const bi = fwd === false ? nIds - 1 - k : k;
        const id = _arcBucketIds[bi];
        const A = _arcBuckets[id];
        if (!A || !A.length) continue;
        for (let i = 0; i < A.length; i++) {
          const a = A[i];
          for (let j = i + 1; j < A.length; j++) fn(a, A[j]);
        }
        // Forward neighbour only — each undirected cross edge is visited once,
        // including the wrap edge (nB-1 → 0).
        if (nB < 2) continue;
        const id2 = (id + 1) % nB;
        const B = _arcBuckets[id2];
        if (!B || !B.length) continue;
        for (let i = 0; i < A.length; i++) {
          const a = A[i];
          for (let j = 0; j < B.length; j++) fn(a, B[j]);
        }
      }
    }

    function resolveCollisions(ranked, dt) {
      track = G.track; player = G.player; netPlay = G.netPlay;   // once per step, not per pair
      const PASSES = 4;
      // Snapshot the player's road coords so the writeback at the end can tell
      // whether this pass actually shoved it (see there for why that matters).
      const _preColS = player ? player.s : 0, _preColX = player ? player.x : 0;
      if (motionTrack !== track || G.raceT < motionTime) { motion = new WeakMap(); motionTrack = track; }
      motionTime = G.raceT;
      // AI cars mirrored their world pose BEFORE this pass (updateCar's tail), so a
      // shove rendered one step late; snapshot so the clamp loop can re-mirror.
      for (const c of ranked) if (!ownsPose(c) && !c.human) { c._preColS = c.s; c._preColX = c.x; }
      sweepContacts(ranked, dt || FIXED_DT);
      // PRE-STEP CLOSING SPEED, for the restitution reference only. aSp/bSp are
      // read LIVE, and _colResolvePair mutates .speed as it goes, so in a
      // concertina a car that was already bumped earlier in the same pass
      // presents a different closing speed to its next pair — and
      // bumpRestitution is a RAMP over closing speed (0 under 1 m/s, 0.1 above
      // 3), so how bouncy your bump is depended on who happened to be behind
      // you and in what order the solver reached them. The impulse itself keeps
      // the live relative velocity: that is momentum, and it must see the state
      // it is actually correcting. Only `e` moves to the snapshot.
      // Mirrors aSp/bSp for a net-owned car, whose predicted speed is the
      // reference and is not ours to mutate.
      for (const c of ranked) if (!ownsPose(c)) c._preColSpd = c._nOk ? c._nSpd : c.speed;
      // Side-rub speed loss for this step, in m/s: a deceleration (AiDrive.rubDecel)
      // times the step, so the headless harness's arbitrary dt scrubs per second.
      const rubScrub = AiDrive.rubDecel(!!track.street) * (dt || FIXED_DT);
      // Tiny fields: all-pairs is fine and avoids bucket rebuild cost. Larger
      // fields (MP / expanded AI) use arc buckets so pairContact stays O(n·k).
      const useBuckets = ranked.length > 12;
      let nB = 0;
      if (useBuckets) { nB = _colFillBuckets(ranked); _colShifted = false; }
      else if (Log.enabled("game", Log.DEBUG)) {
        Log.debug("game", "resolveCollisions all-pairs n=" + ranked.length);
      }
      for (let pass = 0; pass < PASSES; pass++) {
        const last = pass === PASSES - 1;
        if (useBuckets) {
          // Re-bucket only when shiftLong moved someone — idle passes keep the grid.
          if (pass > 0 && _colShifted) { nB = _colFillBuckets(ranked); _colShifted = false; }
          _colCbLast = last; _colCbRub = rubScrub;
          _colForBucketPairs(nB, _colResolveCB, (pass & 1) === 0);
        } else {
          const fwd = (pass & 1) === 0;
          for (let ii = 0; ii < ranked.length; ii++) {
            const i = fwd ? ii : ranked.length - 1 - ii;
            const a = ranked[i];
            if (incidentSim.owns(a)) continue;
            for (let j = i + 1; j < ranked.length; j++) {
              _colResolvePair(a, ranked[j], last, rubScrub);
            }
          }
        }
      }
      // separation pass: enforce the car boundary firmly so they don't visibly
      // overlap. A small slop is kept to avoid a hard per-frame snap (the proactive
      // steering separation now keeps cars spaced, so collisions rarely fire and a
      // tighter boundary does not vibrate).
      if (useBuckets) {
        if (_colShifted) nB = _colFillBuckets(ranked);
        _colForBucketPairs(nB, _colSepCB);
      } else {
        for (let i = 0; i < ranked.length; i++) {
          const a = ranked[i];
          if (incidentSim.owns(a)) continue;   // Rapier owns this car's separation
          for (let j = i + 1; j < ranked.length; j++) {
            _colSepPair(a, ranked[j], COL_SLOP);
          }
        }
      }
      // keep everyone inside the per-side barriers after being shoved around
      for (const c of ranked) {
        if (ownsPose(c) || incidentSim.owns(c)) continue;   // the pose owner supplies its own boundary
        // The SAME boundary WallClamp.apply enforces every tick (barriers, pit wall,
        // exit wall, gantry legs), so a shove cannot leave a car past the pit wall
        // or a leg for the rest of this step.
        const lim = _wallLimits(track, c.s, c.x, _lim);
        if (c.x > lim.r) c.x = lim.r; else if (c.x < -lim.l) c.x = -lim.l;
        if (lim.laneMin > 0 && c.x * lim.side < lim.laneMin) c.x = lim.laneMin * lim.side;
        if (!c.human && (c.s !== c._preColS || c.x !== c._preColX)) {
          const w = G.worldFromTrack(c.s, c.x);
          c.px = w.x; c.pz = w.z;
        }
      }
      // The player runs world-space physics; if this pass actually MOVED its (s, x)
      // — a bump, a shove, a barrier clamp — feed that back into px/pz, or the next
      // frame's integration would overwrite the push and cars would slide through
      // each other. Heading is unchanged by a bump.
      //
      // ONLY when it moved. Run every frame, world → (s, x) → world is a
      // per-frame feedback loop; with a reconstruction that is not quite the
      // inverse of the read (see worldFromTrack) the loop has gain < 1 and drags
      // the car onto the centreline. Untouched frames must leave the car's own integration alone.
      if (player && player.px != null && !player.finished && !ownsPose(player) && !incidentSim.owns(player) &&
          (player.s !== _preColS || player.x !== _preColX)) {
        const w = G.worldFromTrack(player.s, player.x);
        player.px = w.x;
        player.pz = w.z;
      }
      for (const c of ranked) {
        if (ownsPose(c)) { motion.delete(c); continue; }   // no sweep from a prior driving pose after handback
        let p = motion.get(c); if (!p) { p = {}; motion.set(c, p); }
        p.prog = c.prog; p.x = c.x; p.angle = bodyAngle(c);
      }
    }

    // shiftLong and sepShares were on this API with no reader anywhere;
    // both are still used INSIDE resolveCollisions, which is the contract.
    return { resolveCollisions, pairContact };
  }

  return { create, LCAR, WCAR, fillArcBuckets, forArcNear, scanTraffic, scanOtAhead, scanTow };
})();
