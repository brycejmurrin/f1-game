"use strict";

const Collide = (() => {
  const clamp = M4.clamp;
  const wrapDelta = M4.wrapDelta, TWO_PI = 2 * Math.PI;
  const FIXED_DT = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.FIXED_DT) || 1 / 60;
  const LCAR = 4.8, WCAR = 2.0;
  const HL = LCAR / 2, WL = WCAR / 2;

  const YAW_LO = 20 * Math.PI / 180, YAW_HI = 60 * Math.PI / 180;
  function yawMix(psi) {
    const a = psi < 0 ? -psi : psi;
    if (!(a > YAW_LO)) return 0;
    if (a >= YAW_HI) return 1;
    const t = (a - YAW_LO) / (YAW_HI - YAW_LO);
    return t * t * (3 - 2 * t);
  }
  function extentAngle(c) {
    const psi = c.human && Number.isFinite(c.yawVis) ? c.yawVis : 0;
    return psi * yawMix(psi);
  }
  function bodyAngle(c) { const psi = c.human && Number.isFinite(c.yawVis) ? c.yawVis : 0; return psi * yawMix(psi); }
  function yawVisAngle(c) { return c.human && Number.isFinite(c.yawVis) ? c.yawVis : 0; }
  const LCAR_MAX = 2 * Math.hypot(HL, WL);

  const _arcBuckets = [];
  const _arcBucketIds = [];
  const _arcN = [];
  let _arcNB = 0, _arcWidth = LCAR_MAX, _arcL = 1;
  function _arcProg(c) {
    if (c && c._snapProg != null && Number.isFinite(c._snapProg)) return c._snapProg;
    return c && c._nOk ? c._nProg : (c ? c.prog : 0);
  }
  function _arcClear() {
    for (let i = 0; i < _arcBucketIds.length; i++) {
      const id = _arcBucketIds[i], arr = _arcBuckets[id];
      for (let j = 0, n = _arcN[id]; j < n; j++) arr[j] = null;
      _arcN[id] = 0;
    }
    _arcBucketIds.length = 0;
  }
  function releaseArcBuckets() {
    _arcClear(); _ot.c = _ot.ahead = _ot.skip = null;
    _traf.c = _traf.blocker = _traf.towCar = _traf.chaser = _traf.alongO = null; _tow.c = _tow.tc = null;
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
      if (!arr) { arr = _arcBuckets[b] = []; _arcN[b] = 0; }
      const len = _arcN[b];
      if (len === 0) _arcBucketIds.push(b);
      arr[len] = c; _arcN[b] = len + 1;
    }
    return nB;
  }
  function forArcNear(c, L, reach, fn, progOf, backSpan) {
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
        const bid = _arcBucketIds[k], arr = _arcBuckets[bid];
        if (!arr) continue;
        for (let i = 0, n = _arcN[bid]; i < n; i++) {
          const o = arr[i];
          if (o !== c) fn(o);
        }
      }
      return;
    }
    for (let d = backSpan > 0 && backSpan < span ? -backSpan : -span; d <= span; d++) {
      let id = b0 + d;
      id %= nB;
      if (id < 0) id += nB;
      const arr = _arcBuckets[id], n = arr ? _arcN[id] : 0;
      if (!n) continue;
      for (let i = 0; i < n; i++) {
        const o = arr[i];
        if (o !== c) fn(o);
      }
    }
  }
  function _liveProg(c) { return c.prog; }
  function arcBackSpan(L, reach, back) {
    const W = _arcWidth, LL = L || _arcL || 1;
    if (!_arcNB || !Number.isFinite(reach) || !Number.isFinite(back) || back < 0) return 0;
    const span = (Math.floor(reach / W) | 0) + 1;
    return LL >= 2 * (span + 2) * W ? (Math.floor(back / W) | 0) + 2 : 0;
  }
  const PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : {};
  const _towRange = PC.TOW_RANGE || 34, _towHalfW = PC.TOW_HALF_W || 4, _blockerHalfW = PC.BLOCKER_HALF_W || 2.2;
  const _traf = {
    c: null, L: 0, BACK: 0, REJ: 0, MIN_GAP: 0, street: false,
    roomL: 0, roomR: 0, nearbyN: 0, sep: 0,
    blocker: null, blockerGap: Infinity, towCar: null, towGap: Infinity,
    chaser: null, chaserGap: Infinity,
    alongO: null, alongDx: 0, alongDprog: 0, alongAdx: Infinity,
  };
  _traf.sep = _traf.alongDx = _traf.alongDprog = _traf.BACK = 0.5; _traf.sep = _traf.alongDx = _traf.alongDprog = _traf.BACK = 0;
  const _brakePlan = 0.5 * (PC.BRAKE || 22), _blockerMargin = 10, _blockerReachMax = 160;
  function blockerReach(closing) {
    return closing > 0 ? Math.min(_blockerReachMax, _blockerMargin + closing * closing / (2 * _brakePlan)) : 0;
  }
  function _onTrafO(o) {
    const s = _traf, c = s.c;
    const fin = !!o.finished;
    let dprog = o._snapProg - c.prog;
    if (!Number.isFinite(dprog)) return;
    const ad = dprog < 0 ? -dprog : dprog, L = s.L, REJ = s.REJ;
    if (ad > REJ && ad < L - REJ) return;
    dprog = ((dprog + L / 2) % L + L) % L - L / 2;
    if (dprog < -s.BACK) return;
    if (dprog > 34) {
      if (dprog < s.blockerGap && dprog < blockerReach(c.speed - (o._snapSpeed || 0)) && Math.abs(o._snapX - c.x) < _blockerHalfW) { s.blocker = o; s.blockerGap = dprog; }
      return;
    }
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
    if (fin) return;
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
    const reach = Math.max(REJ, blockerReach(c.speed));
    s.REJ = reach;
    forArcNear(c, L, reach, _onTrafO, _liveProg, arcBackSpan(L, reach, BACK));
    s.roomL = Math.max(0, s.roomL); s.roomR = Math.max(0, s.roomR);
    return s;
  }
  const _ot = { c: null, L: 0, W: 0, ahead: null, gapAhead: Infinity, skip: null };
  _ot.L = _ot.W = 0.5; _ot.L = _ot.W = 0;
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

  const CORR_EPS = 1e-3;

  const _lim = { r: 0, l: 0, laneMin: 0, side: 0 }, _postLim = { r: 0, l: 0, minOut: 0, side: 0 };
  const _prevPos = { s: 0, x: 0 };
  _lim.laneMin = 0.5; _lim.laneMin = 0;

  function create(G, collideFx, ownsPose = () => false) {
    Log.info("game", "Collide.create");
    const wrapS = G.wrapS;
    const incidentSim = IncidentSim;
    let track = null, player = null, netPlay = null;
    let motion = new WeakMap(), motionTrack = null, motionTime = -1;
    let sweepGeneration = 0;
    const _fxPairs = new WeakMap();
    function firstPairFx(a, b) {
      let peers = _fxPairs.get(a);
      const reverse = _fxPairs.get(b);
      if ((peers && peers.get(b) === sweepGeneration) || (reverse && reverse.get(a) === sweepGeneration)) return false;
      if (!peers) { peers = new WeakMap(); _fxPairs.set(a, peers); }
      peers.set(b, sweepGeneration);
      return true;
    }
    const _swP = [];
    const geom = {}, swept = {}, impulse = {}, bodyA = {}, bodyB = {};
    function deltaS(d) { const L = track.total; return ((d + L / 2) % L + L) % L - L / 2; }
    function sweepMotion(c, p, dt) {
      if (p.sweepGeneration === sweepGeneration) return;
      p.sweepGeneration = sweepGeneration;
      p.sweepD = deltaS(c.prog - p.prog); p.sweepX = c.x - p.x;
      p.sweepEligible = false;
      p.sweepTwist = false;
      const lim = Math.max(6, Math.abs(c.speed) * dt * 2 + 1);
      if (p.sweepD * p.sweepD + p.sweepX * p.sweepX > lim * lim) return;
      p.sweepAngle = bodyAngle(c);
      p.sweepTwist = Math.abs(wrapDelta(p.sweepAngle - p.angle, TWO_PI)) > 0.15;
      p.sweepEligible = true;
    }
    function body(c, speed, out) {
      const angle = yawVisAngle(c), cs = Math.cos(angle), sn = Math.sin(angle);
      out.angle = bodyAngle(c);
      out.vx = speed * cs - (c.vLat || 0) * sn;
      out.vy = speed * sn + (c.vLat || 0) * cs;
      out.omega = c.human && Number.isFinite(c.yawRateCur) ? c.yawRateCur : 0;
      out.invMass = netPlay.owns(c) || c.retired ? 0 : c.human ? AiDrive.humanInvMass(!!track.street) : 1;
      out.invInertia = c.human ? out.invMass / ContactGeometry.INERTIA : 0;
      return out;
    }
    function floorFwd(c, v) { return c.human && c.speed < 0 ? v : Math.max(0, v); }
    function scrub(v, d) { return v > 0 ? Math.max(0, v - d) : Math.min(0, v + d); }
      function pushVelocity(c, state, dx, dy, dw) {
        if (netPlay.owns(c) || c.retired) return;
        const angle = yawVisAngle(c), cs = Math.cos(angle), sn = Math.sin(angle);
        const vx = state.vx + dx, vy = state.vy + dy;
        c.speed = floorFwd(c, vx * cs + vy * sn);
        if (c.human) {
          c.vLat = clamp(vy * cs - vx * sn, -40, 40);
          c.yawRateCur = clamp(state.omega + dw, -4, 4);
        }
      }
    function orientedResponse(a, b, ct) {
      const correction = Math.max(0, ct.depth - COL_SLOP) * 0.7;
      shiftLong(a, ct.nx * correction * ct.sA); shiftLong(b, -ct.nx * correction * ct.sB);
      a.x += ct.ny * correction * ct.sA; b.x -= ct.ny * correction * ct.sB;
      const ba = body(a, ct.aSp, bodyA), bb = body(b, ct.bSp, bodyB);
      const j = ContactGeometry.impulse(ba, bb, ct.dProg, ct.dX, ct, impulse);
      if (j.magnitude > 0 && a.human !== b.human) capOrientedPunt(a.human ? a : b, a.human ? b : a, a.human ? ba : bb, a.human ? bb : ba, j, a.human);
      pushVelocity(a, ba, j.ax, j.ay, j.aw); pushVelocity(b, bb, j.bx, j.by, j.bw);
      if (correction > CORR_EPS || j.magnitude > CORR_EPS) {
        if (!netPlay.owns(a)) a.contactT = 0.22;
        if (!netPlay.owns(b)) b.contactT = 0.22;
        if (firstPairFx(a, b)) collideFx(a, b, clamp(j.closing * 0.03, 0.15, 1));
        if (j.magnitude > CORR_EPS && !netPlay.owns(a) && !netPlay.owns(b) && !a.retired && !b.retired) {
          if (DebrisWorld.active()) DebrisWorld.carImpact(a, b, j.closing);
          incidentSim.notifyCar(a, b, j.closing);
        }
      }
    }
    function capOrientedPunt(h, o, hb, ob, j, isA) {
      if (!(hb.invMass > 0)) return;
      const dx = isA ? j.ax : j.bx, dy = isA ? j.ay : j.by, dw = isA ? j.aw : j.bw;
      const v0 = Math.hypot(hb.vx, hb.vy), v1 = Math.hypot(hb.vx + dx, hb.vy + dy), gain = v1 - v0;
      if (!(gain > 0)) return;
      const w1 = hb.omega + dw, rot = hb.invInertia > 0 ? (w1 * w1 - hb.omega * hb.omega) / hb.invInertia : 0;
      if (!((v1 * v1 - v0 * v0) / hb.invMass + rot > 0)) return;
      const capV = hb.invMass * (1 + AiDrive.bumpRestitution(j.closing)) * AiDrive.humanPuntCap() * Math.max(G.PACE, 0.05) / (hb.invMass + ob.invMass);
      const give = puntShare(o, h, gain, capV);
      if (give >= gain) return;
      const f = give / gain;
      if (isA) { j.ax *= f; j.ay *= f; j.aw *= f; } else { j.bx *= f; j.by *= f; j.bw *= f; }
    }
    function sweepContacts(ranked, dt) {
      sweepGeneration++;
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
          const sx = b.x - pb.x, sd = b.prog - pb.prog;
          if (sx === sx && sd - sd === 0) {
            const reach = reachA + Math.max(6, Math.abs(b.speed) * dt * 2 + 1), dp = pa.prog - pb.prog, ad = dp < 0 ? -dp : dp;
            if (ad > reach + 1e-3 && ad < track.total - reach - 1e-3) continue;
            if (Math.abs(deltaS(dp)) > reach) continue;
          }
          if (ownsPose(b) || incidentSim.owns(b) || netPlay.owns(b)) continue;
          sweepMotion(b, pb, dt);
          if (!pb.sweepEligible) continue;
          const db = pb.sweepD, xb = pb.sweepX;
          const rd = da - db, rx = xa - xb;
          if (rd * rd + rx * rx < 1) continue;
          const x0 = deltaS(pa.prog - pb.prog), y0 = pa.x - pb.x, x1 = x0 + da - db, y1 = y0 + xa - xb;
          if (Math.min(x0, x1) > LCAR_MAX || Math.max(x0, x1) < -LCAR_MAX) continue;
          const twist = pa.sweepTwist || pb.sweepTwist;
          const a0 = twist ? 0 : pa.angle, b0 = twist ? 0 : pb.angle;
          const a1 = twist ? 0 : pa.sweepAngle, b1 = twist ? 0 : pb.sweepAngle;
          if (ContactGeometry.overlap(x1, y1, a1, b1, geom)) continue;
          const hit = ContactGeometry.sweep(x0, y0, x1, y1, a0, b0, swept);
          if (!hit) continue;
          const t = hit.time;
          shiftLong(a, da * (t - 1)); shiftLong(b, db * (t - 1));
          a.x = pa.x + xa * t; b.x = pb.x + xb * t;
          const shares = sepShares(a, b);
          hit.dProg = x0 + (da - db) * t; hit.dX = y0 + (xa - xb) * t;
          hit.aSp = a.speed; hit.bSp = b.speed; hit.sA = shares.sA; hit.sB = shares.sB;
          orientedResponse(a, b, hit);
          pa.sweepGeneration = pb.sweepGeneration = 0;
          break;
        }
      }
    }

    function shiftLong(c, d) {
      if (d === 0) return;
      c.s = wrapS(c.s + d);
      c.prog += d; c._pushD = (c._pushD || 0) + d;
      _colShifted = true;
    }

    const _sep = { iA: 1, iB: 1, iSum: 2, sA: 0.5, sB: 0.5 };
    const _ct = { dProg: 0, dX: 0, penLong: 0, penLat: 0, iA: 1, iB: 1, iSum: 2, sA: 0.5, sB: 0.5, aSp: 0, bSp: 0, sideContact: false };
    _ct.dProg = _ct.dX = _ct.penLong = _ct.penLat = _ct.aSp = _ct.bSp = 0.5; _ct.dProg = _ct.dX = _ct.penLong = _ct.penLat = _ct.aSp = _ct.bSp = 0;
    const COL_BUCKET_M = LCAR_MAX;
    let _colShifted = false;
    function _colProgOf(c) { return c._nOk ? c._nProg : c.prog; }
    function _colFillBuckets(ranked) {
      return fillArcBuckets(ranked, track.total || 1, COL_BUCKET_M, _colProgOf);
    }
    function sepShares(a, b) {
      const hum = AiDrive.humanInvMass(!!track.street);
      const netA = netPlay.owns(a) || !!a.retired, netB = netPlay.owns(b) || !!b.retired;
      const iA = netA ? 0 : a.human ? hum : 1, iB = netB ? 0 : b.human ? hum : 1;
      _sep.iA = iA; _sep.iB = iB; _sep.iSum = iA + iB;
      _sep.sA = netA ? 0 : (netB ? 1 : iA / _sep.iSum);
      _sep.sB = netB ? 0 : (netA ? 1 : iB / _sep.iSum);
      return _sep;
    }

    let _colCbLast = false, _colCbRub = 1;
    let _colTouched = false;
    const COL_SLOP = 0.05;
    function _colResolveCB(a, b) { _colResolvePair(a, b, _colCbLast, _colCbRub); }
    function _colSepCB(a, b) { _colSepPair(a, b, COL_SLOP); }

    function pairContact(a, b) {
      if (ownsPose(a) || ownsPose(b)) return null;
      if ((a.retired || netPlay.owns(a)) && (b.retired || netPlay.owns(b))) return null;
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
      const ea = extentAngle(a), eb = extentAngle(b);
      let eLong, eLat;
      if (ea === 0 && eb === 0) { eLong = LCAR; eLat = WCAR; }
      else {
        const ca = Math.abs(Math.cos(ea)), sa = Math.abs(Math.sin(ea));
        const cb = Math.abs(Math.cos(eb)), sb = Math.abs(Math.sin(eb));
        eLong = (HL * ca + WL * sa) + (HL * cb + WL * sb);
        eLat = (HL * sa + WL * ca) + (HL * sb + WL * cb);
      }
      const penLong = eLong - Math.abs(dProg);
      const penLat = eLat - Math.abs(dX);
      if (!(penLong > 0) || !(penLat > 0)) return null;
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
      _ct.sideContact = (penLat * eLong < penLong * eLat) && !forceRear;
      return _ct;
    }

    const _puntFrom = [], _puntTo = [], _puntJ = [];
    let _puntN = 0;
    function puntShare(from, to, jImp, capJ) {
      let k = 0;
      while (k < _puntN && (_puntFrom[k] !== from || _puntTo[k] !== to)) k++;
      if (k === _puntN) { _puntFrom[k] = from; _puntTo[k] = to; _puntJ[k] = 0; _puntN++; }
      const give = Math.max(0, Math.min(jImp, capJ - _puntJ[k]));
      _puntJ[k] += give;
      return give;
    }
    function _colResolvePair(a, b, last, rubScrub) {
      if (incidentSim.owns(a) || incidentSim.owns(b)) return;
      if (a.finished && b.finished) return;
      const ct = pairContact(a, b);
      if (!ct) return;
      _colTouched = true;
      if (ct.oriented) { orientedResponse(a, b, ct); return; }
      const { dProg, dX, penLong, penLat, iA, iB, iSum, sA, sB, sideContact, aSp, bSp } = ct;
      if (sideContact) {
        const sgn = dX >= 0 ? 1 : -1;
        const corr = Math.max(penLat - 0.05, 0) * 0.35;
        a.x += sgn * corr * sA;
        b.x -= sgn * corr * sB;
        if (corr > CORR_EPS) {
          if (a.human || b.human) a.contactT = b.contactT = 0.22;
          if (AiDrive.sideYieldsA(dProg, a.x, b.x, a.human || b.human ? 0 : AiDrive.cornerK(a.kTurn, b.kTurn))) { if (last) a.speed = scrub(a.speed, rubScrub); a.contactT = 0.22; }
          else { if (last) b.speed = scrub(b.speed, rubScrub); b.contactT = 0.22; }
          if (firstPairFx(a, b)) collideFx(a, b, Math.abs(aSp - bSp) * 0.02 + 0.18);
        }
      } else {
        const sgn = dProg >= 0 ? 1 : -1;
        const corr = Math.max(penLong - 0.05, 0) * 0.4;
        shiftLong(a, sgn * corr * sA);
        shiftLong(b, -sgn * corr * sB);
        const relV = sgn >= 0 ? bSp - aSp : aSp - bSp;
        if (relV > 0) {
          if (iSum > 0 && !(incidentSim.owns(a) || incidentSim.owns(b))) {
            const aSp0 = Number.isFinite(a._preColSpd) ? a._preColSpd : aSp;
            const bSp0 = Number.isFinite(b._preColSpd) ? b._preColSpd : bSp;
            const relV0 = sgn >= 0 ? bSp0 - aSp0 : aSp0 - bSp0;
            const e = AiDrive.bumpRestitution(relV0 > 0 ? relV0 : relV);
            const jImp = (1 + e) * relV / iSum;
            const capJ = (1 + e) * AiDrive.humanPuntCap() * Math.max(G.PACE, 0.05) / iSum;
            if (sgn >= 0) {
              if (iB) b.speed = floorFwd(b, b.speed - iB * jImp);
              if (iA) a.speed += a.human ? puntShare(b, a, iA * jImp, iA * capJ) : iA * jImp;
            } else {
              if (iA) a.speed = floorFwd(a, a.speed - iA * jImp);
              if (iB) b.speed += b.human ? puntShare(a, b, iB * jImp, iB * capJ) : iB * jImp;
            }
          }
          if (corr > CORR_EPS) { if (!netPlay.owns(a)) a.contactT = 0.22; if (!netPlay.owns(b)) b.contactT = 0.22; }
          const fx = firstPairFx(a, b);
          if (fx) collideFx(a, b, clamp(relV * 0.03 + penLong * 0.05, 0.15, 1));
          if (fx && DebrisWorld.active()) DebrisWorld.carImpact(a, b, relV);
          if (fx && !netPlay.owns(a) && !netPlay.owns(b) && !a.retired && !b.retired) incidentSim.notifyCar(a, b, relV);
        }
      }
    }

    function _colSepPair(a, b, SLOP) {
      if (incidentSim.owns(a) || incidentSim.owns(b)) return;
      if (a.finished && b.finished) return;
      const ct = pairContact(a, b);
      if (!ct) return;
      _colTouched = true;
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

    function _colForBucketPairs(nB, fn, fwd) {
      const nIds = _arcBucketIds.length;
      for (let k = 0; k < nIds; k++) {
        const bi = fwd === false ? nIds - 1 - k : k;
        const id = _arcBucketIds[bi];
        const A = _arcBuckets[id], nA = A ? _arcN[id] : 0;
        if (!nA) continue;
        for (let i = 0; i < nA; i++) {
          const a = A[i];
          for (let j = i + 1; j < nA; j++) fn(a, A[j]);
        }
        if (nB < 2) continue;
        const id2 = (id + 1) % nB;
        const B = _arcBuckets[id2], nB2 = B ? _arcN[id2] : 0;
        if (!nB2) continue;
        for (let i = 0; i < nA; i++) {
          const a = A[i];
          for (let j = 0; j < nB2; j++) fn(a, B[j]);
        }
      }
    }

    function resolveCollisions(ranked, dt) {
      track = G.track; player = G.player; netPlay = G.netPlay;
      const PASSES = 4;
      const _preColS = player ? player.s : 0, _preColX = player ? player.x : 0;
      if (motionTrack !== track || G.raceT < motionTime) { motion = new WeakMap(); motionTrack = track; }
      motionTime = G.raceT;
      for (let i = 0; i < ranked.length; i++) { const c = ranked[i]; if (!ownsPose(c) && !c.human) { c._preColS = c.s; c._preColX = c.x; } }
      sweepContacts(ranked, dt || FIXED_DT);
      for (let i = 0; i < ranked.length; i++) { const c = ranked[i]; if (!ownsPose(c)) c._preColSpd = c._nOk ? c._nSpd : c.speed; }
      const rubScrub = AiDrive.rubDecel(!!track.street) * (dt || FIXED_DT);
      const useBuckets = ranked.length > 12;
      let nB = 0;
      if (useBuckets) { nB = _colFillBuckets(ranked); _colShifted = false; }
      else if (Log.enabled("game", Log.DEBUG)) {
        Log.debug("game", "resolveCollisions all-pairs n=" + ranked.length);
      }
      for (let pass = 0; pass < PASSES; pass++) {
        if (pass > 0 && !_colTouched) break;
        _colTouched = false;
        const last = pass === PASSES - 1;
        if (useBuckets) {
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
      for (let k = 0; k < _puntN; k++) _puntFrom[k] = _puntTo[k] = null;
      _puntN = 0;
      if (useBuckets) {
        if (_colShifted) nB = _colFillBuckets(ranked);
        _colForBucketPairs(nB, _colSepCB);
      } else {
        for (let i = 0; i < ranked.length; i++) {
          const a = ranked[i];
          if (incidentSim.owns(a)) continue;
          for (let j = i + 1; j < ranked.length; j++) {
            _colSepPair(a, ranked[j], COL_SLOP);
          }
        }
      }
      for (let i = 0; i < ranked.length; i++) {
        const c = ranked[i];
        if (ownsPose(c) || incidentSim.owns(c)) continue;
        let prev = null;
        if (c === player) { _prevPos.s = _preColS; _prevPos.x = _preColX; prev = _prevPos; }
        else if (!c.human && Number.isFinite(c._preColS) && Number.isFinite(c._preColX)) { _prevPos.s = c._preColS; _prevPos.x = c._preColX; prev = _prevPos; }
        const lim = ContactGeometry.wallLimits(track, c.s, c.x, _lim, _postLim, prev);
        if (c.x > lim.r) c.x = lim.r; else if (c.x < -lim.l) c.x = -lim.l;
        if (lim.laneMin > 0 && c.x * lim.side < lim.laneMin) c.x = lim.laneMin * lim.side;
        if (!c.human && (c.s !== c._preColS || c.x !== c._preColX)) {
          const w = G.worldFromTrack(c.s, c.x);
          c.px = w.x; c.pz = w.z;
        }
      }
      if (player && player.px != null && !player.finished && !ownsPose(player) && !incidentSim.owns(player) &&
          (player.s !== _preColS || player.x !== _preColX)) {
        const w = G.worldFromTrack(player.s, player.x);
        player.px = w.x;
        player.pz = w.z;
      }
      for (let i = 0; i < ranked.length; i++) {
        const c = ranked[i];
        if (ownsPose(c)) { motion.delete(c); continue; }
        let p = motion.get(c); if (!p) { p = {}; motion.set(c, p); }
        p.prog = c.prog; p.x = c.x; p.angle = bodyAngle(c);
      }
    }

    function releaseTrack() { track = motionTrack = player = netPlay = null; motion = new WeakMap(); motionTime = -1; }
    return { resolveCollisions, pairContact, releaseTrack };
  }

  function parkedAhead(c, parked, L, reach) {
    let best = null, bestAbs = Infinity;
    for (let i = 0; i < parked.length; i++) {
      const o = parked[i];
      const d = ((o.s - c.s + L / 2) % L + L) % L - L / 2;
      if (!(d > -LCAR && d < reach)) continue;
      const ad = d < 0 ? -d : d;
      if (ad < bestAbs) { best = o; bestAbs = ad; }
    }
    return best;
  }

  return { create, LCAR, WCAR, fillArcBuckets, releaseArcBuckets, forArcNear, arcBackSpan, scanTraffic, scanOtAhead, scanTow, parkedAhead };
})();
