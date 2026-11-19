const PlayerForces = (function () {
  "use strict";

  const clamp = M4.clamp;
  const PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : {};

  function tyreSat(cs, a, mu, floor, fallW, hold) {
    return -mu * TyreModel.lateralCurve(cs * a / mu, floor, fallW, hold);
  }

  const _marbleArg = { lock: 0, slip: 0, speed: 0 };

  let G = null;

  function create(g) {
    G = g;
    Log.info("game", "PlayerForces.create");
    return { step, tyreSat, recoverBlocked, assistYawEase };
  }

  function recoverBlocked(c, inLane) {
    return !!inLane || c.pitState === "box";
  }

  function assistYawEase(r, rNeed) {
    const ratio = rNeed !== 0 ? -(r || 0) / rNeed : 0;
    return ratio > 1 ? Math.min(1, Math.max(0.3, 1 - (ratio - 1) * 0.6)) : 1;
  }

  function step(c, ctx) {
    const dt = ctx.dt;
    const onThrottle = ctx.onThrottle;
    const throttleLvl = ctx.throttleLvl;
    const gearMult = ctx.gearMult;
    const deploy = ctx.deploy;
    const braking = ctx.braking;
    const loadF = ctx.loadF, loadR = ctx.loadR;
    const vertLoad = ctx.vertLoad;
    const surfaceMu = ctx.surfaceMu;
    const kerbGrip = ctx.kerbGrip;
    const bankMu = ctx.bankMu;
    const modsCornering = ctx.modsCornering;
    const af = ctx.af, ar = ctx.ar;
    let delta = 0;
    const driverDelta = Number.isFinite(ctx.driverDelta) ? ctx.driverDelta : 0;
    if (!(Number.isFinite(dt) && dt > 0)) return;
    const assistDelta = ctx.assistDelta || 0;
    const lineDelta = ctx.lineDelta || 0;
    const sp = ctx.sp;
    const steer = ctx.steer;
    const weatherGrip = ctx.weatherGrip;
    const aeroDf = ctx.aeroDf;
    const dirtyMul = ctx.dirtyMul;
    const coastCut = ctx.coastCut;
    const vTopNow = ctx.vTopNow;
    const tyres = ctx.tyres;

    const LONG_GRIP = PC.LONG_GRIP;
    const THR_VK = PC.THR_VK, THR_FLOOR = PC.THR_FLOOR, THR_CAP = PC.THR_CAP;
    const COAST_DRAG = PC.COAST_DRAG;
    const DOWNFORCE = PC.DOWNFORCE;
    const LAT_MAX = PC.LAT_MAX;
    const LOAD_SENS = PC.LOAD_SENS;
    const FRONT_WEIGHT = PC.FRONT_WEIGHT;
    const CS_FRONT = PC.CS_FRONT, CS_REAR = PC.CS_REAR;
    const BRAKE = PC.BRAKE;
    const PLAYER_GRIP = G.PLAYER_GRIP;
    const FRONT_GRIP = G.FRONT_GRIP;
    const DRIFT = G.DRIFT;
    const YAW_INERTIA = G.YAW_INERTIA;
    const YAW_DAMP = G.YAW_DAMP;

    const vAbs = Math.abs(c.speed);
    const vStdNow = vAbs * (PC.VMAX || 72) / Math.max(vTopNow, 0.05);
    const thrOn = onThrottle && !braking;
    const axThrDemand = thrOn
      ? clamp(THR_VK / Math.max(vStdNow, 1), THR_FLOOR, THR_CAP)
          * (c.human ? throttleLvl : 1) * gearMult + Math.max(0, deploy) / LONG_GRIP
      : 0;
    const longBudget = LONG_GRIP * weatherGrip;
    const decel = Math.max(0, -(c.axEstSm ?? 0));
    const cdNow = COAST_DRAG * (1 - coastCut * (c.aeroX || 0));
    const brakeMix = clamp((decel - cdNow) / (0.5 * cdNow), 0, 1);
    const brakeScale = Math.max(1, (c.mods && c.mods.braking) || 1);
    const pedal = decel * brakeMix / (longBudget * brakeScale), engine = (decel - decel * brakeMix) / longBudget, beta = (c.brakeStab = TyreModel.brakeBeta(c.brakeStab, c.rearUtil, dt));
    const axFracF = Math.min(1, pedal * TyreModel.brakeFront(beta, loadF, loadR)), axFracR = Math.min(1, Math.max(pedal * beta + engine, axThrDemand));
    const axFrac = Math.max(axFracF, axFracR);
    c.axFrac = axFrac;
    c.axFracF = axFracF; c.axFracR = axFracR;
    const aeroGrip = (1 + DOWNFORCE * aeroDf * Math.min(1, (vAbs / vTopNow) ** 2))
      * dirtyMul;
    c._dirtyAirMul = dirtyMul;
    c._coachAssisted = Math.abs(assistDelta) + Math.abs(lineDelta) > 1e-6;
    c._aeroGrip = aeroGrip;
    const dmg = ctx.damage;
    let dmgF = 1, dmgR = 1;
    if (dmg) {
      const load = DOWNFORCE * aeroDf * Math.min(1, (vAbs / vTopNow) ** 2);
      dmgF = (1 + load * dmg.aeroF) / (1 + load) * dmg.grip;
      dmgR = (1 + load * dmg.aeroR) / (1 + load) * dmg.grip;
    }
    if (dmg) { dmg.axF = dmgF; dmg.axR = dmgR; }
    const surfMu = surfaceMu;
    const marbleMu = (typeof DebrisWorld !== "undefined" && DebrisWorld.active()) ? DebrisWorld.marbleGrip(c) : 1;
    const tyreMu = tyres.gripMul(c);
    c._cueConditionGrip = clamp(weatherGrip * tyreMu, 0.25, 1);
    c._cueCornering = clamp(modsCornering, 0.25, 1);
    c._cueBraking = Number.isFinite(ctx.modsBraking) ? clamp(ctx.modsBraking, 0.25, 1) : 1;
    const tyreAx = tyres.axleSplit(c);
    const bbOn = (c.axEstSm ?? 0) < 0 && c.brakeBias != null && c.brakeBias !== SetupTune.BB_REF;
    const bb = bbOn ? SetupTune.bbScales(c.brakeBias) : null;
    const afF = bb ? Math.min(1, axFracF * bb.f) : axFracF;
    const afR = bb ? Math.min(1, Math.max(engine + pedal * beta * bb.r, axThrDemand)) : axFracR;
    const lockOn = PC.WHEEL_LOCK_ONSET
      + PC.WHEEL_LOCK_ONSET_SLOW * clamp(1 - vStdNow / Math.max(PC.WHEEL_LOCK_V_HIGH, 1), 0, 1);
    const lockRange = PC.WHEEL_LOCK_RANGE;
    c.wheelLock = braking && c.speed > 0 && afF > lockOn
      ? clamp((afF - lockOn) / lockRange, 0, 1) : 0;
    c.flatSpot = clamp((c.flatSpot || 0) + c.wheelLock * dt * 0.4 - dt / 90, 0, 1);
    if (c.isPlayer && c.wheelLock > 0.25 && (c.lockHapT = (c.lockHapT || 0) - dt) <= 0) {
      Input.rumble(0.25 + c.wheelLock * 0.45, 90, "brake");
      c.lockHapT = 0.14;
    }
    const bbSlipF = Math.sqrt(Math.max(0, 1 - afF * afF));
    const bbSlipR = Math.sqrt(Math.max(0, 1 - afR * afR));
    c.slipFactor = bbSlipR;
    const useWheel = typeof WheelState !== "undefined" && WheelState.enabled();
    const ellipseF = useWheel ? 1 : bbSlipF;
    const ellipseR = useWheel ? 1 : bbSlipR;
    const muBase = LAT_MAX * PLAYER_GRIP * aeroGrip * surfMu * kerbGrip * weatherGrip * modsCornering * bankMu * (1 + vertLoad) * marbleMu * tyreMu;
    const rollAx = SetupTune.axleGrip(c.rollBalance, c.lateralAccel || 0, loadF);
    const muF = Math.max(0.5, muBase * ellipseF * loadF * (1 - LOAD_SENS * (loadF / FRONT_WEIGHT - 1)) * FRONT_GRIP * tyreAx.f * rollAx.f * dmgF);
    const og = Vehicle.grip;
    og.muF = muF; og.csFront = CS_FRONT; og.af = af; og.ar = ar;
    og.braking = braking; og.shaped = Math.sign(steer) * Math.pow(Math.abs(steer), G.STEER_EXPO); og.dt = dt;
    const gripped = (typeof GripSteer !== "undefined" && GripSteer.forPlayer)
      ? GripSteer.forPlayer(driverDelta, c, og)
      : driverDelta;
    delta = clamp(gripped + assistDelta + lineDelta, -0.7, 0.7);
    const muR = Math.max(0.5, muBase * ellipseR * loadR * (1 - LOAD_SENS * (loadR / (1 - FRONT_WEIGHT) - 1)) * (1 - DRIFT * 0.55) * tyreAx.r * rollAx.r * dmgR);
    const csR = CS_REAR * (1 - DRIFT * 0.40);
    const DIR_BLEND = 1;
    const vx = Math.max(vAbs, 4), dirS = clamp(c.speed / DIR_BLEND, -1, 1);
    const slipF = Math.atan2((c.vLat || 0) + af * (c.yawRateCur || 0), vx) - dirS * delta;
    const slipR = Math.atan2((c.vLat || 0) - ar * (c.yawRateCur || 0), vx);
    let latScaleF = 1, latScaleR = 1;
    if (useWheel) {
      const bF = TyreModel.brakeFront(beta, loadF, loadR) * (bb ? bb.f : 1);
      const bR = beta * (bb ? bb.r : 1);
      const capG = longBudget * surfMu * kerbGrip * tyreMu * marbleMu * aeroGrip;
      const ow = Vehicle.wheel;
      ow.dt = dt; ow.braking = braking; ow.thrOn = thrOn;
      ow.aReqF = -pedal * bF * longBudget;
      ow.aReqR = thrOn ? axThrDemand * LONG_GRIP : -(pedal * bR + engine) * longBudget;
      ow.muLongF = capG * tyreAx.f; ow.muLongR = capG * tyreAx.r;
      ow.slipF = slipF; ow.slipR = slipR; ow.csFront = CS_FRONT; ow.csRear = csR;
      ow.muLatF = muF; ow.muLatR = muR;
      const ws = WheelState.stepPlayer(c, ow);
      latScaleF = ws.latScaleF;
      latScaleR = ws.latScaleR;
      const aT = Number.isFinite(ctx.axTarget) ? ctx.axTarget : 0, q = ws.shortfall;
      const fwd = clamp(c.speed / 0.5, 0, 1);
      const back = fwd * (braking ? Math.max(0, -aT) * q : (thrOn ? -Math.max(0, aT) * q : 0));
      if (back !== 0) {
        c.speed = braking ? c.speed + back * dt : Math.max(0, c.speed + back * dt);
        c.axEstSm = (c.axEstSm ?? 0) + back * (1 - Math.exp(-10 * dt));
      }
    }
    if (typeof DebrisWorld !== "undefined" && DebrisWorld.active()) {
      _marbleArg.lock = c.axFrac != null ? c.axFrac : axFrac;
      _marbleArg.slip = Math.max(Math.abs(slipF), Math.abs(slipR));
      _marbleArg.speed = c.speed;
      DebrisWorld.tyreMarble(c, _marbleArg);
    }
    const Fyf = tyreSat(CS_FRONT, slipF, muF) * sp * latScaleF;
    const Fyr = tyreSat(csR, slipR, muR, TyreModel.CURVE_FLOOR_R, TyreModel.CURVE_FALL_W_R, TyreModel.CURVE_HOLD_R) * sp * latScaleR;
    const cosD = Math.cos(delta);
    const sat = Math.abs(CS_FRONT * slipF) / Math.max(muF, 1e-3);
    const satR = Math.abs(csR * slipR) / Math.max(muR, 1e-3);
    if (c.isPlayer && !c.offroad && sp > 0.5 && typeof Input !== "undefined") {
      const asking = Math.abs(steer) > 0.15;
      const hot = sat > 1.15 && asking;
      c.uslipDwell = hot ? Math.min((c.uslipDwell || 0) + 1, 3) : 0;
      if (c.uslipDwell >= 2 && (c.uslipHapT = (c.uslipHapT || 0) - dt) <= 0) {
        const bite = clamp((sat - 1.15) / 0.85, 0, 1);
        Input.vibrate(10 + (bite * 18) | 0);
        Input.rumble(0.18 + bite * 0.32, 70);
        c.uslipHapT = 0.16 - bite * 0.06;
      }
      const pastR = satR / TyreModel.CURVE_HOLD_R, pastF = sat / TyreModel.CURVE_PEAK_X_F;
      if (pastR > 1 && pastR > pastF && (c.oslipHapT = (c.oslipHapT || 0) - dt) <= 0) {
        const bite = clamp(pastR - 1, 0, 1);
        Input.vibrate(18 + (bite * 22) | 0);
        Input.rumble(0.30 + bite * 0.40, 110, "throttle");
        c.oslipHapT = 0.24 - bite * 0.08;
      }
    }
    const ay = Fyf * cosD + Fyr;
    c.lateralAccel = ay;
    c.slipFront = slipF; c.slipRear = slipR; c.steerAngle = delta;
    c.gripFront = muF; c.gripRear = muR; c.forceFront = Fyf; c.forceRear = Fyr;
    c.frontUtil = sat / TyreModel.CURVE_PEAK_X_F; c.rearUtil = satR / TyreModel.CURVE_PEAK_X;
    const kz2 = Math.max(1e-3, af * ar * YAW_INERTIA);
    const coastYaw = (!onThrottle && !braking)
      ? (PC.COAST_YAW_DAMP || 0) * clamp(
          ((c.rearUtil || 0) - (PC.COAST_YAW_LO || 0.65)) /
            Math.max((PC.COAST_YAW_HI || 1.1) - (PC.COAST_YAW_LO || 0.65), 1e-3),
          0, 1)
      : 0;
    const SPEED_YAW_LO = 50, SPEED_YAW_HI = 65, SPEED_YAW_EXTRA = 5;
    const _syT = clamp((vAbs - SPEED_YAW_LO) / (SPEED_YAW_HI - SPEED_YAW_LO), 0, 1);
    const speedYawDamp = 1 + SPEED_YAW_EXTRA * _syT * _syT * (3 - 2 * _syT);
    const yawBrakeCap = BRAKE * (1 + (brakeScale - 1) * brakeMix);
    const brakeYawDamp = 1 + 1.4 * clamp(decel / yawBrakeCap, 0, 1) + coastYaw;
    const vLat0 = c.vLat || 0;
    const r0 = c.yawRateCur || 0;
    const u0 = c.speed;
    const LOW_YAW_V = 8;
    const LOW_YAW_SUBS = 4;
    if (vAbs >= LOW_YAW_V) {
      const rdot = (af * Fyf * cosD - ar * Fyr) / kz2 - YAW_DAMP * brakeYawDamp * speedYawDamp * (c.yawRateCur || 0);
      c.vLat = clamp(vLat0 + (ay - u0 * r0) * dt, -40, 40);
      if (sp < 1 && c.vLat) c.vLat = Math.sign(c.vLat) * Math.max(0, Math.abs(c.vLat) - muBase * (1 - sp) * dt);
      c.yawRateCur = clamp(r0 + rdot * dt, -4, 4);
      c.head -= c.yawRateCur * dt;
    } else {
      const rdot1 = (af * Fyf * cosD - ar * Fyr) / kz2 - YAW_DAMP * brakeYawDamp * speedYawDamp * r0;
      let v1 = clamp(vLat0 + (ay - u0 * r0) * dt, -40, 40);
      if (sp < 1 && v1) v1 = Math.sign(v1) * Math.max(0, Math.abs(v1) - muBase * (1 - sp) * dt);
      const r1 = clamp(r0 + rdot1 * dt, -4, 4);
      const head1 = c.head - r1 * dt;
      const h = dt / LOW_YAW_SUBS;
      let vL = vLat0, r = r0, head = c.head;
      for (let si = 0; si < LOW_YAW_SUBS; si++) {
        const sF = Math.atan2(vL + af * r, vx) - dirS * delta;
        const sR = Math.atan2(vL - ar * r, vx);
        const FyfI = tyreSat(CS_FRONT, sF, muF) * sp * latScaleF;
        const FyrI = tyreSat(csR, sR, muR, TyreModel.CURVE_FLOOR_R, TyreModel.CURVE_FALL_W_R, TyreModel.CURVE_HOLD_R) * sp * latScaleR;
        const ayI = FyfI * cosD + FyrI;
        const rdotI = (af * FyfI * cosD - ar * FyrI) / kz2 - YAW_DAMP * brakeYawDamp * speedYawDamp * r;
        vL = clamp(vL + (ayI - u0 * r) * h, -40, 40);
        if (sp < 1 && vL) vL = Math.sign(vL) * Math.max(0, Math.abs(vL) - muBase * (1 - sp) * h);
        r = clamp(r + rdotI * h, -4, 4);
        head -= r * h;
      }
      const _lyT = clamp((LOW_YAW_V - vAbs) / LOW_YAW_V, 0, 1);
      const w = _lyT * _lyT * (3 - 2 * _lyT);
      c.vLat = (1 - w) * v1 + w * vL;
      c.yawRateCur = (1 - w) * r1 + w * r;
      c.head = (1 - w) * head1 + w * head;
    }
    const COUPLE_V_MIN = 3;
    if (vAbs >= COUPLE_V_MIN) {
      const couple = vLat0 * r0 - Fyf * Math.sin(delta);
      if (Number.isFinite(couple)) {
        let u1 = u0 + couple * dt;
        if (u0 > 0) u1 = Math.max(0, u1);
        else if (u0 < 0) u1 = Math.min(0, u1);
        c.speed = u1;
      }
    }
  }

  return { create, tyreSat, recoverBlocked, assistYawEase };
})();
Object.freeze(PlayerForces);