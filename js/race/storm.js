const Storm = (function () {
  "use strict";

  const SLOT = 8;
  const P_STORM = 0.5;
  const P_RAIN = 0.12;
  const THUNDER_MIN = 1, THUNDER_MAX = 6;
  const RAIN_K = Object.freeze({ count: 1.8, speed: 1.25, len: 1.35, alpha: 1.3 });
  const RAIN_1 = Object.freeze({ count: 1, speed: 1, len: 1, alpha: 1 });
  const SPRAY_STORM = 1.35;
  const SC_START_S = 90;
  const SC_ROLL_S = 150;

  const is = (w) => w === "storm";
  const asRain = (w) => (w === "storm" ? "rain" : w);
  const rainK = (w) => (w === "storm" ? RAIN_K : RAIN_1);
  const sprayK = (w) => (w === "storm" ? SPRAY_STORM : w === "rain" ? 1 : 0.6);

  function h01(seed, slot, salt) {
    const x = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(slot | 0, 0xc2b2ae35) ^ Math.imul(salt | 0, 0x27d4eb2f)) >>> 0;
    return Hash32.mix(x) / 4294967296;
  }

  function strikeAt(seed, k, rate, w, t0, t1) {
    const p = Math.min(0.95, (is(w) ? P_STORM : w === "rain" ? P_RAIN : 0) * (rate > 0 ? rate : 0));
    if (!(p > 0) || h01(seed, k, 1) >= p) return null;
    const t = (k + 0.05 + 0.9 * h01(seed, k, 2)) * SLOT;
    if (t0 !== undefined && !(t > t0 && t <= t1)) return null;
    const delay = THUNDER_MIN + h01(seed, k, 3) * (THUNDER_MAX - THUNDER_MIN);
    return { t, delay, near: 1 - (delay - THUNDER_MIN) / (THUNDER_MAX - THUNDER_MIN) };
  }

  function strikeIn(seed, t0, t1, rate, w) {
    if (!(t1 > t0) || t1 - t0 > 1) return null;
    for (let k = Math.floor(t0 / SLOT); k <= Math.floor(t1 / SLOT); k++) {
      const s = strikeAt(seed, k, rate, w, t0, t1);
      if (s) return s;
    }
    return null;
  }

  function schedule(seed, t0, t1, rate, w) {
    const out = [];
    for (let k = Math.floor(t0 / SLOT); k * SLOT < t1; k++) {
      const s = strikeAt(seed, k, rate, w);
      if (s && s.t >= t0 && s.t < t1) out.push(s);
    }
    return out;
  }

  const flashOk = (reduced) => !reduced;

  return Object.freeze({
    SLOT, P_STORM, P_RAIN, THUNDER_MIN, THUNDER_MAX, SC_START_S, SC_ROLL_S, RAIN_K,
    is, asRain, rainK, sprayK, strikeAt, strikeIn, schedule, flashOk, h01,
  });
})();
