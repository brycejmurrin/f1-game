/* Apex 26 — STORM (⛈): the weather above RAIN. Pure tables and the lightning
 * schedule; no state, no G. Read by js/race/weather-arc.js (stage + rain
 * intensity), js/race/race-control.js (the safety car), js/lighting/* (the
 * darker sky) and the render half of js/game.js (strikes, spray).
 *
 * WHAT A STORM IS HERE. Heavy rain is > 7.6 mm/h (AMS glossary,
 * https://glossary.ametsoc.org/wiki/Rain). On the ROAD it is no wetter than
 * rain — standing water is standing water — so grip and tread treat it as full
 * rain (asRain; TyreModel owns the grip and is not told about storms). What a
 * storm takes away is VISIBILITY: the floor and diffuser throw the water up into
 * a plume the car behind drives blind through
 * (https://www.the-race.com/formula-1/why-f1-cant-solve-its-wet-weather-problem/),
 * which is why race control starts a storm race behind the safety car and
 * neutralises one that a storm rolls over (the FIA's 2025 Belgian GP: formation
 * lap, red flag for visibility, restart behind the SC —
 * https://www.the-race.com/formula-1/belgian-grand-prix-delayed-red-flag-rain-visibility.md).
 *
 * LIGHTNING IS A FUNCTION OF (seed, clock). The clock is cut into SLOT-second
 * windows; each window holds at most one strike, at an offset hashed from the
 * seed and the window index. So a replay, a re-run with the same seed, and
 * every peer on the shared race clock see the same strikes, and a frame-rate
 * change cannot add or drop one (no countdown is ever summed).
 */
const Storm = (function () {
  "use strict";

  const SLOT = 8;              // s per lightning window
  const P_STORM = 0.5;         // strike chance per window at LIGHTNING FREQ 1: ~3.75 / min
  const P_RAIN = 0.12;         // plain rain keeps the odd distant strike: ~0.9 / min
  const THUNDER_MIN = 1, THUNDER_MAX = 6;   // s: sound at ~343 m/s, a strike 0.3–2 km out
  // Heavier rain than RAIN's tier: more, faster, longer, denser streaks
  // (Particles.rainIntensity scales rainSeed by these).
  const RAIN_K = Object.freeze({ count: 1.8, speed: 1.25, len: 1.35, alpha: 1.3 });
  const RAIN_1 = Object.freeze({ count: 1, speed: 1, len: 1, alpha: 1 });
  // Wet-road spray strength (game.js Rain spray: was rain 1, else 0.6).
  const SPRAY_STORM = 1.35;
  // Race control (js/race/race-control.js).
  const SC_START_S = 90;       // s a race STARTED in a storm runs behind the SC (~one lap)
  const SC_ROLL_S = 150;       // s cap on the SC a storm rolling in mid-race deploys

  const is = (w) => w === "storm";
  /** The weather a storm is FOR grip, tread, temperature and lighting presets. */
  const asRain = (w) => (w === "storm" ? "rain" : w);
  const rainK = (w) => (w === "storm" ? RAIN_K : RAIN_1);
  const sprayK = (w) => (w === "storm" ? SPRAY_STORM : w === "rain" ? 1 : 0.6);

  // 32-bit integer hash (Wang/murmur finaliser mix) → [0, 1). Its own, so the
  // schedule needs no other module and draws nothing from the sim stream.
  function h01(seed, slot, salt) {
    let x = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(slot | 0, 0xc2b2ae35) ^ Math.imul(salt | 0, 0x27d4eb2f)) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  /** The strike in window `k`, or null: { t, delay, near }. `rate` is the
   *  LIGHTNING FREQ knob (0 = off); `w` the weather (storm or rain). */
  function strikeAt(seed, k, rate, w) {
    const p = Math.min(0.95, (is(w) ? P_STORM : w === "rain" ? P_RAIN : 0) * (rate > 0 ? rate : 0));
    if (!(p > 0) || h01(seed, k, 1) >= p) return null;
    const delay = THUNDER_MIN + h01(seed, k, 3) * (THUNDER_MAX - THUNDER_MIN);
    return { t: (k + 0.05 + 0.9 * h01(seed, k, 2)) * SLOT, delay, near: 1 - (delay - THUNDER_MIN) / (THUNDER_MAX - THUNDER_MIN) };
  }

  /** The first strike with t in (t0, t1], or null. A window that runs
   *  backwards (a new race zeroes the clock) or jumps more than 1 s (a clock
   *  switch, a tab back) is a resync, never a burst of stored strikes. */
  function strikeIn(seed, t0, t1, rate, w) {
    if (!(t1 > t0) || t1 - t0 > 1) return null;
    for (let k = Math.floor(t0 / SLOT); k <= Math.floor(t1 / SLOT); k++) {
      const s = strikeAt(seed, k, rate, w);
      if (s && s.t > t0 && s.t <= t1) return s;
    }
    return null;
  }

  /** Every strike in [t0, t1) — the schedule as a list, for tests and tools. */
  function schedule(seed, t0, t1, rate, w) {
    const out = [];
    for (let k = Math.floor(t0 / SLOT); k * SLOT < t1; k++) {
      const s = strikeAt(seed, k, rate, w);
      if (s && s.t >= t0 && s.t < t1) out.push(s);
    }
    return out;
  }

  /** May the sky FLASH? Never under REDUCED MOTION (the OS flag or SETTINGS ›
   *  MOTION, game.js motionReduced()) — a full-frame strobe is the photosensitive
   *  trigger that setting exists for. Thunder still rolls: it is sound. */
  const flashOk = (reduced) => !reduced;

  return Object.freeze({
    SLOT, P_STORM, P_RAIN, THUNDER_MIN, THUNDER_MAX, SC_START_S, SC_ROLL_S, RAIN_K,
    is, asRain, rainK, sprayK, strikeAt, strikeIn, schedule, flashOk, h01,
  });
})();
