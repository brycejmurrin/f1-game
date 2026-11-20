const PaceMath = (function () {
  "use strict";

  const clamp = M4.clamp;
  const lerp = M4.lerp;
  const PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : {};

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

    function vTop() { return getVMAX() * Math.max(getPACE(), 0.05); }
    function vStd(v) { return v * getVMAX() / vTop(); }
    function aStd(a) { return a / Math.max(getPACE(), 0.05); }

    function aeroLoadOf(c) { return c && c.aeroLoad != null ? c.aeroLoad : 0.5; }
    function xLoadOf(c) { return c && c.human === false ? 0.5 : aeroLoadOf(c); }
    function aeroWetK() {
      const rc = getRaceCtl();
      return rc && rc.lowGrip() ? 0.5 : 1;
    }
    function xVmaxGain(c) { return aeroWetK() * lerp(X_VMAX_GAIN_LO, X_VMAX_GAIN_HI, xLoadOf(c)); }
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
    function xDfLoss(c) { return aeroWetK() * lerp(X_DF_LOSS_LO, X_DF_LOSS_HI, xLoadOf(c)); }
    function xCoastCut(c) { return aeroWetK() * lerp(X_COAST_CUT_LO, X_COAST_CUT_HI, xLoadOf(c)); }

    function isErsDeploying(c) {
      if (!c) return false;
      return !!c.deploying;
    }
    function ersDeployOf(c) { return c && c.ersDeploy != null ? c.ersDeploy : 0.5; }
    function ersRegenOf(c) { return c && c.ersRegen != null ? c.ersRegen : 0.5; }
    function drainFor(c) { return lerp(DRAIN_HI, DRAIN_LO, ersDeployOf(c)); }
    function regenFor(c) { return lerp(REGEN_LO, REGEN_HI, ersRegenOf(c)); }
    function otTimeFor(c) { return lerp(OT_TIME_LO, OT_TIME_HI, ersDeployOf(c)); }

    function aeroDfMult(c) { return 1 - xDfLoss(c) * (c && c.aeroX || 0); }

    function gearHi(g) { return vTop() * GEAR_TOP[g - 1]; }
    function rpmFor(gear, speed) {
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
