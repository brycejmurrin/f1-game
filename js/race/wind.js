/* Apex 26 — WIND: a per-race wind (direction, mean speed, gusts) and what it
 * does to a car. Pure tables and functions plus one cached "current" state;
 * no G. game.js syncs it once per car step (cached per race clock) and reads
 * carInto() for the two effects below; js/race/engineer.js may mention a
 * strong gust; UI/radio read state().
 *
 * WHAT IT IS. A function of (sim seed, circuit, weather, race clock): the
 * same seed and clock give the same wind, so a replay, a re-run and every
 * friend-race peer on the shared race clock agree (the Storm lightning idiom,
 * js/race/storm.js). The mean direction wanders a few tens of degrees over
 * minutes and the mean speed breathes ±20 % over several; GUSTS are discrete
 * events hashed per GUST_SLOT window, a smooth sin² swell of a few seconds.
 * Calm in fog (fog needs still air), gustier in rain, gustiest in a storm, and
 * a per-circuit exposure scale: Bahrain's desert gusts reach ~50 km/h and
 * Silverstone's open airfield can put a car sideways
 * (https://www.formula1.com/en/latest/article/you-have-to-be-on-your-toes-ricciardo-on-the-key-factor-that-makes.13nBgmXtJ0SsldMcitFMcB);
 * street circuits between buildings are sheltered. Notes and sources:
 * docs/notes/WEATHER-ROADMAP-2026-10-14.md.
 *
 * WHAT IT DOES, off the car's ACTUAL heading — the player's c.head, an AI's
 * drawn heading — never the racing line or the road's curvature (AGENTS.md
 * §Physics, "the arc must not reach the driver"):
 *   1. HEAD/TAIL WIND on drag. Top speed is where power meets drag ∝ (v+w)²,
 *      which in a real car moves v_top by ~⅔ of the headwind (Monza's
 *      north–south main straight: a headwind into Della Roggia helps braking
 *      and costs top speed — https://racingnews365.com/2026-f1-italian-grand-prix-monza-weather-forecast).
 *      Kept MODEST for play: HEAD_K of the along-wind, so a 30 km/h headwind
 *      costs ~4–5 km/h of top speed and a tailwind gives it back.
 *   2. A CROSSWIND side force ∝ car speed × cross-wind (linearised ½ρ·CyA·v·w
 *      over the car's mass), capped at LAT_CAP — a nudge the tyres and a small
 *      correction answer, never a spin. The player's lateral velocity takes it
 *      as a force; an AI car (kinematic lateral step) takes it as a brief drift.
 *
 * OFF IS A TRUE NO-OP: level "off" (the test fixtures' pin, like TYRE WEAR's)
 * makes carInto() return vmaxMul exactly 1 and latA exactly 0, so the
 * characterization baseline stays bit-identical. Speeds are STANDARD-scale m/s
 * (real air against a vStd car speed); game.js converts with vTop()/VMAX.
 */
const Wind = (function () {
  "use strict";

  const LEVELS = { off: 0, real: 1 };
  const isLevel = (v) => Object.prototype.hasOwnProperty.call(LEVELS, v);
  let level = "real";

  // Mean wind at car height (m/s) per weather: [calmest, windiest] draw.
  const MEAN = { dry: [1.5, 5.5], overcast: [2.5, 6.5], fog: [0.2, 1.2], wet: [3, 7], rain: [4, 8.5], storm: [7, 12] };
  // Gusts: chance a GUST_SLOT window holds one, and peak gust over the mean as a fraction of it.
  const GUST_P = { dry: 0.25, overcast: 0.3, fog: 0.05, wet: 0.4, rain: 0.5, storm: 0.75 };
  const GUST_K = { dry: 0.8, overcast: 0.8, fog: 0.4, wet: 0.9, rain: 1.0, storm: 1.1 };
  // Exposure by circuit (1 = typical). Open, flat, coastal or desert sites up; walled streets down.
  const SITE = {
    silverstone: 1.35, bahrain: 1.35, zandvoort: 1.3, qatar: 1.25, jeddah: 1.15, albert_park: 1.1,
    estoril: 1.15, portimao: 1.15, interlagos: 1.05, monza: 0.95,
    monaco: 0.7, singapore: 0.7, baku: 0.8, vegas: 0.85, hungaroring: 0.85, madrid: 0.85,
  };
  const GUST_SLOT = 10;        // s per gust window
  const GUST_MIN = 3, GUST_MAX = 7;   // s a gust swells and dies over
  const WANDER = 0.35;         // rad: slow swing of the mean direction
  const WEATHER_TAU = 45;      // s: the mean eases to a new weather's, not a step
  const MAX_SPEED = 22;        // m/s (~80 km/h) total cap

  // The car effects (see header).
  const HEAD_K = 0.15;         // top-speed shift per m/s of along-wind, as a fraction of the real ~2/3
  const HEAD_CAP = 20;         // m/s along-wind considered
  const SIDE_K = 0.5 * 1.2 * 1.6 / 800;   // ½ρ·CyA / m (1/m): a = SIDE_K · v_car · w_cross
  const LAT_CAP = 1.0;         // m/s² std: ~4.5 % of LAT_MAX, a nudge not a shove
  const AI_TAU = 0.3;          // s: an AI car's kinematic step takes the side force as latA·AI_TAU of drift
  const VREF = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.VMAX) || 72;   // std top-speed envelope

  // 32-bit integer hash → [0, 1); its own, so the wind draws nothing from the sim stream.
  function h01(seed, k, salt) {
    let x = (Math.imul((seed >>> 0) ^ 0x7f4a7c15, 0x9e3779b1) ^ Math.imul(k | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  function strId(s) {
    let h = 2166136261;
    s = String(s || "");
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const wx = (w) => (MEAN[w] ? w : "dry");
  const siteK = (id) => (SITE[id] != null ? SITE[id] : 1);

  /** The race's wind plan: everything that does not move with the clock. */
  function plan(seed, weather, trackId) {
    const s = ((seed >>> 0) ^ strId(trackId)) >>> 0;
    const w = wx(weather);
    return {
      seed: s, weather: w, site: siteK(trackId),
      dir0: h01(s, 0, 11) * Math.PI * 2,                // where the wind blows TOWARD (world heading, rad)
      draw: h01(s, 0, 12),                              // where in MEAN[w] this race sits
      ph1: h01(s, 0, 13) * Math.PI * 2, ph2: h01(s, 0, 14) * Math.PI * 2, ph3: h01(s, 0, 15) * Math.PI * 2,
    };
  }
  function meanOf(p, w) {
    const m = MEAN[wx(w)];
    return (m[0] + (m[1] - m[0]) * p.draw) * p.site;
  }
  /** The gust envelope at t (0..1) and its peak (m/s) for weather w: one per GUST_SLOT window at most. */
  function gustAt(p, w, t, mean) {
    const k = Math.floor(t / GUST_SLOT);
    let best = 0, peak = 0, off = 0;
    for (let j = k - 1; j <= k; j++) {   // a gust may spill over from the window before
      if (h01(p.seed, j, 21) >= GUST_P[wx(w)]) continue;
      const dur = GUST_MIN + (GUST_MAX - GUST_MIN) * h01(p.seed, j, 22);
      const t0 = j * GUST_SLOT + (GUST_SLOT - 1) * h01(p.seed, j, 23);
      const f = (t - t0) / dur;
      if (f <= 0 || f >= 1) continue;
      const e = Math.sin(Math.PI * f) ** 2;
      const pk = mean * GUST_K[wx(w)] * (0.4 + 0.6 * h01(p.seed, j, 24));
      if (e * pk > best * peak || peak === 0) { best = e; peak = pk; off = (h01(p.seed, j, 25) - 0.5) * 0.6; }
    }
    return { env: best, peak, off };
  }
  /** The wind at race time t under `mean` (m/s): { dir, ms, gust, gustMs, mean }. Pure. `ms` is the AIR's
   *  speed (m/s), named apart from a car's `.speed` (tools/check/vstd-lint.mjs). */
  function at(p, t, mean, w) {
    t = Number.isFinite(t) ? t : 0;
    const m = mean * (1 + 0.2 * Math.sin(2 * Math.PI * t / 420 + p.ph3));
    const dir = p.dir0 + WANDER * Math.sin(2 * Math.PI * t / 600 + p.ph1) + 0.4 * WANDER * Math.sin(2 * Math.PI * t / 170 + p.ph2);
    const g = gustAt(p, w == null ? p.weather : w, t, m);
    const gMs = g.env * g.peak;
    // The gust adds along its own slightly-off direction; the vector sum is the wind.
    const ax = m * Math.sin(dir) + gMs * Math.sin(dir + g.off), az = m * Math.cos(dir) + gMs * Math.cos(dir + g.off);
    let ms = Math.hypot(ax, az);
    const k = ms > MAX_SPEED ? MAX_SPEED / ms : 1;
    ms *= k;
    return { dir: ms > 0 ? Math.atan2(ax, az) : dir, ms, wx: ax * k, wz: az * k, gust: g.env, gustMs: gMs * k, mean: m };
  }

  // ── The current race's wind (cached per clock tick) ───────────────────────
  let _p = null, _key = "", _t = -1, _mean = 0, _tMean = 0;
  let _st = null, _pin = null;
  const CALM = Object.freeze({ on: false, dir: 0, ms: 0, wx: 0, wz: 0, gust: 0, gustMs: 0, mean: 0, kmh: 0, fromDeg: 0 });
  /** Advance the current wind to race time t; returns state(). Cheap when t has not moved. */
  function sync(seed, weather, trackId, t) {
    if (LEVELS[level] === 0) { _st = CALM; return CALM; }
    if (_pin) { _t = t; _st = _pin; return _pin; }
    const key = (seed >>> 0) + "|" + trackId;
    const w = wx(weather);
    if (key !== _key || !_p || !(t >= _t)) {          // a new race (or the clock ran back): start settled
      _key = key; _p = plan(seed, w, trackId); _mean = meanOf(_p, w); _tMean = t; _t = NaN;
    }
    if (t === _t && _st) return _st;
    const target = meanOf(_p, w);
    const dt = Math.max(0, t - _tMean);
    _mean += (target - _mean) * (1 - Math.exp(-dt / WEATHER_TAU));
    _tMean = t; _t = t;
    const a = at(_p, t, _mean, w);
    a.on = true;
    a.kmh = Math.round(a.ms * 3.6);
    // Meteorological convention for UI/radio: the compass bearing it blows FROM (0 = from +z).
    a.fromDeg = Math.round((((a.dir + Math.PI) * 180 / Math.PI) % 360 + 360) % 360);
    _st = a;
    return a;
  }
  /** The last synced wind (CALM before a race or with the level off). */
  function state() { return _st || CALM; }

  /** Top-speed multiplier for an along-wind `headMs` (+ = headwind). Exactly 1 at 0. */
  function vmaxMul(headMs) {
    const h = Math.max(-HEAD_CAP, Math.min(HEAD_CAP, headMs || 0));
    return h === 0 ? 1 : 1 - HEAD_K * h / VREF;
  }
  /** Side acceleration (m/s², std, + = toward the car's right) from a cross-wind at car speed `vStd`. */
  function latAccel(vStd, crossMs) {
    const a = SIDE_K * Math.abs(vStd || 0) * (crossMs || 0);
    return a === 0 ? 0 : Math.max(-LAT_CAP, Math.min(LAT_CAP, a));
  }

  // One car's effects, pooled (every car, every step). `head` is the car's WORLD heading
  // (forward = (sin h, cos h), right = (−cos h, sin h): js/track/tracks.js r = t × up).
  const _car = { head: 0, cross: 0, vmaxMul: 1, latA: 0 };
  function carInto(st, heading, vStd) {
    if (!st || !st.on || !(st.ms > 0)) { _car.head = 0; _car.cross = 0; _car.vmaxMul = 1; _car.latA = 0; return _car; }
    const fx = Math.sin(heading), fz = Math.cos(heading);
    _car.head = -(st.wx * fx + st.wz * fz);
    _car.cross = st.wx * -fz + st.wz * fx;
    _car.vmaxMul = vmaxMul(_car.head);
    _car.latA = latAccel(vStd, _car.cross);
    return _car;
  }
  /** The side acceleration carInto() last computed (std m/s²) — game.js's bicycle step reads it. */
  function latA() { return _car.latA; }

  /** For the engineer: a strong gust right now → a bucket id (one call per ~90 s), else null. */
  const GUST_CALL_MS = 11;     // ~40 km/h total with a real gust in it
  function gustCall() {
    const s = state();
    return s.on && s.ms >= GUST_CALL_MS && s.gust > 0.5 ? Math.floor((_t || 0) / 90) : null;
  }

  /** A fixed wind for tools and tests: { speed (m/s), dir (rad, the heading it blows TOWARD) }; null releases it.
   *  No gusts, no wander; the level still gates it ("off" stays calm). */
  function pin(o) {
    if (!o) { _pin = null; _st = null; return null; }
    const sp = Math.max(0, Math.min(MAX_SPEED, +o.speed || 0)), dir = +o.dir || 0;
    _pin = Object.freeze({ on: true, dir, ms: sp, wx: sp * Math.sin(dir), wz: sp * Math.cos(dir), gust: 0, gustMs: 0, mean: sp,
      kmh: Math.round(sp * 3.6), fromDeg: Math.round((((dir + Math.PI) * 180 / Math.PI) % 360 + 360) % 360), pinned: true });
    _st = null;
    return _pin;
  }

  function setLevel(v) { if (isLevel(v)) { level = v; _st = null; _key = ""; } return level; }

  return Object.freeze({
    LEVELS, MEAN, GUST_P, GUST_K, SITE, GUST_SLOT, MAX_SPEED, HEAD_K, SIDE_K, LAT_CAP, AI_TAU, GUST_CALL_MS,
    isLevel, setLevel, level: () => level,
    plan, meanOf, at, sync, state, vmaxMul, latAccel, carInto, latA, gustCall, pin, h01,
  });
})();
