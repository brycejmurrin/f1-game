/* Apex 26 — PLAYER FORCES: combined-slip budget, axle grip circle, soft tyre
 * forces and the human rigid-body yaw/lateral integrate. Extracted from
 * updateCar so wheel-slip / tyre workstreams edit this file instead of growing
 * saturated js/game.js. The Frenet world writeback (px/pz → s,x) stays in
 * game.js — this module never invents a physics state struct.
 *
 * create(G) reads only tunables already on the façade (PLAYER_GRIP, FRONT_GRIP,
 * DRIFT, YAW_*). Per-tick locals arrive as an explicit ctx bag — no new G
 * members. Behavior-identical to the pre-extract inline block.
 *
 * Plan: carve-headroom Slice A (docs/plans/, 2026-09-30).
 */
const PlayerForces = (function () {
  "use strict";

  const clamp = M4.clamp;
  const PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : {};

  // Soft-saturating lateral tyre force (accel units). Hoisted so the human
  // path does not allocate a closure every physics step (~60/s).
  function tyreSat(cs, a, mu, floor, fallW, hold) {
    return -mu * TyreModel.lateralCurve(cs * a / mu, floor, fallW, hold);
  }

  // Pooled scratch for DebrisWorld.tyreMarble (read-only inside that hook).
  const _marbleArg = { lock: 0, slip: 0, speed: 0 };

  let G = null;

  function create(g) {
    G = g;
    Log.info("game", "PlayerForces.create");
    return { step, tyreSat };
  }

  // Combined slip → axle µ → Fy → yaw/vLat/head. Writes force fields on `c`.
  // ctx (all required unless noted):
  //   dt, driverDelta, assistDelta, lineDelta, onThrottle, throttleLvl, gearMult, deploy, braking,
  //   surfaceMu, kerbGrip, bankMu, modsCornering, loadF, loadR, vertLoad,
  //   af, ar, sp, steer, weatherGrip, aeroDf, dirtyMul, coastCut, vTopNow, tyres
  // delta is derived after muF via GripSteer.forPlayer (identity at OFF).
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
    let delta = 0;   // filled after muF — GripSteer then + assist/line
    // A NaN driverDelta (or dt) from an upstream spike must not poison
    // vLat / yawRate / head for the rest of the session — clamp() passes NaN.
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

    // --- combined slip (traction circle), PER AXLE: grip already spent
    // braking or accelerating is unavailable for cornering, and each axle pays
    // for what IT does. Braking charges both axles (split by brake bias below;
    // 1/1 at BB_REF) from the smoothed deceleration axEstSm, so easing off the
    // pedal hands grip back continuously and trail-braking rotates the car.
    // Engine braking (the coast part of that deceleration) and the THROTTLE
    // charge the driven rear only: the undriven front spends nothing on the
    // pedal, so a planted throttle on a slow exit lightens the rear's lateral
    // grip and the car rotates — power-on oversteer, emergent. The throttle
    // charge is a fraction of LONG_GRIP: traction-limited at low speed
    // (THR_CAP), power-limited above (THR_VK / vStd, an engine's P/v), floored
    // at THR_FLOOR so planting the pedal mid-corner spends grip even when
    // speed-limited (THR_* in js/physics/consts.js). Weather thins the
    // longitudinal budget too, so braking bites grip in the wet. Weight
    // transfer still uses faded axEstSm (no fake unload at vmax).
    // vStd via G.vTop: pace-scaled threshold for the THR_VK / |v| term.
    const vAbs = Math.abs(c.speed);
    const vStdNow = vAbs * (PC.VMAX || 72) / Math.max(vTopNow, 0.05);
    // BRAKING WINS over the throttle, exactly as it does in game.js's speed
    // integrator and axEstTarget: a held pedal (auto-throttle, tilt/touch, or W
    // under the brake) makes no drive thrust while braking, so it must not
    // charge the driven rear's grip either — it defeated the rear brake-by-wire
    // (BRAKE_STAB): measured at 30 m/s, 0.75 lock, axFracR 0.39 -> 0.62.
    const thrOn = onThrottle && !braking;
    const axThrDemand = thrOn
      ? clamp(THR_VK / Math.max(vStdNow, 1), THR_FLOOR, THR_CAP)
          * (c.human ? throttleLvl : 1) * gearMult + Math.max(0, deploy) / LONG_GRIP
      : 0;
    const longBudget = LONG_GRIP * weatherGrip;
    const decel = Math.max(0, -(c.axEstSm ?? 0));
    const cdNow = COAST_DRAG * (1 - coastCut * (c.aeroX || 0));
    // The pedal's share of a deceleration: 0 while coasting (engine braking
    // only), 1 from 1.5× coast drag up. Continuous, so a brush of the brake
    // never steps the front's grip.
    const brakeMix = clamp((decel - cdNow) / (0.5 * cdNow), 0, 1);
    const pedal = decel * brakeMix / longBudget, engine = (decel - decel * brakeMix) / longBudget, beta = (c.brakeStab = TyreModel.brakeBeta(c.brakeStab, c.rearUtil, dt));   // BRAKE STABILITY: the loaded rear eases its pedal share (PhysicsConsts.BRAKE_STAB)
    const axFracF = Math.min(1, pedal * TyreModel.brakeFront(beta, loadF, loadR)), axFracR = Math.min(1, Math.max(pedal * beta + engine, axThrDemand));
    const axFrac = Math.max(axFracF, axFracR);
    c.axFrac = axFrac;
    c.axFracF = axFracF; c.axFracR = axFracR;
    // LOCK-UP (render + feel only): braking at the top of the friction budget
    // stops the fronts turning; a lock leaves a flat spot that wobbles the
    // wheel once per revolution and heals over ~90 s of rolling. The grip
    // model above is untouched — this is what the wheels SHOW.
    c.wheelLock = braking && c.speed > 0 && axFracF > 0.60 ? clamp((axFracF - 0.60) / 0.08, 0, 1) : 0;   // 0.92 is unreachable and the per-axle rewrite did not move it: measured peak axFracF 0.638 dry / 0.887 rain on a straight-line full stop, and 0.638 again at 62 % front bias, so no dry stop ever locked a wheel and the flat-spot system below (wobble, 90 s heal) was dead code
    c.flatSpot = clamp((c.flatSpot || 0) + c.wheelLock * dt * 0.4 - dt / 90, 0, 1);
    // LOCK-UP HAPTIC: left-trigger rumble when the pad supports trigger-rumble
    // (falls back to dual-rumble). Cadence matches the slide cues below.
    if (c.isPlayer && c.wheelLock > 0.25 && (c.lockHapT = (c.lockHapT || 0) - dt) <= 0) { Input.rumble(0.25 + c.wheelLock * 0.45, 90, "brake"); c.lockHapT = 0.14; }
    // --- friction limit per axle (the grip circle). Everything scales with the
    // same surface/weather grip the rest of the sim uses.
    // Aero load (rises with v²) sets the speed dependence, and the surface the
    // car is actually on scales lateral grip — see DOWNFORCE / OFF_GRIP.
    // ACTIVE AERO pays for its straight-line speed HERE, and only here: the
    // aero-load term is scaled by aeroDfMult (1 in Z-mode, 0.45 with the flaps
    // fully open). Carrying X-mode into a fast corner is therefore a genuine
    // loss of grip at exactly the speed where aero load is doing the most work.
    // ...and the same wake penalty the AI pays (dirtyAirMul): following costs
    // downforce for everyone, or the assist is a cheat in one direction.
    const aeroGrip = (1 + DOWNFORCE * aeroDf * Math.min(1, (vAbs / vTopNow) ** 2))
      * dirtyMul;
    c._aeroGrip = aeroGrip;          // see c._vmaxNow — the other half of the trade
    const surfMu = surfaceMu;
    // B3 (marbles-affect-grip, flag apex26.marbleGrip): an EXTERNAL grip scalar
    // for a player sitting on a settled off-line marble cluster, fed in ALONGSIDE
    // gripMult()/kerbGrip/bankMu here — the existing mu-scaling seam. It NEVER
    // touches LONG_GRIP or slipFactor (computed above, untouched) and never moves
    // the car; it is a pure function of deterministic marble positions and returns
    // 1.0 (a true no-op) off-path. Subtle by construction (≤7% via MARBLE_GRIP_MIN).
    const marbleMu = (typeof DebrisWorld !== "undefined" && DebrisWorld.active()) ? DebrisWorld.marbleGrip(c) : 1;
    // TYRE WEAR (js/physics/tyre-model.js), fed in at the same seam and on the
    // same terms as marbleMu above: an external grip scalar, a pure function of
    // deterministic per-car state, exactly 1.0 when the setting is off — which
    // is what keeps tests/specs/physics-characterization.spec.js honest. It is
    // NOT arc-derived: wear integrates the forces this car actually made.
    const tyreMu = tyres.gripMul(c);
    // …and the FRONT/REAR half of it. muBase already carries the shared drop,
    // so this is the ratio each axle differs by: worn fronts stop the car
    // turning in, worn rears let it step out. Exactly 1/1 with the setting off.
    const tyreAx = tyres.axleSplit(c);
    // Brake bias re-splits the PEDAL's share of each axle's charge, gated on
    // smoothed deceleration so pedal release is continuous. At BB_REF both
    // scales are exactly 1 and the per-axle fractions above stand as they are.
    const bbOn = (c.axEstSm ?? 0) < 0 && c.brakeBias != null && c.brakeBias !== SetupTune.BB_REF;
    const bb = bbOn ? SetupTune.bbScales(c.brakeBias) : null;
    // (bbSlip*, not slipF/slipR — those names are the axles' SLIP ANGLES below.)
    const afF = bb ? Math.min(1, axFracF * bb.f) : axFracF;
    const afR = bb ? Math.min(1, Math.max(engine + pedal * beta * bb.r, axThrDemand)) : axFracR;
    const bbSlipF = Math.sqrt(Math.max(0, 1 - afF * afF));
    const bbSlipR = Math.sqrt(Math.max(0, 1 - afR * afR));
    c.slipFactor = bbSlipR;   // the DRIVEN axle's circle: setEngine() reads it for slip01; unassigned it read a constant 1
    const muBase = LAT_MAX * PLAYER_GRIP * aeroGrip * surfMu * kerbGrip * weatherGrip * modsCornering * bankMu * (1 + vertLoad) * marbleMu * tyreMu;
    const rollAx = SetupTune.axleGrip(c.rollBalance, c.lateralAccel || 0, loadF);
    const muF = Math.max(0.5, muBase * bbSlipF * loadF * (1 - LOAD_SENS * (loadF / FRONT_WEIGHT - 1)) * FRONT_GRIP * tyreAx.f * rollAx.f);   // load-sensitive: the loaded axle gains less than its share (LOAD_SENS)
    // Grip steer: own-state driverDelta cap (js/physics/grip-steer.js). Identity at OFF.
    const gripped = (typeof GripSteer !== "undefined" && GripSteer.forPlayer)
      ? GripSteer.forPlayer(driverDelta, c, { muF, csFront: CS_FRONT, af, ar, braking, shaped: steer, dt })
      : driverDelta;
    delta = clamp(gripped + assistDelta + lineDelta, -0.7, 0.7);
    const muR = Math.max(0.5, muBase * bbSlipR * loadR * (1 - LOAD_SENS * (loadR / (1 - FRONT_WEIGHT) - 1)) * (1 - DRIFT * 0.55) * tyreAx.r * rollAx.r);
    const csR = CS_REAR * (1 - DRIFT * 0.40);            // looser rear also softens its stiffness
    // --- slip angles: each axle's lateral travel (body frame) vs its forward
    // travel, minus the steer it's pointed at. vx is floored so the atan stays
    // well-conditioned at low speed.
    // |speed| floored at 4 so the atan stays well-conditioned at low speed. A
    // tyre's lateral force opposes its lateral velocity in REVERSE too, so slip
    // is measured against |vx|: atan2(vLat, -4) parked both axles on the tanh
    // plateau with a sign that flipped on vLat ≈ 0 (a steady slide on a straight
    // reverse, measured). Only the steer term changes sign with direction.
    // Soft-blend that sign through standstill: a hard `speed < 0 ? -1 : 1`
    // snapped the steer term by ~2·δ in one tick (measured: slipFront −0.182 →
    // +0.491 when speed 0 → −0.083 at full lock — 38.6°, exactly 2·δ). Full
    // reverse authority is unchanged above DIR_BLEND; the |vx| floor stays.
    const DIR_BLEND = 1;   // m/s — ~12 reverse-accel ticks; REVERSE_ACCEL·dt ≈ 0.083
    const vx = Math.max(vAbs, 4), dirS = clamp(c.speed / DIR_BLEND, -1, 1);
    const slipF = Math.atan2((c.vLat || 0) + af * (c.yawRateCur || 0), vx) - dirS * delta;
    const slipR = Math.atan2((c.vLat || 0) - ar * (c.yawRateCur || 0), vx);
    // Debris side-world (A2): shed tyre marbles under lock-up / slide. Reads the
    // already-computed combined-slip signals READ-ONLY; cosmetic, never grip.
    if (typeof DebrisWorld !== "undefined" && DebrisWorld.active()) {
      _marbleArg.lock = axFrac;
      _marbleArg.slip = Math.max(Math.abs(slipF), Math.abs(slipR));
      _marbleArg.speed = c.speed;
      DebrisWorld.tyreMarble(c, _marbleArg);
    }
    // Soft-saturating lateral tyre force (accel units): linear slope = stiffness
    // near centre, smoothly capped at the friction limit — how real tyres behave
    // and far more controllable on a noisy tilt signal than a hard clamp.
    const Fyf = tyreSat(CS_FRONT, slipF, muF) * sp;
    const Fyr = tyreSat(csR, slipR, muR, TyreModel.CURVE_FLOOR_R, TyreModel.CURVE_FALL_W_R, TyreModel.CURVE_HOLD_R) * sp;   // the rear's wider limit zone and gentler fall
    const cosD = Math.cos(delta);
    // Where each axle sits on its tyre curve: x = cs·α/mu, the curve's own
    // abscissa (peak at TyreModel.CURVE_PEAK_X for the rear, CURVE_PEAK_X_F for
    // the front — its curve is rescaled to peak earlier). MONOTONIC in slip, unlike
    // |Fy|/mu, which peaks at 1 and FALLS past the peak — a consumer keyed on
    // "utilisation > 0.9" would go quiet exactly when the driver has overdriven
    // most. So frontUtil/rearUtil below are x / peak: 1.0 = at the peak, above
    // it = past (the coach and obs() read them).
    const sat = Math.abs(CS_FRONT * slipF) / Math.max(muF, 1e-3);
    const satR = Math.abs(csR * slipR) / Math.max(muR, 1e-3);
    // Front saturation cue: feedback only; never writes the driving state.
    if (c.isPlayer && !c.offroad && sp > 0.5 && typeof Input !== "undefined") {
      const asking = Math.abs(steer) > 0.15;
      // A DWELL of one extra tick before the first pulse. Placing the car
      // (jump/rescue/an incident handback) starts it with zero lateral
      // velocity and zero yaw rate, so full lock puts the whole steer angle
      // into the front's slip on tick one and `sat` spikes over the trigger
      // before the slide has actually begun — measured at 1.18, then settling
      // to 0.94 for nine ticks while the car starts to rotate, and only then
      // climbing for real. A single frame over a threshold is not information;
      // it is a discontinuity, and it left a pulse stranded ahead of the
      // cue's own cadence (tests/specs/understeer-cue.spec.js's bounded-rate
      // row measured the 16-tick hole it opened). Two consecutive qualifying
      // ticks is 33 ms — under the pulse's own 70 ms — so a real slide is
      // announced no later than before.
      const hot = sat > 1.15 && asking;
      c.uslipDwell = hot ? Math.min((c.uslipDwell || 0) + 1, 3) : 0;
      if (c.uslipDwell >= 2 && (c.uslipHapT = (c.uslipHapT || 0) - dt) <= 0) {
        const bite = clamp((sat - 1.15) / 0.85, 0, 1);   // 0 at onset, 1 well past
        // Safari throws from vibrate() outside a user gesture and some engines
        // throw on an out-of-range pattern. A cue the driver may not even feel
        // is not worth interrupting the physics frame for, so it is ignored on
        // purpose — the same call is retried a tenth of a second later anyway.
        Input.vibrate(10 + (bite * 18) | 0);
        Input.rumble(0.18 + bite * 0.32, 70);
        c.uslipHapT = 0.16 - bite * 0.06;                // firmer slide = tighter pulse
      }
      // …and the REAR — but only when the rear is the end that is going. Each
      // axle is measured against where ITS OWN grip starts to fall (the front
      // at its peak, the rear at the end of its longer plateau), and the cue
      // fires when the rear is further past its own edge than the front is
      // past theirs. An absolute rear threshold is useless: the rear's
      // x = cs·slip/mu runs ABOVE the front's through ordinary understeer
      // (CS_REAR > CS_FRONT, muR < muF), so it buzzed through every fast
      // corner and broke tests/specs/understeer-cue.spec.js's "no other
      // haptic" premise (measured). With the relative rule it is silent
      // through understeer, a held drift and a lift-off, and speaks where the
      // rear actually goes light — trail braking (measured: 55 m/s, 0.75
      // lock). Slower and heavier than the front's pulse so a pad or a phone
      // can tell the two ends apart. Feedback only: reads slip, writes nothing.
      const pastR = satR / TyreModel.CURVE_HOLD_R, pastF = sat / TyreModel.CURVE_PEAK_X;
      if (pastR > 1 && pastR > pastF && (c.oslipHapT = (c.oslipHapT || 0) - dt) <= 0) {
        const bite = clamp(pastR - 1, 0, 1);
        Input.vibrate(18 + (bite * 22) | 0);
        Input.rumble(0.30 + bite * 0.40, 110, "throttle");
        c.oslipHapT = 0.24 - bite * 0.08;
      }
    }
    // --- rigid-body equations of motion (per unit mass). kz2 = yaw inertia/mass.
    const ay = Fyf * cosD + Fyr;                         // body lateral accel
    c.lateralAccel = ay;
    c.slipFront = slipF; c.slipRear = slipR; c.steerAngle = delta;
    c.gripFront = muF; c.gripRear = muR; c.forceFront = Fyf; c.forceRear = Fyr;
    c.frontUtil = sat / TyreModel.CURVE_PEAK_X_F; c.rearUtil = satR / TyreModel.CURVE_PEAK_X;
    // Floored: setPhysics({yawInertia:0}) would otherwise make the rdot below
    // divide by zero and NaN the whole car state.
    const kz2 = Math.max(1e-3, af * ar * YAW_INERTIA);   // yaw inertia / mass (scaled)
    // Under hard braking the front axle is heavily loaded and the rear goes light,
    // so the yaw moment (af·Fyf − ar·Fyr) drives the nose into the corner faster
    // than the baseline damping can check — that's the "snap to the inside" on a
    // high-speed stop. Scale yaw damping up with braking effort so the rotation is
    // arrested at the limit; gentle/trail braking (small decel) is barely affected,
    // preserving the rotation that helps the car turn in.
    // COAST_YAW_*: same idea for a mid-corner lift-off — engine braking + forward
    // transfer unload the rear while BRAKE_STAB only gates the pedal share, so
    // yaw used to run away (1.66× in 0.75 s). Extra damp only while coasting
    // near the rear's limit; throttle and brake paths are untouched.
    const coastYaw = (!onThrottle && !braking)
      ? (PC.COAST_YAW_DAMP || 0) * clamp(
          ((c.rearUtil || 0) - (PC.COAST_YAW_LO || 0.65)) /
            Math.max((PC.COAST_YAW_HI || 1.1) - (PC.COAST_YAW_LO || 0.65), 1e-3),
          0, 1)
      : 0;
    // Speed-scaled yaw damp (local): identity at ≤50 m/s, smoothstep to
    // 1+EXTRA by 65 m/s. Step-steer overshoot grew with speed (8%→19% from
    // 50→83 m/s at lock 0.5) because YAW_DAMP alone has no speed term; this
    // keeps the 220–300 km/h band near 8–12% without slowing ≤50 m/s turn-in
    // or touching COAST_YAW_*/the speed equation.
    const SPEED_YAW_LO = 50, SPEED_YAW_HI = 65, SPEED_YAW_EXTRA = 5;
    const _syT = clamp((vAbs - SPEED_YAW_LO) / (SPEED_YAW_HI - SPEED_YAW_LO), 0, 1);
    const speedYawDamp = 1 + SPEED_YAW_EXTRA * _syT * _syT * (3 - 2 * _syT);
    const brakeYawDamp = 1 + 1.4 * clamp(-(c.axEstSm ?? 0) / BRAKE, 0, 1) + coastYaw;
    const rdot = (af * Fyf * cosD - ar * Fyr) / kz2 - YAW_DAMP * brakeYawDamp * speedYawDamp * (c.yawRateCur || 0);
    // Capture body-frame state for the longitudinal couple BEFORE yaw/vLat
    // integrate, so this PR does not change those equations (#1196 yaw damp
    // stays bit-identical; low-speed yaw flip-flop is a separate follow-up).
    const vLat0 = c.vLat || 0;
    const r0 = c.yawRateCur || 0;
    const u0 = c.speed;
    c.vLat = clamp(vLat0 + (ay - u0 * r0) * dt, -40, 40);
    // ...and a SLIDING tyre still has friction where the slip model fades out (sp): with both
    // forces scaled to zero near a standstill, a spun or shunted stopped car skated sideways at
    // constant speed into the wall (2.000 -> 1.999 m/s over 4 s, measured). Coulomb bleed only.
    if (sp < 1 && c.vLat) c.vLat = Math.sign(c.vLat) * Math.max(0, Math.abs(c.vLat) - muBase * (1 - sp) * dt);
    c.yawRateCur = clamp(r0 + rdot * dt, -4, 4);
    // Increasing head = CCW / left; +yaw rate = nose right, so SUBTRACT.
    c.head -= c.yawRateCur * dt;
    // Lateral→longitudinal coupling (planar bicycle, per unit mass).
    // Body ˙u = Fx/m − Fyf·sin(δ) + v·r. Drive/brake/drag already landed in
    // game.js; add the missing front-tyre steer projection and Coriolis terms
    // here. Fyf is already accel units. Skip below COUPLE_V_MIN so low-speed
    // explicit Euler does not NaN or reverse through zero.
    const COUPLE_V_MIN = 3;
    if (vAbs >= COUPLE_V_MIN) {
      const couple = vLat0 * r0 - Fyf * Math.sin(delta);
      if (Number.isFinite(couple)) {
        // Clamp through standstill via u0 (pre-couple speed), not c.speed </> 0 —
        // those sign tests are vstd-lint allowlisted sites; do not add new ones.
        let u1 = u0 + couple * dt;
        if (u0 > 0) u1 = Math.max(0, u1);
        else if (u0 < 0) u1 = Math.min(0, u1);
        c.speed = u1;
      }
    }
  }

  return { create, tyreSat };
})();
Object.freeze(PlayerForces);