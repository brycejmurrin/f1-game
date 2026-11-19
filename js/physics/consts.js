"use strict";
window.PhysicsConsts = {
  REVISION: "2026-09-ai-mistakes-1",
  VMAX: 72,
  ACCEL: 7,
  BRAKE: 22,
  BB_REF: 0.56,
  REVERSE_MAX: -5,
  REVERSE_ACCEL: 5,
  COAST_DRAG: 6,
  GRAVITY_SLOPE: 9,
  LAT_MAX: 22,
  STEER_VMAX: 15,

  FRONT_WEIGHT: 0.47,
  CS_FRONT: 130,
  CS_REAR: 175,
  WT_LONG: 0.22,
  BRAKE_STAB: 0.8,
  BRAKE_STAB_LO: 0.55,
  BRAKE_STAB_HI: 0.8,
  BRAKE_STAB_SHIFT: 0.5,
  COAST_YAW_DAMP: 1.5,
  COAST_YAW_LO: 0.65,
  COAST_YAW_HI: 1.10,
  LOAD_SENS: 0.10,

  DOWNFORCE: 0.65,

  X_VMAX_GAIN_LO: 0.055,
  X_VMAX_GAIN_HI: 0.155,
  X_DF_LOSS_LO: 0.42,
  X_DF_LOSS_HI: 0.78,
  X_COAST_CUT_LO: 0.28,
  X_COAST_CUT_HI: 0.55,

  X_OPEN_RATE: 2.6,
  X_CLOSE_RATE: 8.0,
  X_MIN_SPEED: 25,
  OT_MIN_SPEED: 15,
  OFF_GRIP: 0.42,

  ASSIST_KUS: 0.0008,

  LINE_PURSUIT: 2.6,

  LONG_GRIP: 34,
  WHEEL_LOCK_ONSET: 0.66,
  WHEEL_LOCK_RANGE: 0.05,
  WHEEL_LOCK_ONSET_SLOW: 0.022,
  WHEEL_LOCK_V_HIGH: 45,
  THR_FLOOR: 0.34,
  THR_CAP: 0.62,
  THR_VK: 14,

  WET_GRIP: {
    dry:  [1.00, 0.92, 0.90],
    wet:  [0.82, 0.94, 0.88],
    rain: [0.72, 0.86, 0.97],
  },

  WHEEL_R: 0.34,
  WHEEL_STEER_VIS: 0.5,

  GRASS_V: 18,
  KERB_SHAKE: 0.22,
  KERB_CUE_HOLD: 0.10,

  DEPLOY_A: 3.0,
  TAPER_LO: 41, TAPER_HI: 53,

  TAPER_FLOOR: 0.35,

  DRAIN_LO: 0.14, DRAIN_HI: 0.26,
  REGEN_LO: 0.085, REGEN_HI: 0.155,
  REGEN_FULL_V: 20,
  OT_TIME_LO: 3.2, OT_TIME_HI: 5.2,
  OT_GAP: 1.0,
  OT_MJ: 0.5,
  ES_MJ: 4,
  TOW_RANGE: 34, TOW_FADE: 28, TOW_HALF_W: 4,
  BLOCKER_HALF_W: 2.2,

  GEARS: 8,
  GEAR_TOP: [0.095, 0.16, 0.25, 0.36, 0.50, 0.66, 0.83, 1.0],
  IDLE_RPM: 5000, MAX_RPM: 15000,

  DIFF: {
    easy:   { ai: 0.851, band: 0.18, corner: 0.93, err: 3.5 },
    normal: { ai: 0.911, band: 0.08, corner: 0.97, err: 1.8 },
    hard:   { ai: 1.030, band: 0.02, corner: 1.00, err: 1.0 },
  },
};
window.PhysicsConsts.FIXED_DT = 1 / 60;
window.PhysicsConsts.BAND_CEIL = (() => {
  const top = Object.values(window.PhysicsConsts.DIFF).reduce((a, d) => (d.ai > a.ai ? d : a));
  return Math.min(1, top.ai * (1 + top.band));
})();

window.PhysicsConsts.DirtyAir = (function () {
  "use strict";
  const LOSS = { off: 0, classic: 0.35, cfd: 0.67 };
  const CFD_LAMBDA = 12;
  const CFD_LAT = 3.5;
  const GAP_MIN = 0.5;
  function isLevel(v) { return Object.prototype.hasOwnProperty.call(LOSS, v); }
  function wakeOf(gap, dx, mode, tow) {
    const g = Math.max(GAP_MIN, gap || 0);
    const x = dx || 0;
    if (mode === "cfd") {
      const long = Math.exp(-g / CFD_LAMBDA);
      const lat = Math.exp(-(x * x) / (2 * CFD_LAT * CFD_LAT));
      return Math.max(0, Math.min(1, long * lat));
    }
    const range = tow && tow.range != null ? tow.range : 34;
    const fade = tow && tow.fade != null ? tow.fade : 28;
    const halfW = tow && tow.halfW != null ? tow.halfW : 4;
    return Math.max(0, Math.min(1, (range - g) / fade))
      * Math.max(0, Math.min(1, 1 - Math.abs(x) / halfW));
  }
  function mul(wake, speed, mode, downforce, vTop) {
    if (!wake || mode === "off") return 1;
    const loss = LOSS[mode] != null ? LOSS[mode] : LOSS.classic;
    if (!loss) return 1;
    const aeroShare = downforce / (1 + downforce);
    const q = Math.min(1, Math.abs(speed || 0) / Math.max(1, vTop || 1)) ** 2;
    return 1 - loss * wake * aeroShare * q;
  }
  return {
    LOSS, CFD_LAMBDA, CFD_LAT, GAP_MIN, isLevel, wakeOf, mul,
    defaultLevel: "classic",
  };
})();
