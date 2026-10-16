/* Apex 26 — PACE / ERS math: vTop/vStd/aStd, X-mode aero gains, paceRef buffer,
 * ERS drain/regen/overtake duration, aeroDfMult, and gearHi/rpmFor. Extracted from
 * js/game.js so the first game.js breakup slice is a pure move (no tuning).
 *
 * PaceMath.create(deps) — deps supply live PACE / VMAX / cars / track / raceCtl
 * getters. Reads PhysicsConsts and M4 at eval. Behavior-identical to the
 * pre-extract inline functions.
 */
const PaceMath = (function () {
  "use strict";

  const clamp = M4.clamp;
  const lerp = M4.lerp;
  const PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : {};

  // create(deps):
  //   getPACE()     live OVERALL SPEED scale (game.js `let PACE`)
  //   getVMAX()     bare envelope m/s (PhysicsConsts.VMAX, passed so the dep is explicit)
  //   getCars()     current field array (paceRef cache key)
  //   getTrack()    current track (paceRef length = track.n)
  //   getRaceCtl()  RaceControl handle or null (aeroWetK reads lowGrip())
  function create(deps) {
    const getPACE = deps.getPACE;
    const getVMAX = deps.getVMAX;
    const getCars = deps.getCars;
    const getTrack = deps.getTrack;
    const getRaceCtl = deps.getRaceCtl;

    const X_VMAX_GAIN_LO = PC.X_VMAX_GAIN_LO;
    const X_VMAX_GAIN_HI = PC.X_VMAX_GAIN_HI;
    const X_DF_LOSS_LO = PC.X_DF_LOSS_LO;
    const X_DF_LOSS_HI = PC.X_DF_LOSS_HI;
    const X_COAST_CUT_LO = PC.X_COAST_CUT_LO;
    const X_COAST_CUT_HI = PC.X_COAST_CUT_HI;
    const DRAIN_LO = PC.DRAIN_LO, DRAIN_HI = PC.DRAIN_HI;
    const REGEN_LO = PC.REGEN_LO, REGEN_HI = PC.REGEN_HI;
    const OT_TIME_LO = PC.OT_TIME_LO, OT_TIME_HI = PC.OT_TIME_HI;
    const GEAR_TOP = PC.GEAR_TOP;
    const IDLE_RPM = PC.IDLE_RPM, MAX_RPM = PC.MAX_RPM;

    // PACE is floored so a setPhysics({pace:0}) can't divide by zero.
    function vTop() { return getVMAX() * Math.max(getPACE(), 0.05); }
    function vStd(v) { return v * getVMAX() / vTop(); }
    // aStd() is vStd() for m/s^2, written as the divisor rather than the
    // VMAX/vTop() round trip so that at pace 5 (PACE === 1) it is the identity
    // to the bit.
    function aStd(a) { return a / Math.max(getPACE(), 0.05); }

    function aeroLoadOf(c) { return c && c.aeroLoad != null ? c.aeroLoad : 0.5; }
    // LOW GRIP (FIA 2026 B7.1.2(b)): active aero is PARTIAL in the wet — half the
    // trade each way. Exactly 1 on a slick track, so the dry car is untouched.
    function aeroWetK() {
      const rc = getRaceCtl();
      return rc && rc.lowGrip() ? 0.5 : 1;
    }
    function xVmaxGain(c) { return aeroWetK() * lerp(X_VMAX_GAIN_LO, X_VMAX_GAIN_HI, aeroLoadOf(c)); }
    // The per-node AI speed/vmax profile paceSample learns, one per field
    // (kept on the function: no new top-level state).
    function paceRef() {
      const cars = getCars();
      const track = getTrack();
      let r = paceRef.r;
      if (!r || r.cars !== cars) {
        r = paceRef.r = new Float32Array(track.n);
        r.cars = cars;
      }
      return r;
    }
    function xDfLoss(c) { return aeroWetK() * lerp(X_DF_LOSS_LO, X_DF_LOSS_HI, aeroLoadOf(c)); }
    function xCoastCut(c) { return aeroWetK() * lerp(X_COAST_CUT_LO, X_COAST_CUT_HI, aeroLoadOf(c)); }

    function isErsDeploying(c) {
      if (!c) return false;
      // Live flag from the deploy block — covers human BOOST, AI wantBoost, and
      // free OVERTAKE. Do not re-derive from boostOn alone: AI never sets boostOn.
      return !!c.deploying;
    }
    function ersDeployOf(c) { return c && c.ersDeploy != null ? c.ersDeploy : 0.5; }
    function ersRegenOf(c) { return c && c.ersRegen != null ? c.ersRegen : 0.5; }
    // Better deployment DRAINS SLOWER — the same press lasts longer rather than
    // pushing harder, because the push itself is what BOOST already scales.
    function drainFor(c) { return lerp(DRAIN_HI, DRAIN_LO, ersDeployOf(c)); }
    function regenFor(c) { return lerp(REGEN_LO, REGEN_HI, ersRegenOf(c)); }
    function otTimeFor(c) { return lerp(OT_TIME_LO, OT_TIME_HI, ersDeployOf(c)); }

    // Live downforce multiplier on the DOWNFORCE (aero-load) term. 1 in Z-mode,
    // 1 - X_DF_LOSS with the flaps fully open.
    function aeroDfMult(c) { return 1 - xDfLoss(c) * (c && c.aeroX || 0); }

    function gearHi(g) { return vTop() * GEAR_TOP[g - 1]; }
    function rpmFor(gear, speed) {
      // RPM is proportional to speed / this gear's top speed: a higher gear turns
      // the engine slower at a given speed. Floored at idle, capped just past
      // redline. (This also drives the engine pitch and the tach.)
      const hi = gearHi(gear);
      const rpm = MAX_RPM * (speed / Math.max(hi, 1));
      return clamp(rpm, IDLE_RPM, MAX_RPM * 1.04);
    }

    return {
      vTop, vStd, aStd,
      xVmaxGain, paceRef, xCoastCut, xDfLoss,
      isErsDeploying, drainFor, regenFor, otTimeFor,
      aeroDfMult, gearHi, rpmFor,
    };
  }

  return { create };
})();
Object.freeze(PaceMath);
