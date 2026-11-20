const AiDrive = (function () {
  "use strict";

  const clamp = M4.clamp;
  const lerp = M4.lerp;
  const damp = (c, t, l, dt) => lerp(c, t, 1 - Math.exp(-l * dt));

  const _traits = {
    craft: 0.75, awareness: 0.75, experience: 0.75, skill: 0.97, consistency: 0.75,
    aggression: 0, optimism: 0, composure: 0, ersBias: 0,
  };
  function traits(c) {
    _traits.craft = c.craft != null ? c.craft : 0.75;
    _traits.awareness = c.awareness != null ? c.awareness : 0.75;
    _traits.experience = c.experience != null ? c.experience : 0.75;
    _traits.skill = c.skill != null ? c.skill : 0.97;
    _traits.consistency = c.consistency != null ? c.consistency : 0.75;
    _traits.aggression = c.aggression != null ? c.aggression : 0;
    _traits.optimism = c.optimism != null ? c.optimism : 0;
    _traits.composure = c.composure != null ? c.composure : 0;
    _traits.ersBias = c.ersBias != null ? c.ersBias : 0;
    return _traits;
  }

  const _house = { attack: 0, hold: 0 };
  function houseStyle(team, seat, stats) {
    const s = stats || (team && team.stats);
    if (!s) { _house.attack = 0; _house.hold = 0; return _house; }
    _house.attack = clamp(((s.speed + s.accel) * 0.5 - 85) / 25, -1, 1);
    _house.hold = clamp(((s.cornering + s.braking) * 0.5 - 85) / 25, -1, 1);
    if (seat === 0) {
      _house.attack = clamp(_house.attack + 0.10, -1, 1);
      _house.hold = clamp(_house.hold - 0.06, -1, 1);
    } else if (seat === 1) {
      _house.attack = clamp(_house.attack - 0.14, -1, 1);
      _house.hold = clamp(_house.hold + 0.12, -1, 1);
    }
    return _house;
  }
  function houseMul(team, lo, hi, axis, seat, stats) {
    const h = houseStyle(team, seat, stats);
    return lerp(lo, hi, ((axis === "hold" ? h.hold : h.attack) + 1) * 0.5);
  }
  function houseMulCtx(ctx, lo, hi, axis) {
    return houseMul(ctx && ctx.team, lo, hi, axis, ctx && ctx.seat, ctx && ctx.stats);
  }

  function isMate(team, other) {
    const id = team && team.id;
    const oid = other && other.team && other.team.id;
    return !!(id && oid && id === oid);
  }
  function ordersMul(team, seat, other, kind) {
    if (!isMate(team, other)) return 1;
    const os = other.seat;
    if (seat == null || os == null) return kind === "ot" ? 0.55 : (kind === "defend" ? 0.4 : 1);
    if (kind === "ot") {
      if (seat > os) return 0.22;
      if (seat < os) return 1.18;
      return 0.55;
    }
    if (kind === "defend") {
      if (seat > os) return 0.15;
      if (seat < os) return 1.06;
      return 0.35;
    }
    if (seat > os) return 1.12;
    if (seat < os) return 0.88;
    return 1;
  }

  const _look = [];
  const _lookPool = [];
  let _lookSorted = true, _lookLastD = -Infinity;
  function beginLook() { _look.length = 0; _lookSorted = true; _lookLastD = -Infinity; }
  function pushLook(d, k, bank, mu) {
    let s = _lookPool[_look.length];
    if (!s) s = _lookPool[_look.length] = { d: 0, k: 0, bank: 0, mu: 1 };
    s.d = d; s.k = k; s.bank = bank; s.mu = mu === undefined ? bankGrip(bank) : mu;
    if (!(d >= _lookLastD)) _lookSorted = false;
    _lookLastD = d;
    _look.push(s);
  }
  function bankGrip(bank) { return 1 + Math.sin(Number.isFinite(bank) ? bank : 0) * 0.8; }
  function endLook() { return _look; }
  const _lookWindow = { v: null, mu: null, n: 0, d: 0, step: 0 };
  function lookWindow(v, mu, n, d, step) {
    _lookWindow.v = v; _lookWindow.mu = mu; _lookWindow.n = n; _lookWindow.d = d; _lookWindow.step = step;
    return _lookWindow;
  }

  function stuckThreshold(t) {
    return lerp(1.15, 0.45, t.awareness);
  }

  function followBase(street) {
    return street ? 8 : 6;
  }

  const FOLLOW_TIGHT = 0.05, FOLLOW_MAX = 28;
  function followTime(t, street, team, seat, other, stats) {
    return lerp(0.15, 0.30, t.awareness) * houseMul(team, 0.92, 1.08, "hold", seat, stats)
      * ordersMul(team, seat, other, "follow");
  }
  function followGap(t, street, speed, tight, team, seat, other, stats, extra) {
    const v = Math.max(speed || 0, 0);
    if (street) {
      return followBase(true) + lerp(-0.8, 2.2, t.awareness) * houseMul(team, 0.92, 1.08, "hold", seat, stats)
        * 0.5 * ordersMul(team, seat, other, "follow") + v * (extra || 0);
    }
    const tightN = clamp(tight || 0, 0, 1);
    let T = lerp(followTime(t, street, team, seat, other, stats), FOLLOW_TIGHT, tightN) + (extra || 0);
    const aggr = clamp(t && t.aggression != null ? t.aggression : 0, -1, 1);
    if (tightN > 0) T *= 1 - aggr * (0.10 + 0.16 * tightN);
    return Math.min(followBase(street) + v * Math.max(T, 0), FOLLOW_MAX);
  }

  function towGain(street, hunger) {
    const base = street ? 0.022 : 0.045;
    if (street) return base;
    const h = clamp((hunger || 1) - 1, 0, 1);
    return base * (1 + h * 0.65);
  }

  const PASS_EDGE = 0.007;
  const PASS_EDGE_FULL = 0.012;
  const CONCEDE_EDGE_FULL = 0.008;
  const PULL_EDGE = 0.003;
  const PULL_EDGE_FULL = 0.007;
  const PULL_REACH = 34;
  const PULL_REACH_V0 = 72;
  function pullReachM(vTop) {
    const ref = vTop > 0 ? vTop : PULL_REACH_V0;
    return clamp(PULL_REACH * (ref / PULL_REACH_V0), 16, PULL_REACH);
  }
  function paceEdgeN(fasterV, slowerV, vTop, full, floor) {
    const ref = vTop > 0 ? vTop : 72;
    const edge = ((fasterV || 0) - (slowerV || 0)) / ref;
    const lo = floor != null ? floor : PASS_EDGE;
    if (edge < lo) return 0;
    const hi = full > lo ? full : (floor != null ? lo + (PASS_EDGE_FULL - PASS_EDGE) : PASS_EDGE_FULL);
    const span = hi - lo;
    return span > 0 ? clamp((edge - lo) / span, 0, 1) : 1;
  }
  function pairEdgeN(fasterV, slowerV, fasterP, slowerP, vTop, full, floor) {
    const a = (fasterV > 0 && slowerV > 0) ? paceEdgeN(fasterV, slowerV, vTop, full, floor) : 0;
    const b = (fasterP > 0 && slowerP > 0) ? paceEdgeN(fasterP / slowerP, 1, 1, full, floor) : 0;
    return Math.max(a, b);
  }
  function softPairEdgeN(fasterV, slowerV, fasterP, slowerP, vTop) {
    return pairEdgeN(fasterV, slowerV, fasterP, slowerP, vTop, PULL_EDGE_FULL, PULL_EDGE);
  }
  function passHunger(ctx) {
    if (!ctx || ctx.street) return 1;
    const edgeN = pairEdgeN(ctx.ourVmax, ctx.blockerVmax, ctx.ourPace, ctx.blockerPace, ctx.vTop);
    if (!edgeN) return 1;
    const stuckN = clamp((ctx.queueT || 0) / 12, 0, 1);
    const craft = lerp(0.75, 1.15, ctx.traits ? ctx.traits.craft : 0.75);
    return 1 + edgeN * Math.max(stuckN, 0.25) * 1.15 * craft;
  }
  const _hungerBag = { street: false, traits: null, vTop: 0.5, queueT: 0.5, blockerVmax: 0.5, ourVmax: 0.5, blockerPace: 0.5, ourPace: 0.5 };
  function hungerOf(street, traits, vTop, queueT, blockerVmax, ourVmax, blockerPace, ourPace) {
    const b = _hungerBag;
    b.street = street; b.traits = traits; b.vTop = vTop; b.queueT = queueT;
    b.blockerVmax = blockerVmax; b.ourVmax = ourVmax; b.blockerPace = blockerPace; b.ourPace = ourPace;
    return passHunger(b);
  }
  function coverConcede(ctx) {
    if (!ctx || ctx.street) return 0;
    if (ctx.other && ctx.other.human) return 0;
    const edgeN = pairEdgeN(ctx.chaserVmax, ctx.ourVmax, ctx.chaserPace, ctx.ourPace, ctx.vTop, CONCEDE_EDGE_FULL);
    if (!edgeN) return 0;
    const t = ctx.traits || {};
    return edgeN * lerp(0.55, 1.0, t.awareness != null ? t.awareness : 0.75)
      * lerp(0.55, 1.0, t.experience != null ? t.experience : 0.75);
  }

  function queueBrake(speed, blockerSpeed, street, gap, follow, brakeRef, vScale) {
    const vs = vScale > 0 ? vScale : 1;
    const excess = (speed || 0) - (blockerSpeed || 0);
    const thresh = (street ? 4.5 : 3) * vs;
    let lvl = 0;
    if (excess > thresh && !(gap != null && follow != null && gap > follow + excess * 1.2))
      lvl = clamp((excess - thresh) / ((street ? 4 : 5) * vs), 0.2, 1);
    if (excess > 0.5 * vs && gap != null && follow != null) {
      const room = Math.max(gap - follow, 0.5);
      const aReq = excess * excess / (2 * room);
      if (room / excess < 3 && aReq > 5 * vs) lvl = Math.max(lvl, clamp(aReq / (brakeRef || 22), 0.15, 1));
    }
    if (gap != null && follow != null && gap < follow && excess > 0.3 * vs) {
      lvl = Math.max(lvl, clamp(0.12 + (excess / (3 * vs)) * (1 - gap / follow), 0.12, 0.6));
    }
    return lvl;
  }

  function queueReach(base, speed, blockerSpeed, brake, vScale) {
    const vs = vScale > 0 ? vScale : 1, excess = (speed || 0) - (blockerSpeed || 0);
    if (!(excess > 3 * vs) || !(brake > 0)) return base;
    return Math.max(base, excess * excess / (2 * 0.6 * brake) + 6);
  }

  function holdLineGap(speed) {
    return Math.max(8, speed || 0);
  }
  const _defOnce = { defend: 0, side: 0 };
  _defOnce.defend = 0.5; _defOnce.defend = 0;
  function defendOnce(defend, side, out) {
    const o = out || _defOnce;
    const sgn = defend > 0 ? 1 : (defend < 0 ? -1 : 0);
    if (!defend) { o.defend = 0; o.side = side; }
    else if (!side) { o.defend = defend; o.side = sgn; }
    else { o.defend = sgn === side ? defend : 0; o.side = side; }
    return o;
  }

  function sepClamp(street) {
    return street ? 1.55 : 2.6;
  }

  function humanInvMass(street) {
    return street ? 0.42 : 0.5;
  }

  function rubDecel(street) {
    return street ? 3.5 : 3;
  }

  function bumpRestitution(relV) {
    const v = relV || 0;
    if (v <= 1) return 0;
    if (v >= 3) return 0.1;
    return 0.1 * (v - 1) / 2;
  }
  function humanPuntCap() { return 8; }

  function squeezeEase(street) {
    return street ? 0.88 : 0.9;
  }
  function squeezeBrake() { return 0.25; }

  function contactGive(contacting, t, street) {
    if (!contacting) return 1;
    const aggr = clamp(t && t.aggression != null ? t.aggression : 0, -1, 1);
    const give = lerp(0.55, 0.25, t.awareness) * (1 - aggr * 0.16);
    return street ? give * 0.72 : give;
  }

  function steerDamp(t) {
    return lerp(5.5, 12.5, t.experience);
  }

  function queueFloor(street) {
    return street ? 2.5 : 3.5;
  }
  function laneFollow() { return 9; }
  function unstuckLatFloor(street) {
    return street ? 0.10 : 0.16;
  }

  function unstuckPull(t, street) {
    const pull = lerp(3.4, 2.0, t.experience);
    return street ? pull * 0.55 : pull;
  }

  function streetOtScale(t) {
    return lerp(0.72, 1.0, t.awareness);
  }

  function otFireRate(ctx) {
    const t = ctx.traits;
    const gap = ctx.blockerGap != null ? ctx.blockerGap : ctx.gapAhead;
    const room = Math.max(ctx.roomL || 0, ctx.roomR || 0);
    const closing = (ctx.speed || 0) - (ctx.aheadSpeed != null ? ctx.aheadSpeed : ctx.speed || 0);
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    const gapScore = clamp(1 - (gap || 9) / 9, 0, 1);
    const roomScore = clamp(room / 3.2, 0, 1);
    const closeScore = clamp(0.45 + closing / (8 * ref / 72), 0, 1);
    const straight = clamp(1 - Math.abs(ctx.kAhead || 0) / 0.012, 0, 1);
    const situ = (0.34 * gapScore + 0.28 * roomScore + 0.22 * closeScore + 0.16 * straight)
      * (ctx.street ? streetOtScale(t) : 1);
    const craftMul = lerp(0.45, 1.55, t.craft);
    const awareMul = lerp(1.25, 0.7, t.awareness);
    const expMul = lerp(0.75, 1.15, t.experience);
    const aggrMul = 1 + clamp(t.aggression != null ? t.aggression : 0, -1, 1) * 0.22;
    const house = houseMulCtx(ctx, 0.88, 1.12, "attack");
    const orders = ordersMul(ctx.team, ctx.seat, ctx.other, "ot");
    return clamp(0.55 * situ * craftMul * awareMul * expMul * aggrMul * house * orders, 0.08, 2.4);
  }

  function otShouldFire(roll, dt, ctx) {
    const rate = otFireRate(ctx);
    return roll < 1 - Math.exp(-rate * dt);
  }

  const ERS_BIAS = 0.06;
  function wantBoost(ctx) {
    const energy = ctx.energy || 0;
    if (energy <= 0.02) return false;
    if (ctx.otActive) return true;
    const kAhead = Math.abs(ctx.kAhead60 || 0);
    const straight = kAhead < 0.006;
    if (!straight) return false;
    const vs = ctx.vTop > 0 ? ctx.vTop / 72 : 1;
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    const catchEdge = !ctx.street
      && pairEdgeN(ctx.ourVmax, ctx.towVmax, ctx.ourPace, ctx.towPace, ref) > 0;
    const catching = trailN(ctx.trailT, ctx.street) > 0 || !!(ctx.towCar && ctx.towGap < 28 && (
      (ctx.speed || 0) >= (ctx.towSpeed || 0) - 1 * vs || catchEdge));
    const defending = !!(ctx.chaser && ctx.chaserGap < 14 && (ctx.chaserSpeed || 0) > (ctx.speed || 0) - 2 * vs);
    const hs = houseStyle(ctx.team, ctx.seat, ctx.stats);
    const dep = ctx.ersDeploy != null ? ctx.ersDeploy : 0.5;
    const regen = ctx.ersRegen != null ? ctx.ersRegen : 0.5;
    const eb = ctx.traits && ctx.traits.ersBias != null ? clamp(ctx.traits.ersBias, -1, 1) : 0;
    const rich = energy > (0.55 - hs.attack * 0.08 - (dep - 0.5) * 0.10 - ERS_BIAS * eb);
    const desperate = energy > 0.25 && catching;
    const bank = ctx.traits.awareness > (0.8 - hs.hold * 0.08)
      && energy < (0.4 - hs.hold * 0.05 + (regen - 0.5) * 0.08) && !catching && !defending;
    if (bank) return false;
    return desperate || defending || rich || (energy > 0.25 && straight && ctx.traits.awareness < 0.55);
  }

  function wantX(ctx) {
    if (ctx && ctx.armed === false) return false;
    if (ctx && (ctx.catching || ctx.otActive)) return true;
    const hs = houseStyle(ctx && ctx.team, ctx && ctx.seat, ctx && ctx.stats);
    const energy = ctx && ctx.energy;
    if (energy == null) return true;
    return energy > (0.20 - hs.attack * 0.08);
  }

  const AI_DF = 0.65;
  const AERO_GRIP_K = 0.055;
  function aeroGrip(load) { return 1 + ((load != null ? load : 0.5) - 0.5) * AERO_GRIP_K; }
  function lateralScale(speed, load = 0.5, grip = 1, pace = 1, vmax = 72, aero = 1) {
    const q = Math.min(1, Math.abs(speed) / (Math.max(0.05, pace) * Math.max(1, vmax)));
    return (1 + (load - 0.5) * AERO_GRIP_K) * Math.max(0.01, grip) * (1 + AI_DF * aero * q * q);
  }
  const YAW_AERO = -0.28 / AI_DF;
  function yawScale(speed, load, grip, pace, vmax) { return lateralScale(speed, load, grip, pace, vmax, YAW_AERO); }
  const _lsOut = { yaw: 1, lat: 1 };
  function lateralScales(speed, load, grip, pace, vmax, aero, out = _lsOut) {
    const q = Math.min(1, Math.abs(speed) / (Math.max(0.05, pace) * Math.max(1, vmax)));
    const pre = (1 + (load - 0.5) * AERO_GRIP_K) * Math.max(0.01, grip);
    out.yaw = pre * (1 + AI_DF * YAW_AERO * q * q);
    out.lat = pre * (1 + AI_DF * aero * q * q);
    return out;
  }
  function cornerSpeed(k, lat, pace = 1, vmax = 72) {
      const V = Math.max(0.05, pace) * Math.max(1, vmax), kk = Math.max(k, 1e-5);
      const L = Number.isFinite(lat) ? Math.max(0, lat) : 0;
      return cornerSpeedEnvelope(kk, L, V, V * V);
    }
  function cornerSpeedEnvelope(kk, L, V, vSq) {
    const den = kk - L * AI_DF / vSq;
    if (den > 0) {
      const v = Math.sqrt(L / den);
      if (v <= V) return v;
    }
    return Math.sqrt(L * (1 + AI_DF) / kk);
  }

  function brakeTarget(ctx) {
    const t = ctx.traits;
    const samples = ctx.samples || [];
    const window = samples === _lookWindow ? _lookWindow : null;
    const sampleN = window ? window.n : samples.length;
    let windowD = window ? window.d : 0;
    const load = ctx.aeroLoad != null ? ctx.aeroLoad : 0.5;
    const latMax = (ctx.latMax || 22) * (1 + (load - 0.5) * AERO_GRIP_K);
    const brake = ctx.brake || 22;
    const grip = ctx.grip || 1;
    const skill = t.skill;
    const vs = Math.max(0.05, ctx.pace === undefined ? 1 : ctx.pace);
    const V = vs * Math.max(1, ctx.vmax === undefined ? 72 : ctx.vmax), vSq = V * V;
    let vLimSq = Infinity, bVC = 0, bD = 1;
    const scrub = 2 * brake * 0.85;
    const ascending = (window ? Number.isFinite(windowD) && Number.isFinite(window.step) && window.step >= 0 : samples === _look && _lookSorted) && scrub > 0;
    for (let i = 0; i < sampleN; i++) {
      const s = window ? null : samples[i];
      const d = Math.max((window ? windowD : s.d) || 0, 1);
      if (window) windowD += window.step;
      const dSq = scrub * d;
      if (dSq >= vLimSq) { if (ascending) break; continue; }
      const k = Math.max(Math.abs((window ? window.v[i] : s.k) || 0), 1e-5);
      const bankMu = window ? window.mu[i] : s.mu !== undefined ? s.mu : bankGrip(s.bank);
      const vC = cornerSpeedEnvelope(k, Math.max(0, latMax * bankMu * grip), V, vSq) * skill * (ctx.diffCorner || 1);
      const entrySq = vC * vC + dSq;
      if (entrySq >= 0 && entrySq < vLimSq) { vLimSq = entrySq; bVC = vC; bD = d; }
    }
    let vLim = Math.sqrt(vLimSq);
    if (!Number.isFinite(vLim)) vLim = 1e6;
    const vLimRaw = vLim;
    const hold = houseStyle(ctx.team, ctx.seat, ctx.stats).hold;
    if (hold) vLim *= 1 - hold * 0.025;
    const attacking = !!(ctx.blocker && ctx.blockerGap < 16 && (ctx.speed || 0) > (ctx.blockerSpeed || 0) - 1 * vs);
    const room = Math.max(ctx.roomL || 0, ctx.roomR || 0);
    if (attacking && room > 1.6) {
      vLim *= lerp(1.0, 1.07, t.craft) * houseMulCtx(ctx, 0.99, 1.03, "attack");
    }
    const opt = clamp(t.optimism != null ? t.optimism : 0, -1, 1);
    if (opt) vLim *= 1 + opt * 0.012;
    if (ctx.errMul) vLim *= ctx.errMul;
    _bind.vC = bVC * (vLimRaw > 0 && vLimRaw < 1e6 ? vLim / vLimRaw : 1); _bind.d = bD;
    return vLim;
  }
  const _bind = { vC: 0, d: 1 };

  const _br = { braking: false, brakeLvl: 0, vLim: 0, excess: 0, ff: 0 };
  _br.brakeLvl = _br.ff = 0.5; _br.brakeLvl = _br.ff = 0;
  function brakeDecision(ctx) {
    const vLim = brakeTarget(ctx);
    const speed = ctx.speed || 0;
    const excess = speed - vLim;
    const pace = Math.max(0.05, Number.isFinite(ctx.pace) ? ctx.pace : 1);
    const excessStd = excess / pace;
    const d = (ctx.traits.consistency != null ? ctx.traits.consistency : 0.75) - 0.75;
    const soft = 1 - d * 0.8, full = 7 - d * 2;
    let brakeLvl = 0, ff = 0;
    let braking = false;
    if (excessStd > soft) {
      braking = true;
      const brake = ctx.brake || 22, vC = _bind.vC, d = Math.max(_bind.d, 1);
      ff = Math.max(0, (speed * speed - vC * vC) / (2 * d * brake));
      brakeLvl = clamp(ff + (excessStd - soft) / (full - soft), 0.2, 1);
    }
    _br.braking = braking;
    _br.brakeLvl = brakeLvl;
    _br.vLim = vLim;
    _br.excess = excess;
    _br.ff = ff;
    return _br;
  }

  function adaptLane(lane, ctx, dt) {
    const dens = ctx.nearby || 0;
    if (dens < 2 && !(ctx.street && queuePress(ctx) >= 0.5)) return lane;
    const freer = (ctx.roomR || 0) - (ctx.roomL || 0);
    const minFree = ctx.street ? 1.35 : 0.9;
    if (Math.abs(freer) < minFree) return lane;
    const sign = freer > 0 ? 1 : -1;
    const destRoom = sign > 0 ? (ctx.roomR || 0) : (ctx.roomL || 0);
    if (ctx.street && destRoom < 1.7) return lane;
    const step = lerp(0.08, 0.22, ctx.traits.craft) * lerp(0.7, 1.15, ctx.traits.awareness)
      * (ctx.street ? 0.55 : 1);
    const home = ctx.baseLane != null ? ctx.baseLane : lane;
    const target = clamp(home + sign * step, -0.85, 0.85);
    return damp(lane, target, 0.35, dt);
  }

  function otPull(ctx) {
    const street = !!ctx.street;
    const t = ctx.traits;
    const gap = ctx.blockerGap;
    const soft = street ? 0
      : softPairEdgeN(ctx.ourVmax, ctx.blockerVmax, ctx.ourPace, ctx.blockerPace, ctx.vTop);
    const tN = trailN(ctx.trailT, street);
    const reach = street ? 14 : Math.max(soft > 0 ? pullReachM(ctx.vTop) : 16, tN > 0 ? TRAIL_WIN_S * Math.max(ctx.speed || 0, 1) : 0);
    if (gap >= reach) return 0;
    if (!otWant(ctx)) return 0;
    const side = otSide(ctx);
    const need = side > 0 ? (ctx.roomR || 0) : (ctx.roomL || 0);
    const house = houseMulCtx(ctx, 0.90, 1.12, "attack")
      * ordersMul(ctx.team, ctx.seat, ctx.other, "ot");
    if (street) {
      return side * lerp(0.7, 2.35, clamp(1 - gap / 14, 0, 1))
        * clamp(need / 2.3, 0, 1) * streetOtScale(t) * house;
    }
    const v = Math.max(ctx.speed || 0, 1), tNear = tN * clamp((TRAIL_FAR_S * v - gap) / ((TRAIL_FAR_S - TRAIL_NEAR_S) * v), 0, 1);
    const pull = lerp(0.8, 2.6, Math.max(clamp(1 - gap / reach, 0, 1), tNear))
      * clamp(need / 2.2, 0, 1) * lerp(0.75, 1.3, t.craft) * house;
    const road = side > 0 ? ctx.roadR : ctx.roadL;
    return side * (tN > 0 && road != null ? Math.min(pull, Math.max(0, road - 1)) : pull);
  }

  function otWant(ctx) {
    const street = !!ctx.street;
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    const aggr = clamp(ctx.traits && ctx.traits.aggression != null ? ctx.traits.aggression : 0, -1, 1);
    const bv = ctx.blockerVmax > 0 ? ctx.blockerVmax : (ctx.blockerSpeed || 0);
    const edgeN = street ? 0
      : pairEdgeN(ctx.ourVmax, ctx.blockerVmax, ctx.ourPace, ctx.blockerPace, ref);
    const softN = street ? 0
      : softPairEdgeN(ctx.ourVmax, ctx.blockerVmax, ctx.ourPace, ctx.blockerPace, ref);
    let margin = (street ? 0.055 : 0.07) * ref * lerp(1, 0.3, queuePress(ctx))
      * lerp(1.10, 0.88, (aggr + 1) * 0.5);
    if (edgeN) margin *= lerp(1, 0.42, edgeN);
    margin *= lerp(1, 0.25, trailN(ctx.trailT, street));
    const crawling = (ctx.blockerSpeed || 0) < 0.12 * ref && (ctx.blockerAccel || 0) < 0.016 * ref;
    const closing = (ctx.speed || 0) >= (ctx.blockerSpeed || 0) + margin;
    const held = (ctx.freeSpeed || 0) >= bv + margin;
    const press = queuePress(ctx);
    const clear = Math.max(ctx.roomL || 0, ctx.roomR || 0) >= (street ? 2.2 : 2.8);
    const impatient = press >= 1 && clear && (ctx.freeSpeed || 0) + 0.005 * ref >= bv;
    const edgeHeld = edgeN > 0 && clear && press >= 0.25
      && (ctx.freeSpeed || ctx.ourVmax || 0) + 0.002 * ref >= bv;
    const gap = ctx.blockerGap || 0;
    const reach = pullReachM(ref);
    const trailPull = softN > 0 && clear && reach > 16.5 && gap > 0 && gap < reach
      && (ctx.freeSpeed || ctx.ourVmax || 0) + 0.002 * ref >= bv;
    return crawling || closing || held || impatient || edgeHeld || trailPull;
  }

  const _launch = { react: 0, grip: 1 };
  function launchPlan(t, roll) {
    const r = roll || 0, r2 = (r * 7919) % 1;
    _launch.react = clamp(lerp(0.54, 0.15, t.awareness) + (r - 0.5) * 0.26, 0.05, 0.78);
    const hands = 0.5 * t.craft + 0.5 * clamp((t.skill - 0.9) * 10, 0, 1);
    _launch.grip = clamp(lerp(0.79, 1.0, hands) + (r2 - 0.5) * 0.22, 0.69, 1.08);
    return { react: _launch.react, grip: _launch.grip };
  }
  const LAUNCH_FADE = 3.2;
  function launchMul(tSince, plan) {
    if (!plan) return 1;
    if (tSince < plan.react) return 0;
    return lerp(plan.grip, 1, clamp((tSince - plan.react) / LAUNCH_FADE, 0, 1));
  }
  function launchDone(tSince, plan) { return !plan || tSince > plan.react + LAUNCH_FADE; }

  const START_CALM = 24, START_GAP_T = 0.42, START_ATTACK = 0.45;
  function startCalm(launching, until, t) {
    if (launching) return 1;
    return until > t ? clamp((until - t) / 10, 0, 1) : 0;
  }
  function startCalmS() { return START_CALM; }
  function startGapT(calm) { return START_GAP_T * (calm || 0); }

  function pacePhase(t, consistency, roll) {
    const r = roll || 0;
    const amp = lerp(0.016, 0.005, consistency == null ? 0.75 : consistency);
    const period = 24 + r * 36;
    return 1 + amp * Math.sin((t || 0) * (2 * Math.PI / period) + r * 6 * Math.PI);
  }

  const TRAIL_WIN_S = 1.2, TRAIL_EDGE = 0.0025, TRAIL_T0 = 6, TRAIL_T1 = 20, TRAIL_PUSH = 0.02;
  function trailCase(street, ourPace, aheadPace, gap, speed, aheadHuman) {
    if (street || aheadHuman || !(ourPace > 0) || !(aheadPace > 0)) return false;
    if (ourPace / aheadPace - 1 <= TRAIL_EDGE) return false;
    return gap > 0 && gap < TRAIL_WIN_S * Math.max(speed || 0, 1);
  }
  function scriptPaceOf(o) { return o && o.tierV > 0 && o.skill > 0 ? o.tierV * o.skill : 0; }
  function trailStep(c, ahead, open, street, dt) {
    if (!ahead || !open || ahead.finished || (ahead.pitState && ahead.pitState !== "none")) { c.trailT = 0; c._trOf = null; return 1; }
    const on = trailCase(street, scriptPaceOf(c), scriptPaceOf(ahead), snapProg(ahead) - snapProg(c), c.speed, !!ahead.human);
    c.trailT = trailTime(ahead === c._trOf ? c.trailT : 0, on, dt);
    if (on || !c.trailT) c._trOf = on ? ahead : null;
    return trailPush(c.trailT, street);
  }
  function trailTime(prev, on, dt) { return on ? (prev || 0) + dt : Math.max(0, (prev || 0) - 3 * dt); }
  function trailN(trailT, street) { return street || !(trailT > TRAIL_T0) ? 0 : clamp((trailT - TRAIL_T0) / (TRAIL_T1 - TRAIL_T0), 0, 1); }
  function trailPush(trailT, street) { return 1 + TRAIL_PUSH * trailN(trailT, street); }
  const TRAIL_YIELD_T = 8;
  function trailYield(trailT, street) { return !street && trailT > TRAIL_YIELD_T; }
  const TRAIL_NEAR_S = 0.6, TRAIL_FAR_S = 1.2;
  function snapProg(o) { return o._snapProg ?? o.prog; }
  function trailYieldStep(c, behind, street) {
    const near = behind ? clamp((TRAIL_FAR_S - (snapProg(c) - snapProg(behind)) / Math.max((behind._snapSpeed ?? behind.speed) || 0, 1)) / (TRAIL_FAR_S - TRAIL_NEAR_S), 0, 1) : 0;
    if (!(behind && behind._trOf === c && trailYield(behind.trailT, street) && near > 0)) { c._trYT = 0; return false; }
    c._trYT = behind.trailT * near;
    c._trYS = behind.passOf === c ? -behind.passSide : ((c._snapX ?? c.x) >= (behind._snapX ?? behind.x) ? 1 : -1);
    return true;
  }
  const TRAIL_YIELD_RAMP = 6, TRAIL_YIELD_EASE = 0.90;
  function trailYieldEase(trailT, t) {
    if (trailT < TRAIL_YIELD_T) return lerp(1, letPassEase(t), clamp(trailT / TRAIL_YIELD_T, 0, 1));
    return lerp(letPassEase(t), TRAIL_YIELD_EASE, clamp((trailT - TRAIL_YIELD_T) / TRAIL_YIELD_RAMP, 0, 1)) * trailYieldDeep(trailT, TRAIL_DEEP_EASE);
  }
  const TRAIL_YIELD_CORNER = 0.965;
  function trailYieldCorner(trailT) {
    return lerp(1, TRAIL_YIELD_CORNER, clamp((trailT - TRAIL_YIELD_T) / TRAIL_YIELD_RAMP, 0, 1)) * trailYieldDeep(trailT, TRAIL_DEEP_CORNER);
  }
  const TRAIL_DEEP_T0 = 18, TRAIL_DEEP_T1 = 32, TRAIL_DEEP_EASE = 0.94, TRAIL_DEEP_CORNER = 0.96;
  function trailYieldDeep(trailT, floor) {
    return lerp(1, floor, clamp((trailT - TRAIL_DEEP_T0) / (TRAIL_DEEP_T1 - TRAIL_DEEP_T0), 0, 1));
  }

  function passTarget(passX, side, clear, hw) {
    const lim = (hw || 5) - 0.6;
    return clamp(passX + side * clear, -lim, lim);
  }
  const EDGE_KEEP_M = 0.5, EDGE_YAW_SHARE = 0.7;
  function edgeHead(want, x, hw, desiredX, v, yawMax) {
    if (!(v > 1) || !(yawMax > 0)) return want;
    const keep = hw - EDGE_KEEP_M, k = 2 * EDGE_YAW_SHARE * yawMax / v;
    const hiLim = desiredX > keep ? desiredX : keep, loLim = -desiredX > keep ? -desiredX : keep;
    const hi = Math.sqrt(k * Math.max(0, hiLim - x)), lo = -Math.sqrt(k * Math.max(0, loLim + x));
    return want > hi ? hi : want < lo ? lo : want;
  }
  const HAZARD_V_FRAC = 0.06;
  function stoppedHazard(o, vTop) {
    if (!o || o.retired || o.finished || o.inPit || o.inPitLane) return false;
    const frac = Math.abs(o.speed || 0) / (vTop > 0 ? vTop : 72);
    return frac < HAZARD_V_FRAC;
  }
  function hazardReach(speed) { return 60 + 2.5 * Math.abs(speed || 0); }
  const HAZARD_CLEAR_M = 2.8;
  function hazardClear(clear) { return clear > HAZARD_CLEAR_M ? clear : HAZARD_CLEAR_M; }
  function hazardHead(want, x, hz, clear, desiredX, v, yawMax) {
    if (!hz || !(v > 1) || !(yawMax > 0)) return want;
    const k = 2 * EDGE_YAW_SHARE * yawMax / v;
    if (hz.x > 0) {
      const lim = hz.x - clear;
      if (desiredX > lim + 0.01) return want;
      const hi = Math.sqrt(k * Math.max(0, lim - x));
      return want > hi ? hi : want;
    }
    const lim = hz.x + clear;
    if (desiredX < lim - 0.01) return want;
    const lo = 0 - Math.sqrt(k * Math.max(0, x - lim));
    return want < lo ? lo : want;
  }
  const STALL_RETIRE_S = 60, STALL_V = 1.0;
  function stallStep(t, speed, dt, live) {
    return live && Math.abs(speed || 0) < STALL_V ? (t || 0) + dt : 0;
  }
  function stallSweep(cars, dt, green, onRetire) {
    for (const c of cars) {
      if (!c.local || c.retired || c.finished) continue;
      c.stallT = stallStep(c.stallT, c.speed, dt || 0, green && !c.inPit && !c.inPitLane);
      if (c.stallT >= STALL_RETIRE_S) onRetire(c);
    }
  }
  function passSideClosed(sideRoom, need, wcar) {
    return sideRoom < Math.min(wcar || 2, Math.max(0, need || 0)) - 0.1;
  }
  function passHold(t) {
    const aggr = clamp(t && t.aggression != null ? t.aggression : 0, -1, 1);
    return lerp(2.4, 4.2, t.craft) * (1 + aggr * 0.12);
  }
  function passCooldown(t) {
    return lerp(3.5, 1.8, t.experience);
  }
  function repassLock(t, edge) {
    return 2 * passCooldown(t) * clamp(1 - (edge || 0) / 0.06, 0.3, 1);
  }

  function attemptRoll(hash, lap, key) {
    let h = ((hash | 0) ^ Math.imul(lap | 0, 0x9e3779b1) ^ Math.imul(key | 0, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const RUN_T = 0.15;
  function runExtra(kHere, qNext, want, street, hunger) {
    if (street || !want || Math.abs(kHere || 0) <= 0.004 || qNext < 0.4) return 0;
    const h = clamp((hunger || 1) - 1, 0, 1);
    return RUN_T * (1 + h * 0.85);
  }
  function latchLate(ctx) {
    if (ctx.street) return true;
    if (!(ctx.toTurnIn > 150) || Math.abs(ctx.kAhead || 0) > 0.004) return true;
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    if ((ctx.blockerSpeed || 0) < 0.12 * ref || queuePress(ctx) >= 1) return true;
    return (ctx.speed || 0) - (ctx.blockerSpeed || 0) >= 0.015 * ref
      || (ctx.blockerGap || 0) <= 6 + (FOLLOW_TIGHT + 0.03) * (ctx.speed || 0);
  }
  function cornerK(k1, k2, k3) {
    let k = k1 || 0;
    if (Math.abs(k2 || 0) > Math.abs(k)) k = k2;
    if (Math.abs(k3 || 0) > Math.abs(k)) k = k3;
    return k;
  }

  const SBS_COMMIT_MIN = 1.15;
  const _sbsBag = { street: false, traits: null, vTop: 0.5, other: null, ourVmax: 0.5, ourPace: 0.5, otherVmax: 0.5, otherPace: 0.5 };
  function sbsArgs(street, traits, vTop, other, ourVmax, ourPace, otherVmax, otherPace) {
    const b = _sbsBag;
    b.street = street; b.traits = traits; b.vTop = vTop; b.other = other;
    b.ourVmax = ourVmax; b.ourPace = ourPace; b.otherVmax = otherVmax; b.otherPace = otherPace;
    return b;
  }
  const _ccBag = { street: false, traits: null, vTop: 0.5, ourVmax: 0.5, ourPace: 0.5, chaserVmax: 0.5, chaserPace: 0.5, other: null };
  function sbsConcedes(ctx) {
    if (!ctx || ctx.street) return false;
    const b = _ccBag;
    b.traits = ctx.traits; b.vTop = ctx.vTop; b.ourVmax = ctx.ourVmax; b.ourPace = ctx.ourPace;
    b.chaserVmax = ctx.otherVmax; b.chaserPace = ctx.otherPace; b.other = ctx.other;
    return coverConcede(b) >= 0.70;
  }
  function sbsCommitT(ctx) { return sbsConcedes(ctx) ? SBS_COMMIT_MIN : 2; }
  function sbsEase(ctx) { return sbsConcedes(ctx) ? 0.94 : 0.97; }
  const _slOut = { commitT: 2, ease: 0.97 };
  function sbsLimits(ctx, out = _slOut) {
    const c = sbsConcedes(ctx);
    out.commitT = c ? SBS_COMMIT_MIN : 2;
    out.ease = c ? 0.94 : 0.97;
    return out;
  }

  function attackOK(ctx) {
    const inZone = (ctx.toTurnIn != null ? ctx.toTurnIn : 1e9) < 130;
    const bend = clamp(1 - (Math.abs(ctx.kAhead || 0) - 0.004) / 0.016, 0, 1);
    let q = inZone ? (ctx.attackQ || 0) : lerp(0.15, 0.6, bend);
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    const bv = ctx.blockerVmax > 0 ? ctx.blockerVmax : (ctx.blockerSpeed || 0);
    const deficit = clamp((((ctx.freeSpeed || 0) - bv) / ref - 0.06) / 0.06, 0, 1);
    if ((ctx.blockerSpeed || 0) < 0.12 * ref) q = 1; else q = Math.max(q, 0.6 * deficit);
    const closing = clamp(((ctx.speed || 0) - (ctx.blockerSpeed || 0)) / (6 * ref / 72), 0.25, 1);
    const craft = lerp(0.7, 1.25, ctx.traits ? ctx.traits.craft : 0.75);
    const roll = 0.85 + 0.3 * (ctx.roll != null ? ctx.roll : 0.5);
    q *= 1 - (1 - START_ATTACK) * (ctx.calm || 0);
    const softN = ctx.street ? 0
      : softPairEdgeN(ctx.ourVmax, ctx.blockerVmax, ctx.ourPace, ctx.blockerPace, ref);
    const edgeDrive = softN > 0 ? lerp(0.55, 1.0, softN) : 0;
    return q * Math.max(closing, deficit, 0.7 * queuePress(ctx), edgeDrive) * craft * roll >= 0.32 && passReach(ctx);
  }

  function passReach(ctx) {
    const to = ctx.toTurnIn;
    if (!(to < 1e8) || !(ctx.blockerGap > 0)) return true;
    const ref = ctx.vTop > 0 ? ctx.vTop : 72;
    if ((ctx.blockerSpeed || 0) < 0.12 * ref) return true;
    const gain = ctx.blockerGap - SIDE_LEVEL;
    if (gain <= 0) return true;
    const bv = ctx.blockerVmax > 0 ? ctx.blockerVmax : (ctx.blockerSpeed || 0);
    const softN = ctx.street ? 0
      : softPairEdgeN(ctx.ourVmax, ctx.blockerVmax, ctx.ourPace, ctx.blockerPace, ref);
    const reach = pullReachM(ref);
    if (softN > 0 && reach > 16.5 && ctx.blockerGap <= reach) {
      if (ctx.blockerGap <= 16) return true;
      return !(to < 80);
    }
    const dv = Math.max((ctx.speed || 0) - (ctx.blockerSpeed || 0), (ctx.freeSpeed || 0) - bv, ref / 72);
    return (ctx.speed || 0) * gain / dv <= 1.25 * to;
  }

  function queueTime(prevT, held, dt) {
    return held ? (prevT || 0) + dt : Math.max(0, (prevT || 0) - 2 * dt);
  }
  function queuePatience(t) {
    const aggr = clamp(t && t.aggression != null ? t.aggression : 0, -1, 1);
    return lerp(7, 3.5, t ? t.craft : 0.75) * lerp(1.12, 0.88, (aggr + 1) * 0.5);
  }
  function queuePress(ctx) {
    return clamp((ctx.queueT || 0) / queuePatience(ctx.traits), 0, 1);
  }
  function sideLevel() { return SIDE_LEVEL; }

  let _stratBound = false;
  function bindStrat() {
    if (_stratBound) return;
    _stratBound = true;
    AiStrategy.bindTraits(traits);
  }
  function tyreClass(roll, laps) { bindStrat(); return AiStrategy.tyreClass(roll, laps); }
  function tyrePace(cls, lapsDone) { bindStrat(); return AiStrategy.tyrePace(cls, lapsDone); }
  function degCost(n, life) { bindStrat(); return AiStrategy.degCost(n, life); }
  function splitStints(laps, lives, fuelWear) { bindStrat(); return AiStrategy.splitStints(laps, lives, fuelWear); }
  function stintPlan(ctx) { bindStrat(); return AiStrategy.stintPlan(ctx); }
  function compoundFor(lapsLeft, lifeLaps) { bindStrat(); return AiStrategy.compoundFor(lapsLeft, lifeLaps); }
  function strategyTemper(c) { bindStrat(); return AiStrategy.strategyTemper(c); }
  function tasteRoll(roll, c) { bindStrat(); return AiStrategy.tasteRoll(roll, c); }
  function wornPays(ctx) { bindStrat(); return AiStrategy.wornPays(ctx); }
  function pitNow(ctx) { bindStrat(); return AiStrategy.pitNow(ctx); }

  const MISTAKE_BASE = 0.004 * (1 + 7.0 * (0.8 / 1.2));
  function mistakeChance(t, pressure, errMul) {
    const cons = t && t.consistency != null ? t.consistency : 0.75;
    const em = errMul > 0 ? errMul : 1;
    const press = clamp(pressure || 0, 0, 1);
    const opt = clamp(t && t.optimism != null ? t.optimism : 0, -1, 1);
    const optMul = 1 + 0.25 * opt * press;
    const comp = clamp(t && t.composure != null ? t.composure : 0, -1, 1);
    return MISTAKE_BASE * em * (1 + 2 * press * (1 - 0.5 * comp)) * (1.3 - cons) * optMul;
  }
  const ERR_LATE = 1.2, ERR_GATHER = 1.8;
  function mistakeTotal() { return ERR_LATE + ERR_GATHER; }
  function mistakePhase(errT) { return !(errT > 0) ? 0 : errT > ERR_GATHER ? 1 : 2; }
  function mistakeBrakeMul() { return 1.05; }
  function mistakeGatherMul() { return 0.85; }

  function humanYieldGrace() { return 0.3; }
  function humanYieldBand() { return 0.3; }
  const HOLD_RATE = 0.25;
  function humanYieldT(prevT, close, aiElected, otherHuman, intruding, dt, inside) {
    if (!close || !otherHuman) return 0;
    if (aiElected) return 0;
    if (intruding) return prevT + dt;
    return inside ? prevT + dt * HOLD_RATE : prevT;
  }
  function humanYieldTakes(t) { return (t || 0) > humanYieldGrace(); }

  function paceSample(ref, i, c, vmax, free, dt) {
    if (!(vmax > 1)) return;
    const f = c.speed / vmax;
    if (!(f > 0.02)) return;
    if (!c.human) { if (free) ref[i] = ref[i] > 0 ? ref[i] + (f - ref[i]) * 0.2 : f; return; }
    const r = ref[i];
    if (r > 0.05) c.paceF = damp(c.paceF > 0 ? c.paceF : 1, clamp(f / r, 0.6, 1.25), 0.15, dt);
  }

  function aimIntrudes(desiredX, x, otherX, clear) {
    if (Math.abs(desiredX - otherX) >= clear) return false;
    return otherX <= x ? desiredX < x : desiredX > x;
  }

  const SIDE_LEVEL = 2.4;
  function sideYieldsA(dProg, xA, xB, kTurn) {
    if (dProg < -SIDE_LEVEL) return true;
    if (dProg > SIDE_LEVEL) return false;
    if (Math.abs(kTurn || 0) > 0.004 && xA !== xB) return (xA - xB) * Math.sign(kTurn) > 0;
    return Math.abs(xA) >= Math.abs(xB);
  }

  function mirrorReach(t, speed) {
    const v = Math.max(speed || 0, 10);
    return clamp(v * lerp(0.6, 1.05, t ? t.awareness : 0.75), 13, 72);
  }
  function defendWindowT(t) { return lerp(0.35, 0.7, t ? t.awareness : 0.75); }

  function defendPull(ctx) {
    if (!ctx.chaser || (ctx.blocker && (ctx.street || !(ctx.chaserGap < ctx.blockerGap)))) return 0;
    const gT = (ctx.chaserGap == null ? 99 : ctx.chaserGap) / Math.max(ctx.speed || 0, 10);
    const winT = defendWindowT(ctx.traits);
    if (gT >= winT) return 0;
    if ((ctx.chaserSpeed || 0) <= (ctx.speed || 0) - 3 * (ctx.vTop > 0 ? ctx.vTop / 72 : 1)) return 0;
    const kA = ctx.kA || 0;
    let coverSide, straight = false;
    if (Math.abs(kA) > 0.004) {
      coverSide = -Math.sign(kA);
    } else {
      const o = ctx.other;
      const ox = o ? (Number.isFinite(o._snapX) ? o._snapX : Number.isFinite(o.x) ? o.x : 0) : 0;
      const dx = ox - (ctx.x || 0);
      const kT = ctx.kTurn || 0;
      if (Math.abs(dx) >= 0.35) coverSide = dx > 0 ? 1 : -1;
      else if (!ctx.street && Math.abs(kT) > 0.004 && ctx.toTurnIn < 2 * Math.max(ctx.speed || 0, 10)) coverSide = -Math.sign(kT);
      else return 0;
      straight = true;
    }
    const coverRoom = coverSide > 0 ? (ctx.roomR || 0) : (ctx.roomL || 0);
    if (ctx.street && coverRoom < 2.2) return 0;
    const road = coverSide > 0 ? ctx.roadR : ctx.roadL;
    const edgeCap = road != null ? Math.max(0, road - 2.5) : Infinity;
    let mag = lerp(0.2, 1.1, ctx.traits.craft)
      * clamp(1 - gT / winT, 0, 1) * clamp(coverRoom / 2, 0, 1)
      * houseMulCtx(ctx, 0.90, 1.12, "hold")
      * ordersMul(ctx.team, ctx.seat, ctx.other, "defend");
    const concede = coverConcede(ctx);
    if (concede >= 0.70) return 0;
    mag *= 1 - concede;
    const scale = (ctx.street ? 0.45 : 1) * (straight ? 0.6 : 1);
    return coverSide * Math.min(mag * scale, edgeCap);
  }

  function wallHitLoss(street) {
    return street ? 0.30 : 0.28;
  }

  function wallSteerScrub(street) {
    return street ? 20 : 16;
  }

  const WALL_AI_SCRUB = 12;
  function wallAiScrub() { return WALL_AI_SCRUB; }

  function isBoxed(ctx) {
    const roomL = ctx.roomL || 0, roomR = ctx.roomR || 0;
    if (roomL < 1.3 && roomR < 1.3) return true;
    if ((ctx.contactT || 0) > 0 && roomL < 1.6 && roomR < 1.6) return true;
    if (!(ctx.blocker && ctx.blockerGap < 6)) return false;
    if (ctx.street) return roomL < 1.8 && roomR < 1.8;
    return true;
  }

  function digOutBudget(t, street) {
    const base = lerp(3.5, 2.0, t && t.awareness != null ? t.awareness : 0.75);
    return street ? base * 0.6 : base;
  }
  function digOutEscalated(stuckT, t, street) {
    return (stuckT || 0) > stuckThreshold(t) + digOutBudget(t, street);
  }
  function digOutHeld(held, escalatedNow, digging) {
    return !!escalatedNow || (!!held && !!digging);
  }

  function aiRescueDelay(contacting, escalated) {
    if (escalated) return contacting ? 2.0 : 1.25;
    return contacting ? 7 : 4;
  }

  function otSide(ctx) {
    const roomL = ctx.roomL || 0, roomR = ctx.roomR || 0;
    const diff = roomR - roomL;
    if (Math.abs(diff) >= 0.6) return diff > 0 ? 1 : -1;
    const kA = Math.abs(ctx.kTurn || 0) > 0.002 ? ctx.kTurn : (ctx.kAhead || 0);
    if (Math.abs(kA) > 0.002) return kA > 0 ? -1 : 1;
    const lane = ctx.lane || 0;
    if (Math.abs(lane) > 0.05) return lane > 0 ? 1 : -1;
    return diff >= 0 ? 1 : -1;
  }

  function passSideBonus(ctx, side) {
    const k = ctx.kTurn || 0;
    if (!ctx.street && Math.abs(k) > 0.004 && ctx.toTurnIn < 250) return side === -Math.sign(k) ? 0.8 : 0;
    return otSide(ctx) === side ? 0.3 : 0;
  }

  function letPassCase(racing, blocker, chaser, chaserGap, chaserSpeed, speed, vScale, lapping) {
    if (!racing || blocker || !chaser || !lapping || !(chaserGap < 9)) return false;
    return (chaserSpeed || 0) > (speed || 0) + 2.5 * (vScale > 0 ? vScale : 1);
  }
  function letPassDelay(t) {
    return lerp(4.2, 1.8, t.awareness);
  }
  function letPassPull(t, street) {
    const pull = lerp(0.9, 1.5, t.experience);
    return street ? pull * 0.5 : pull;
  }
  function letPassSide(roomL, roomR, dx) {
    const away = dx >= 0.3 ? 1 : dx <= -0.3 ? -1 : 0;
    if (away && (away > 0 ? roomR : roomL) > 1.6) return away;
    return roomR >= roomL ? 1 : -1;
  }
  function letPassEase(t) {
    return lerp(0.965, 0.99, t.experience);
  }

  function minLatGap(hw, street) {
    if (!street) return 2.8;
    return clamp((hw || 5) * 0.44, 2.12, 2.45);
  }

  function lineFollow(street, hold) {
    const base = street ? 0.86 : 0.92;
    return hold ? clamp(base - hold * 0.06, 0.7, 0.95) : base;
  }

  const LOD_FAR_M = 250, LOD_RANK = 3, LOD_GREEN_S = 3, LOD_TRAFFIC_M = 40, LOD_N = 64;
  function lodLab() {
    const at = new Int32Array(LOD_N).fill(-2), brk = new Uint8Array(LOD_N), lvl = new Float64Array(LOD_N), kmx = new Float64Array(LOD_N);
    let n = 0, open = false, pS = 0, pRank = 0, L = 1, greenAt = Infinity;
    const slot = (c) => { const i = c.gridPos | 0; return i > 0 && i < LOD_N ? i : 0; };
    return {
      step(cars, racing, level, raceT, player, total) {
        n++;
        if (!racing || level !== 0) greenAt = Infinity; else if (greenAt === Infinity) greenAt = raceT;
        let humans = 0;
        for (let i = 0; i < cars.length; i++) if (cars[i].human && !cars[i].retired) humans++;
        open = racing && raceT - greenAt >= LOD_GREEN_S && !!player && !player.retired && humans <= 1 && total > 0;
        if (open) { pS = player.s; pRank = player.rank; L = total; }
      },
      skip(c, player, inLane, blockerGap, unstuck) {
        const i = slot(c);
        if (!open || !i || c === player || c.human || c.local || ((n + i) & 1) === 0 || at[i] !== n - 1) return false;
        if (!(c.lap >= 2) || c.launchOn || inLane || c.pitArmed || (c.pitState && c.pitState !== "none")) return false;
        if (c.contactT > 0 || c.collideT > 0 || c.errT || c.stuckT > 0 || unstuck || c._trYT || blockerGap < LOD_TRAFFIC_M) return false;
        if (!(Math.abs(c.rank - pRank) > LOD_RANK)) return false;
        let d = Math.abs(c.s - pS) % L;
        if (L - d < d) d = L - d;
        return d > LOD_FAR_M;
      },
      put(c, braking, brakeLvl, kMax) { const i = slot(c); if (i) { at[i] = n; brk[i] = braking ? 1 : 0; lvl[i] = brakeLvl; kmx[i] = kMax; } },
      braking: (c) => brk[slot(c)] === 1,
      level: (c) => lvl[slot(c)],
      kMax: (c) => kmx[slot(c)],
    };
  }

  try { Log.info("game", "AiDrive ready"); } catch (_) {  }
  return {
    lateralScale, aeroGrip, yawScale, lateralScales, sbsLimits, cornerSpeed, traits, houseStyle, stuckThreshold, followGap, towGain, queueBrake, queueReach, sepClamp,
    humanInvMass, contactGive, steerDamp, unstuckPull, otFireRate,
    otShouldFire, wantBoost, wantX, brakeTarget, brakeDecision, adaptLane, otPull,
    passHunger, hungerOf, coverConcede, pairEdgeN, softPairEdgeN, pullReachM,
    PASS_EDGE, PASS_EDGE_FULL, CONCEDE_EDGE_FULL, PULL_EDGE, PULL_EDGE_FULL, PULL_REACH,
    defendPull, mirrorReach, isBoxed, minLatGap, wallHitLoss, wallSteerScrub,
    wallAiScrub, beginLook, pushLook, endLook, lookWindow, bankGrip, aiRescueDelay, otSide,
    letPassCase, letPassDelay, letPassPull, letPassSide, letPassEase, queueFloor, laneFollow, unstuckLatFloor,
    digOutBudget, digOutEscalated, digOutHeld,
    edgeHead, EDGE_KEEP_M, stoppedHazard, hazardReach, hazardClear, hazardHead, stallStep, stallSweep, STALL_RETIRE_S, otWant, repassLock, attemptRoll, runExtra, latchLate, cornerK, sbsCommitT, sbsEase, sbsArgs, SBS_COMMIT_MIN, passSideBonus, queueTime, queuePress, passReach, passTarget, passSideClosed, passHold, passCooldown, sideYieldsA, humanYieldGrace, humanYieldBand, humanYieldT, humanYieldTakes, aimIntrudes, paceSample,
    launchPlan, launchMul, launchDone, startCalm, startCalmS, startGapT, pacePhase, trailStep, trailYieldStep, trailYieldEase, trailYieldCorner, rubDecel, bumpRestitution, humanPuntCap, squeezeEase, squeezeBrake,
    holdLineGap, defendOnce, lineFollow, attackOK, sideLevel,
    mistakeChance, mistakeTotal, mistakePhase, mistakeBrakeMul, mistakeGatherMul,
    tyreClass, tyrePace, stintPlan, pitNow, wornPays, degCost, splitStints, compoundFor, strategyTemper, tasteRoll, lodLab,
    _t: Object.freeze({ isMate, ordersMul, followTime, followBase, streetOtScale, defendWindowT, queuePatience, trailCase, trailTime, trailPush, trailYield }),
    get STRAT() { bindStrat(); return AiStrategy.STRAT; },
  };
})();
