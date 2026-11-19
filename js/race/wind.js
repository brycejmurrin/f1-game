const Wind = (function () {
  "use strict";

  const LEVELS = { off: 0, real: 1 };
  const isLevel = (v) => Object.prototype.hasOwnProperty.call(LEVELS, v);
  let level = "real";

  const MEAN = { dry: [1.5, 5.5], overcast: [2.5, 6.5], fog: [0.2, 1.2], wet: [3, 7], rain: [4, 8.5], storm: [7, 12] };
  const GUST_P = { dry: 0.25, overcast: 0.3, fog: 0.05, wet: 0.4, rain: 0.5, storm: 0.75 };
  const GUST_K = { dry: 0.8, overcast: 0.8, fog: 0.4, wet: 0.9, rain: 1.0, storm: 1.1 };
  const SITE = {
    silverstone: 1.35, bahrain: 1.35, zandvoort: 1.3, qatar: 1.25, jeddah: 1.15, albert_park: 1.1,
    estoril: 1.15, portimao: 1.15, interlagos: 1.05, monza: 0.95,
    monaco: 0.7, singapore: 0.7, baku: 0.8, vegas: 0.85, hungaroring: 0.85, madrid: 0.85,
  };
  const GUST_SLOT = 10;
  const GUST_MIN = 3, GUST_MAX = 7;
  const WANDER = 0.35;
  const WEATHER_TAU = 45;
  const MAX_SPEED = 22;

  const HEAD_K = 0.15;
  const HEAD_CAP = 20;
  const SIDE_K = 0.5 * 1.2 * 1.6 / 800;
  const LAT_CAP = 1.0;
  const AI_TAU = 0.3;
  const VREF = (typeof PhysicsConsts !== "undefined" && PhysicsConsts.VMAX) || 72;

  function h01(seed, k, salt) {
    const x = (Math.imul((seed >>> 0) ^ 0x7f4a7c15, 0x9e3779b1) ^ Math.imul(k | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
    return Hash32.mix(x) / 4294967296;
  }
  function strId(s) {
    let h = 2166136261;
    s = String(s || "");
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const wx = (w) => (MEAN[w] ? w : "dry");
  const siteK = (id) => (SITE[id] != null ? SITE[id] : 1);

  function plan(seed, weather, trackId) {
    const s = ((seed >>> 0) ^ strId(trackId)) >>> 0;
    const w = wx(weather);
    return {
      seed: s, weather: w, site: siteK(trackId),
      dir0: h01(s, 0, 11) * Math.PI * 2,
      draw: h01(s, 0, 12),
      ph1: h01(s, 0, 13) * Math.PI * 2, ph2: h01(s, 0, 14) * Math.PI * 2, ph3: h01(s, 0, 15) * Math.PI * 2,
    };
  }
  function meanOf(p, w) {
    const m = MEAN[wx(w)];
    return (m[0] + (m[1] - m[0]) * p.draw) * p.site;
  }
  function gustAt(p, w, t, mean) {
    const k = Math.floor(t / GUST_SLOT);
    let best = 0, peak = 0, off = 0;
    for (let j = k - 1; j <= k; j++) {
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
  function at(p, t, mean, w) {
    t = Number.isFinite(t) ? t : 0;
    const m = mean * (1 + 0.2 * Math.sin(2 * Math.PI * t / 420 + p.ph3));
    const dir = p.dir0 + WANDER * Math.sin(2 * Math.PI * t / 600 + p.ph1) + 0.4 * WANDER * Math.sin(2 * Math.PI * t / 170 + p.ph2);
    const g = gustAt(p, w == null ? p.weather : w, t, m);
    const gMs = g.env * g.peak;
    const ax = m * Math.sin(dir) + gMs * Math.sin(dir + g.off), az = m * Math.cos(dir) + gMs * Math.cos(dir + g.off);
    let ms = Math.hypot(ax, az);
    const k = ms > MAX_SPEED ? MAX_SPEED / ms : 1;
    ms *= k;
    return { dir: ms > 0 ? Math.atan2(ax, az) : dir, ms, wx: ax * k, wz: az * k, gust: g.env, gustMs: gMs * k, mean: m };
  }

  let _p = null, _seedK = NaN, _trackK, _t = -1, _mean = 0, _tMean = 0;
  let _st = null, _pin = null;
  const CALM = Object.freeze({ on: false, dir: 0, ms: 0, wx: 0, wz: 0, gust: 0, gustMs: 0, mean: 0, kmh: 0, fromDeg: 0 });
  function sync(seed, weather, trackId, t) {
    if (LEVELS[level] === 0) { _st = CALM; return CALM; }
    if (_pin) { _t = t; _st = _pin; return _pin; }
    const sk = seed >>> 0;
    const w = wx(weather);
    if (sk !== _seedK || trackId !== _trackK || !_p || !(t >= _t)) {
      _seedK = sk; _trackK = trackId; _p = plan(seed, w, trackId); _mean = meanOf(_p, w); _tMean = t; _t = NaN;
    }
    if (t === _t && _st) return _st;
    const target = meanOf(_p, w);
    const dt = Math.max(0, t - _tMean);
    _mean += (target - _mean) * (1 - Math.exp(-dt / WEATHER_TAU));
    _tMean = t; _t = t;
    const a = at(_p, t, _mean, w);
    a.on = true;
    a.kmh = Math.round(a.ms * 3.6);
    a.fromDeg = Math.round((((a.dir + Math.PI) * 180 / Math.PI) % 360 + 360) % 360);
    _st = a;
    return a;
  }
  function state() { return _st || CALM; }

  function vmaxMul(headMs) {
    const h = Math.max(-HEAD_CAP, Math.min(HEAD_CAP, headMs || 0));
    return h === 0 ? 1 : 1 - HEAD_K * h / VREF;
  }
  function latAccel(vStd, crossMs) {
    const a = SIDE_K * Math.abs(vStd || 0) * (crossMs || 0);
    return a === 0 ? 0 : Math.max(-LAT_CAP, Math.min(LAT_CAP, a));
  }

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
  function latA() { return _car.latA; }

  const GUST_CALL_MS = 11;
  function gustCall() {
    const s = state();
    return s.on && s.ms >= GUST_CALL_MS && s.gust > 0.5 ? Math.floor((_t || 0) / 90) : null;
  }

  function pin(o) {
    if (!o) { _pin = null; _st = null; return null; }
    const sp = Math.max(0, Math.min(MAX_SPEED, +o.speed || 0)), dir = +o.dir || 0;
    _pin = Object.freeze({ on: true, dir, ms: sp, wx: sp * Math.sin(dir), wz: sp * Math.cos(dir), gust: 0, gustMs: 0, mean: sp,
      kmh: Math.round(sp * 3.6), fromDeg: Math.round((((dir + Math.PI) * 180 / Math.PI) % 360 + 360) % 360), pinned: true });
    _st = null;
    return _pin;
  }

  function setLevel(v) { if (isLevel(v)) { level = v; _st = null; _seedK = NaN; } return level; }

  return Object.freeze({
    LEVELS, MEAN, GUST_P, GUST_K, SITE, GUST_SLOT, MAX_SPEED, HEAD_K, SIDE_K, LAT_CAP, AI_TAU, GUST_CALL_MS,
    isLevel, setLevel, level: () => level,
    plan, meanOf, at, sync, state, vmaxMul, latAccel, carInto, latA, gustCall, pin, h01,
  });
})();
