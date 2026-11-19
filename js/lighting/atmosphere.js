const Atmosphere = (function () {
  "use strict";

function create(G) {
Log.info("game", "Atmosphere.create");
const { clamp, satAdjust, isFloodActiveSession,
        _nightAmbientBand, applyLightTune } = G;
const wxWet = () => G.raceWeather === "wet" || G.raceWeather === "rain" || G.raceWeather === "storm";
const wxRain = () => G.raceWeather === "rain" || G.raceWeather === "storm";
const wxStorm = () => G.raceWeather === "storm";
const { LT, buildTrackLights } = LightTune;
const TUNE_DEFS = LightTune.TUNE_DEFS || [];

const CLEAR_FOG_SCALE = 0.45;
const FOG_WX_MIN_DENSITY = 0.006;
const FOG_WX_MAX_DENSITY = 0.0067;
const FOG_WX_DEF_BOOST = 1.5;

const WX_BLEND_S = 25;
const WX_FRAME = ["sunColor", "ambientSky", "ambientGround", "fogColor", "fogDensity", "exposure", "groundMist"];
const WX_SKY = ["sunColor", "cloud", "zenith", "horizon", "cityGlow", "moon"];
let _wx = null;
let _hold = false;
const _pick = (o, keys) => { const r = {}; for (const k of keys) { const v = o[k]; r[k] = Array.isArray(v) ? v.slice() : v; } return r; };
const _snapLt = () => { const r = {}; for (const d of TUNE_DEFS) if (typeof LT[d.id] === "number") r[d.id] = LT[d.id]; return r; };
function _snapWx() {
  const f = _pick(G.frame, WX_FRAME), b = G._ltFlash > 0 && G._ltBase;
  if (b) { f.ambientSky = b.ambientSky.slice(); f.ambientGround = b.ambientGround.slice(); f.exposure = b.exposure; }
  return { frame: f, sky: _pick(G.frameSky, WX_SKY), lt: _snapLt() };
}
const _vec = (out, n) => (out && out.length === n ? out : new Array(n));
const _mixv = (a, b, s, out) => {
  if (b == null) {
    if (a == null || s >= 1) return null;
    if (Array.isArray(a)) { const r = _vec(out, a.length); for (let i = 0; i < a.length; i++) r[i] = a[i] * (1 - s); return r; }
    return typeof a === "number" ? a * (1 - s) : a;
  }
  if (a == null) {
    if (s <= 0) return null;
    if (Array.isArray(b)) { const r = _vec(out, b.length); for (let i = 0; i < b.length; i++) r[i] = b[i] * s; return r; }
    return typeof b === "number" ? b * s : b;
  }
  if (Array.isArray(b)) {
    const r = _vec(out, b.length), arr = Array.isArray(a);
    const k = !arr && typeof a === "number" && isFinite(a) ? a : 0;
    for (let i = 0; i < b.length; i++) {
      const ai = arr ? a[i] : k;
      const a0 = typeof ai === "number" && isFinite(ai) ? ai : 0;
      r[i] = a0 + (b[i] - a0) * s;
    }
    return r;
  }
  return a + (b - a) * s;
};
function _wxOut(live, a, b) {
  if (!Array.isArray(live) || live === a || live === b) return undefined;
  const src = Array.isArray(b) ? b : a;
  if (!Array.isArray(src) || live.length !== src.length) return undefined;
  return live;
}
function _writeWx(s) {
  const { from, to } = _wx;
  for (const k of WX_FRAME) {
    const a = from.frame[k], b = to.frame[k];
    const v = _mixv(a, b, s, _wxOut(G.frame[k], a, b));
    if (v != null) G.frame[k] = v;
  }
  for (const k of WX_SKY) {
    const a = from.sky[k], b = to.sky[k];
    const v = _mixv(a, b, s, _wxOut(G.frameSky[k], a, b));
    if (v != null || k === "cityGlow") G.frameSky[k] = v;
  }
  G.frame.skyZenith = G.frameSky.zenith; G.frame.skyHorizon = G.frameSky.horizon;
  _writeLt(s);
  if (G._ltBase) G._ltBase = { ambientSky: G.frame.ambientSky.slice(), ambientGround: G.frame.ambientGround.slice(),
                               exposure: G.frame.exposure != null ? G.frame.exposure : 1.0 };
}
function _ltMoving(from, to) {
  const m = [];
  for (const d of TUNE_DEFS) {
    const a = from.lt[d.id], b = to.lt[d.id];
    if (a !== undefined && b !== undefined && a !== b) m.push({ d, a, b });
  }
  return { m, last: new Float64Array(m.length), wrote: new Uint8Array(m.length) };
}
function _writeLt(s) {
  const { m, last, wrote } = _wx.lt;
  for (let i = 0; i < m.length; i++) {
    const e = m[i];
    if (!e) continue;
    const d = e.d, id = d.id, a = e.a, b = e.b;
    if (wrote[i] && LT[id] !== last[i]) { m[i] = null; continue; }
    let v = s >= 1 ? b : s <= 0 ? a : a + (b - a) * s;
    if (d.step >= 1 && s > 0 && s < 1) v = Math.min(Math.max(a, b), Math.max(Math.min(a, b), d.min + Math.round((v - d.min) / d.step) * d.step));
    LT[id] = v; last[i] = v; wrote[i] = 1;
  }
}
function tick(dt) {
  if (!_wx) return;
  _wx.t += dt > 0 ? dt : 0;
  const f = Math.min(1, _wx.t / _wx.dur);
  _writeWx(f * f * (3 - 2 * f));
  if (f >= 1) _wx = null;
}
function wxBlend() { return _wx ? { t: _wx.t, dur: _wx.dur } : null; }

function applyRaceSettings(blendS) {
  if (blendS === true) blendS = WX_BLEND_S;
  const from = (blendS > 0 && G.frame && G.frame.sunColor && G.frameSky) ? _snapWx() : null;
  _hold = !!from;
  try { _applyRaceBody(); } finally { _hold = false; }
  if (from) { const to = _snapWx(); _wx = { from, to, t: 0, dur: blendS, lt: _ltMoving(from, to) }; } else _wx = null;
  if (_wx) _writeWx(0);
}

function _applyRaceBody() {
  Log.info("game", "Atmosphere.applyRaceSettings tod=" + G.raceTimeOfDay + " wx=" + G.raceWeather);
  if (typeof applyLightTune === "function") applyLightTune(true, _hold ? { holdRebuild: true } : undefined);
  if (typeof Particles !== "undefined" && Particles.rainIntensity && typeof Storm !== "undefined") Particles.rainIntensity(Storm.rainK(G.raceWeather));
  const isNightSession = G.raceTimeOfDay === "night" ||
    (G.raceTimeOfDay === "default" && G.track && G.track.def && G.track.def.night);
  if (isNightSession && G.track && G.track.def) {
    const _ct = G.track.def.theme === "street_night" || G.track.def.theme === "modern";
    G.frameSky.cityGlow = _ct ? [0.050, 0.038, 0.055] : [0.024, 0.018, 0.012];
    const _cgw = LT.cityGlowWarm || 0;
    if (_cgw) {
      const g = G.frameSky.cityGlow;
      G.frameSky.cityGlow = [
        Math.max(0, g[0] * (1 + 0.20 * _cgw)),
        Math.max(0, g[1] * (1 - 0.02 * Math.abs(_cgw))),
        Math.max(0, g[2] * (1 - 0.30 * _cgw)),
      ];
    }
  } else {
    G.frameSky.cityGlow = null;
  }
  const floodLit = isFloodActiveSession() || LT.floodDay > 0;
  if (floodLit && G.track && (!G.track._lights || !G.track._lights.length)) G.track._lights = buildTrackLights(G.track);
  const midRace = G.state === "race" || G.state === "count";
  if (floodLit && G.track && G.gfx && G.gfx.hasLampBake && LT.lampBake > 0 && !(LT.tailLightEmit > 0))
    LampBake.forTrack(G.track, G.track._lights, LT.lampNearClamp, undefined, !midRace, LampBake.budget(G.gfx));
  if (G.raceTimeOfDay !== "default") {
    const night = G.raceTimeOfDay === "night";
    G.frameSky.stars = night ? 1 : 0;
    if (night) {
      G.frameSky.zenith = [0.01, 0.02, 0.05];
      G.frameSky.horizon = [0.04, 0.03, 0.06];
      G.frame.sunColor = [0.12, 0.14, 0.22];
      const _npal = G.track && G.track.def && G.track.def.palette;
      G.frame.sunDir = V3.norm(_npal && _npal.sunDir ? _npal.sunDir.slice() : [0.42, 0.66, 0.36]);
      G.frameSky.sunDir = G.frame.sunDir;
      G.frameSky.sunColor = _npal && _npal.sun ? _npal.sun.slice() : [1.0, 0.95, 0.84];
      G.frame.ambientGround = [0.0012, 0.0015, 0.0045];
      G.frame.ambientSky = [0.0034, 0.0046, 0.0110];
      _nightAmbientBand();
      G.frame.fogColor = [0.015, 0.017, 0.035];
      G.frame.fogDensity = 0.004;
      G.frame.skyZenith  = G.frameSky.zenith;
      G.frame.skyHorizon = G.frameSky.horizon;
      G.frameSky.moon = 0.85;
      G._cloudBase = 0.22;
      G.frame.exposure = (G.track && G.track.def && G.track.def.theme === "street_night") ? 0.86 : 0.90;
    } else if (G.raceTimeOfDay === "dawn") {
      const _dwBias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const _dwClr = Math.max(0, -_dwBias);
      const _dwOvc = Math.max(0, _dwBias);
      G.frameSky.zenith  = [0.07 + _dwOvc * 0.09, 0.12 + _dwOvc * 0.09, 0.27 + _dwOvc * 0.04 - _dwClr * 0.03];
      G.frameSky.horizon = [0.88 - _dwOvc * 0.26 + _dwClr * 0.08, 0.50 - _dwOvc * 0.06, 0.40 + _dwOvc * 0.12 - _dwClr * 0.06];
      G.frameSky.sunColor = [1.0, 0.74 - _dwClr * 0.06 + _dwOvc * 0.10, 0.44 - _dwClr * 0.08 + _dwOvc * 0.16];
      const _dawnAz = G.track && G.track.def ? ((_dwBias * 0.28) - 0.14) : 0;
      G.frameSky.sunDir  = _sunDirAz([-0.62, 0.08, 0.28], -_dawnAz);
      G.frame.sunDir     = G.frameSky.sunDir;
      G.frame.sunColor   = [1.0 - _dwOvc * 0.10, 0.80 - _dwClr * 0.04 + _dwOvc * 0.06, 0.50 - _dwClr * 0.08 + _dwOvc * 0.16];
      G.frame.ambientGround = [0.20 - _dwOvc * 0.03, 0.13 + _dwOvc * 0.02, 0.10 + _dwOvc * 0.04];
      G.frame.ambientSky    = [0.22 + _dwOvc * 0.05, 0.26 + _dwOvc * 0.05, 0.40 + _dwOvc * 0.03];
      G.frame.fogColor      = [0.52 + _dwOvc * 0.06 - _dwClr * 0.02, 0.36 + _dwOvc * 0.10, 0.34 + _dwOvc * 0.14 - _dwClr * 0.04];
      G.frame.fogDensity    = 0.0028 + _dwOvc * 0.0018 - _dwClr * 0.0012;
      G.frame.skyZenith     = G.frameSky.zenith;
      G.frame.skyHorizon    = G.frameSky.horizon;
      G.frameSky.moon = 0.30;
      G._cloudBase = 0.56;
      G.frame.exposure = 1.08;
    } else if (G.raceTimeOfDay === "dusk") {
      const _dkBias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const _dkClr = Math.max(0, -_dkBias);
      const _dkOvc = Math.max(0, _dkBias);
      G.frameSky.zenith  = [0.08 + _dkOvc * 0.08, 0.10 + _dkOvc * 0.08, 0.28 + _dkOvc * 0.03];
      G.frameSky.horizon = [0.72 - _dkOvc * 0.20 + _dkClr * 0.10, 0.34 + _dkOvc * 0.02, 0.08 + _dkOvc * 0.14 - _dkClr * 0.02];
      G.frameSky.sunColor = [1.0, 0.55 + _dkOvc * 0.10 - _dkClr * 0.05, 0.18 + _dkOvc * 0.16 - _dkClr * 0.05];
      const _duskAz = G.track && G.track.def ? ((_dkBias * 0.28) - 0.14) : 0;
      G.frameSky.sunDir  = _sunDirAz([0.50, 0.10, 0.22], _duskAz);
      G.frame.sunDir     = G.frameSky.sunDir;
      G.frame.sunColor   = [1.0 - _dkOvc * 0.12, 0.62 + _dkOvc * 0.04 - _dkClr * 0.05, 0.22 + _dkOvc * 0.14 - _dkClr * 0.06];
      G.frame.ambientGround = [0.28 - _dkOvc * 0.05, 0.16 + _dkOvc * 0.01, 0.06 + _dkOvc * 0.05];
      G.frame.ambientSky    = [0.32 + _dkOvc * 0.03, 0.22 + _dkOvc * 0.04, 0.28 + _dkOvc * 0.04];
      G.frame.fogColor      = [0.58 - _dkOvc * 0.08, 0.28 + _dkOvc * 0.06, 0.10 + _dkOvc * 0.14];
      G.frame.fogDensity    = 0.0022 + _dkOvc * 0.0014 - _dkClr * 0.0008;
      G.frame.skyZenith     = G.frameSky.zenith;
      G.frame.skyHorizon    = G.frameSky.horizon;
      G.frameSky.moon = 0;
      G._cloudBase = 0.58;
      G.frame.exposure = 1.03;
    } else {
      const _bias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const clr = Math.max(0, -_bias);
      const ovc = Math.max(0, _bias);
      G.frameSky.zenith  = [0.09 - clr * 0.04 + ovc * 0.28, 0.26 - clr * 0.10 + ovc * 0.26, 0.95 - ovc * 0.24];
      G.frameSky.horizon = [0.54 + ovc * 0.22, 0.68 + ovc * 0.12, 0.90 - clr * 0.02];
      const _dayAz = (G.track && G.track.def && G.track.def.sunAzimBias != null)
        ? G.track.def.sunAzimBias : _bias * 0.6;
      G.frameSky.sunDir = _sunDirAz([0.46, 0.58, 0.42], _dayAz);
      G.frame.sunDir    = G.frameSky.sunDir;
      G.frame.sunColor   = [1.13 + clr * 0.04, 0.95 - ovc * 0.05, 0.72 - clr * 0.12 + ovc * 0.12];
      G.frameSky.sunColor = [1.0, 0.95, 0.84];
      G.frame.ambientGround = [0.24 + clr * 0.04, 0.19, 0.12];
      G.frame.ambientSky    = [0.26 + ovc * 0.12, 0.33 + ovc * 0.10, 0.50 + ovc * 0.06];
      G.frame.fogColor      = [0.66 + ovc * 0.08, 0.74 + ovc * 0.05, 0.88 - clr * 0.05];
      G.frame.fogDensity    = 0.0008 + ovc * 0.0012;
      G.frame.skyZenith     = G.frameSky.zenith;
      G.frame.skyHorizon    = G.frameSky.horizon;
      G.frameSky.moon = 0;
      G._cloudBase = 0.44 + ovc * 0.42;
      G.frame.exposure = 0.99 + clr * 0.05 - ovc * 0.08;
      const _dp = G.track && G.track.def && G.track.def.palette;
      if (_dp && _dp.horizon && _dp.zenith && (0.2126 * _dp.horizon[0] + 0.7152 * _dp.horizon[1] + 0.0722 * _dp.horizon[2]) >= 0.45) {
        const _bl = (base, tgt) => base.map((v, i) => v + (tgt[i] - v) * DAY_PAL_BLEND);
        G.frameSky.zenith = _bl(G.frameSky.zenith, _dp.zenith);
        G.frameSky.horizon = _bl(G.frameSky.horizon, _dp.horizon);
        if (_dp.fog && G.frame.fogColor) G.frame.fogColor = _bl(G.frame.fogColor, _dp.fog);
        G.frame.skyZenith = G.frameSky.zenith; G.frame.skyHorizon = G.frameSky.horizon;
      }
    }
  } else {
    if (G.track && G.track.def && G.track.def.palette) {
      const _bp = G.track.def.palette;
      if (_bp.sunDir)        { G.frame.sunDir = V3.norm(_bp.sunDir); G.frameSky.sunDir = G.frame.sunDir; }
      if (_bp.sunColor)      G.frame.sunColor = _bp.sunColor.slice();
      if (_bp.ambientSky)    G.frame.ambientSky = _bp.ambientSky.slice();
      if (_bp.ambientGround) G.frame.ambientGround = _bp.ambientGround.slice();
      if (_bp.sun)           G.frameSky.sunColor = _bp.sun.slice();
      if (_bp.zenith)        G.frameSky.zenith  = _bp.zenith.slice();
      if (_bp.horizon)       G.frameSky.horizon = _bp.horizon.slice();
      G.frameSky.cloud = _bp.cloud !== undefined ? _bp.cloud : (isNightSession ? 0.22 : 0.4);
      if (_bp.fog) G.frame.fogColor = _bp.fog.slice();
      G.frame.fogDensity = _bp.fogDensity != null ? _bp.fogDensity : (isNightSession ? 0.004 : 0.0012);
    }
    G.frame.skyZenith = G.frameSky.zenith; G.frame.skyHorizon = G.frameSky.horizon;
    G.frameSky.moon = isNightSession ? 0.85 : 0;
    G.frameSky.stars = isNightSession ? 1 : 0;
    if (isNightSession) G.frame.sunColor = [0.12, 0.14, 0.22];
    G._cloudBase = G.frameSky.cloud !== undefined ? G.frameSky.cloud
               : (isNightSession ? 0.22 : 0.44);

    if (isNightSession) _nightAmbientBand();

    if (G.track && G.track.def) {
      const _def  = G.track.def;
      const _pal  = _def.palette || {};
      const _bias = _trackAtmoBias(_def);

      const _cloudNudge = _bias > 0 ? _bias * 0.20 : _bias * 0.18;
      G._cloudBase = Math.max(0.10, Math.min(isNightSession ? 0.45 : 0.80,
                            G._cloudBase + _cloudNudge));

      if (_bias > 0.2 && _pal.fogDensity != null) {
        G.frame.fogDensity = Math.min(0.005, _pal.fogDensity * (1 + _bias * 0.30));
      }

      if (isNightSession) {
        G.frame.exposure = (_def.theme === "street_night") ? 0.86 : 0.90;
      } else if (_def.theme === "desert") {
        G.frame.exposure = 0.88;
      } else if (_bias > 0.3) {
        G.frame.exposure = 1.08;
      } else {
        G.frame.exposure = 1.0;
      }

      if (_pal.sunDir && !isNightSession) {
        const _sd = _pal.sunDir.slice();
        const _azOffset = _def.sunAzimBias != null ? _def.sunAzimBias * 0.2 : _bias * 0.12;
        const _sx = _sd[0], _sz = _sd[2];
        const _cos = Math.cos(_azOffset), _sin = Math.sin(_azOffset);
        _sd[0] = _sx * _cos - _sz * _sin;
        _sd[2] = _sx * _sin + _sz * _cos;
        const _sdn = V3.norm(_sd);
        G.frame.sunDir = _sdn;
        G.frameSky.sunDir = _sdn;
      }
    }
  }
  if (!isNightSession && typeof Assets !== "undefined" && G.track && G.track.def) {
    const _tod = G.raceTimeOfDay || "default";
    const _env = Assets.env(G.track.def.id, _tod);
    if (_env) {
      const _exact = _env !== Assets.env("*", _tod);
      const _pal = (_tod === "default" && !_exact && G.track.def.palette) || {};
      if (_env.ambientSky && !_pal.ambientSky)       G.frame.ambientSky = _env.ambientSky.slice();
      if (_env.ambientGround && !_pal.ambientGround) G.frame.ambientGround = _env.ambientGround.slice();
      if (_env.skyZenith && !_pal.zenith)   { G.frameSky.zenith  = _env.skyZenith.slice();  G.frame.skyZenith  = G.frameSky.zenith; }
      if (_env.skyHorizon && !_pal.horizon) { G.frameSky.horizon = _env.skyHorizon.slice(); G.frame.skyHorizon = G.frameSky.horizon; }
    }
  }
  if (!wxWet() && G.raceWeather !== "overcast" && G.raceWeather !== "fog") {
    G.frame.fogDensity = (G.frame.fogDensity || 0.0016) * CLEAR_FOG_SCALE;
  }
  const _wsm = LT.weatherSunMute != null ? LT.weatherSunMute : 1;
  const _mute = (f) => Math.max(0, 1 - (1 - f) * _wsm);
  if (wxWet()) {
    const _storm = wxRain();
    G._cloudBase = Math.min(0.96, G._cloudBase + (_storm ? 0.52 : 0.32));
    G.frameSky.cloud = G._cloudBase;
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(_storm ? 0.5 : 0.68));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(_storm ? 0.65 : 0.80));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    if (G.frame.fogColor) {
      const _ov = _smooth(0.5, 1.0, clamp(G.frameSky.cloud + (LT.cloudCover || 0), 0, 1)) * 0.60;
      const _gH = isNightSession && G.frameSky.zenith && G.frameSky.horizon
        ? G.frameSky.zenith.map((v, i) => (v + G.frameSky.horizon[i]) * 1.25)
        : [0.58, 0.58, 0.60].map((v) => v * _weatherDaylightScale());
      G.frame.fogColor = G.frame.fogColor.map((v, i) => v + (_gH[i] - v) * _ov);
    }
    G.frame.exposure = isNightSession
      ? Math.max(G.frame.exposure != null ? G.frame.exposure : 0.90, 0.95)
      : Math.max(G.frame.exposure != null ? G.frame.exposure : 1.0, _storm ? 1.03 : 1.00);
    if (wxStorm()) {
      G._cloudBase = Math.min(0.98, G._cloudBase + 0.10);
      G.frameSky.cloud = G._cloudBase;
      if (isNightSession) {
        G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(0.55));
        G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(0.6));
        G.frame.ambientSky = G.frame.ambientSky.map((v) => v * 0.82);
        G.frame.ambientGround = G.frame.ambientGround.map((v) => v * 0.80);
        if (G.frameSky.zenith) G.frame.skyZenith = G.frameSky.zenith = G.frameSky.zenith.map((v) => v * 0.7);
        if (G.frameSky.horizon) G.frame.skyHorizon = G.frameSky.horizon = G.frameSky.horizon.map((v) => v * 0.78);
        if (G.frame.fogColor) G.frame.fogColor = G.frame.fogColor.map((v) => v * 0.78);
        G.frame.fogDensity = (G.frame.fogDensity || 0.0016) * 2.2;
        G.frame.exposure *= 0.86;
      } else {
        _dayWetGreyDeck(G, 0.88);
        const _dk = (c) => c.map((v) => v * STORM_DECK_DARK);
        G.frameSky.zenith = _dk(G.frameSky.zenith); G.frameSky.horizon = _dk(G.frameSky.horizon);
        G.frame.skyZenith = G.frameSky.zenith; G.frame.skyHorizon = G.frameSky.horizon;
        if (G.frame.fogColor) G.frame.fogColor = _dk(G.frame.fogColor);
        G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(0.50));
        G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(0.60));
        G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * 0.80));
        G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * 0.80));
        G.frame.fogDensity = (G.frame.fogDensity || 0.0016) * 2.6;
        G.frame.exposure = Math.max(G.frame.exposure != null ? G.frame.exposure : 1.0, 1.0);
      }
    } else if (!isNightSession) {
      _dayWetGreyDeck(G, _storm ? 0.72 : 0.48);
    }
  } else if (G.raceWeather === "overcast") {
    G._cloudBase = Math.min(0.90, G._cloudBase + 0.50);
    G.frameSky.cloud = G._cloudBase;
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(0.7));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(0.8));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * 1.06));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * 1.06));
    G.frame.fogDensity = (G.frame.fogDensity || 0.0016) * (LT.overcastFogMul != null ? LT.overcastFogMul : 1.7);
    if (G.raceTimeOfDay === "default") {
      G.frameSky.horizon = isNightSession ? [0.05, 0.05, 0.07]
        : [0.74, 0.73, 0.74].map((v) => v * _weatherDaylightScale());
      G.frame.skyHorizon = G.frameSky.horizon;
    }
    const _ovcFloor = isNightSession ? 0.95 : 1.0;
    if (G.frame.exposure == null || G.frame.exposure < _ovcFloor) G.frame.exposure = _ovcFloor;
    if (!isNightSession && G.raceTimeOfDay !== "dusk" && G.raceTimeOfDay !== "dawn") {
      _dayWetGreyDeck(G, 0.85);
      if (G.frame.fogColor) G.frame.fogColor = G.frame.fogColor.map((v, i) => v + (G.frameSky.horizon[i] - v) * 0.85);
    }
  } else if (G.raceWeather === "fog") {
    G.frameSky.cloud = Math.min(0.85, G._cloudBase + 0.35);
    const _fogMul = LT.fogWxMul != null ? LT.fogWxMul : FOG_WX_DEF_BOOST;
    {
      const _sh = typeof LightStore !== "undefined" && LightStore.shipped ? LightStore.shipped("fogDensityMul") : undefined;
      const _dmv = typeof _sh === "number" ? _sh : LT.fogDensityMul;
      const _dm = _dmv > 0 ? _dmv : 1;
      const _k = _fogMul / FOG_WX_DEF_BOOST;
      const _eff = (G.frame.fogDensity || 0.0017) * _fogMul * _dm;
      G.frame.fogDensity = clamp(_eff, FOG_WX_MIN_DENSITY * _k, FOG_WX_MAX_DENSITY * _k) / _dm;
    }
    const _twl = G.raceTimeOfDay === "dusk" || G.raceTimeOfDay === "dawn";
    const _hz = G.frameSky.horizon;
    const fc = isNightSession ? [0.09, 0.10, 0.13]
      : _twl && _hz ? _twilightFog(_hz)
      : [0.74, 0.76, 0.78].map((v) => v * _weatherDaylightScale());
    G.frame.fogColor = fc;
    if (G.raceTimeOfDay === "default") { G.frameSky.horizon = fc.slice(); G.frame.skyHorizon = G.frameSky.horizon; }
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(0.6));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(0.7));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * 1.05));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * 1.05));
    const _fogFloor = isNightSession ? 0.95 : _twl ? 1.03 : 1.08;
    if (G.frame.exposure == null || G.frame.exposure < _fogFloor) G.frame.exposure = _fogFloor;
    if (!isNightSession && !_twl) {
      _dayWetGreyDeck(G, 0.85);
      G.frameSky.horizon = fc.slice(); G.frame.skyHorizon = G.frameSky.horizon;
    } else if (_twl && G.frameSky.zenith) {
      G.frameSky.zenith = G.frameSky.zenith.map((v, i) => v + (fc[i] - v) * 0.85);
      G.frameSky.horizon = fc.slice();
      G.frame.skyZenith = G.frameSky.zenith; G.frame.skyHorizon = G.frameSky.horizon;
    }
  } else {
    G.frameSky.cloud = G._cloudBase;
    if (G.frame.exposure == null) G.frame.exposure = 1.0;
  }
  {
    let gm = 0;
    if (G.raceTimeOfDay === "dawn") gm = 0.40;
    else if (G.raceTimeOfDay === "dusk") gm = 0.22;
    else if (isNightSession) gm = 0.16;
    if (wxWet()) gm = Math.max(gm, wxStorm() ? 0.30 : wxRain() ? 0.18 : 0.12);
    else if (G.raceWeather === "overcast") gm = Math.max(gm, 0.34);
    else if (G.raceWeather === "fog") gm = Math.max(gm, isNightSession ? 0.58 : 0.9);
    const _mb = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
    gm *= 1.0 + clamp(_mb, -0.6, 0.6) * 0.5;
    G.frame.groundMist = clamp(gm, 0, G.raceWeather === "fog" && !isNightSession ? 0.9 : 0.7);
  }
  {
    const st = LT.sunTemp || 0;
    if (st && G.frame.sunColor) {
      const sr = 1 + Math.max(0, -st) * 0.18 - Math.max(0, st) * 0.12;
      const sb = 1 - Math.max(0, -st) * 0.30 + Math.max(0, st) * 0.20;
      G.frame.sunColor = [G.frame.sunColor[0] * sr, G.frame.sunColor[1] * (1 - Math.abs(st) * 0.02), G.frame.sunColor[2] * sb];
    }
    if ((LT.sunElev || LT.sunAzim) && G.frame.sunDir) {
      const d = G.frame.sunDir;
      let el = Math.asin(clamp(d[1], -1, 1)) + (LT.sunElev || 0) * Math.PI / 180;
      let az = Math.atan2(d[0], d[2]) + (LT.sunAzim || 0) * Math.PI / 180;
      el = clamp(el, -1.54, 1.54);
      const ce = Math.cos(el);
      _sunDir[0] = ce * Math.sin(az); _sunDir[1] = Math.sin(el); _sunDir[2] = ce * Math.cos(az);
      G.frame.sunDir = _sunDir; G.frameSky.sunDir = _sunDir;
    }
    if (LT.cloudCover) G.frameSky.cloud = clamp((G.frameSky.cloud != null ? G.frameSky.cloud : 0) + LT.cloudCover, 0, 1);
    if (G.frameSky.moon) G.frameSky.moon *= LT.moonBright;
    if (G.frameSky.cityGlow && LT.cityGlowMul !== 1) G.frameSky.cityGlow = G.frameSky.cityGlow.map((v) => v * LT.cityGlowMul);
    const at = LT.ambTemp || 0, ab = LT.ambBalance || 0;
    if ((at || ab) && G.frame.ambientSky && G.frame.ambientGround) {
      const ar = 1 + Math.max(0, -at) * 0.16 - Math.max(0, at) * 0.10;
      const ag = 1 - Math.abs(at) * 0.02;
      const abb = 1 - Math.max(0, -at) * 0.24 + Math.max(0, at) * 0.16;
      const skyG = 1 + Math.max(0, ab) * 0.5, grdG = 1 + Math.max(0, -ab) * 0.5;
      G.frame.ambientSky = [G.frame.ambientSky[0] * ar * skyG, G.frame.ambientSky[1] * ag * skyG, G.frame.ambientSky[2] * abb * skyG];
      G.frame.ambientGround = [G.frame.ambientGround[0] * ar * grdG, G.frame.ambientGround[1] * ag * grdG, G.frame.ambientGround[2] * abb * grdG];
    }
    const _sat = LT.skyColorSat != null ? LT.skyColorSat : 1;
    if (_sat !== 1) {
      if (G.frameSky.zenith)  G.frameSky.zenith  = satAdjust(G.frameSky.zenith, _sat);
      if (G.frameSky.horizon) G.frameSky.horizon = satAdjust(G.frameSky.horizon, _sat);
      G.frame.skyZenith  = G.frameSky.zenith;
      G.frame.skyHorizon = G.frameSky.horizon;
    }
    const _fsat = LT.fogColorSat != null ? LT.fogColorSat : 1;
    if (_fsat !== 1 && G.frame.fogColor) G.frame.fogColor = satAdjust(G.frame.fogColor, _fsat);
  }
  G._ltBase = {
    ambientSky:    G.frame.ambientSky.slice(),
    ambientGround: G.frame.ambientGround.slice(),
    exposure:      G.frame.exposure != null ? G.frame.exposure : 1.0,
  };
  if (!(G._ltNextT > 0)) { G._ltFlash = 0; G._ltNextT = 0; }
  G._lastFloodEmit = floodEmit(G.frame && G.frame.sunDir ? G.frame.sunDir[1] : null);
}

function floodEmit(sunY) {
  const tod = G.raceTimeOfDay;
  const night = tod === "night" || (tod === "default" && !!(G.track && G.track.def && G.track.def.night));
  if (sunY == null) sunY = night ? -1 : 1;
  return Math.min(1, LT.floodEmitMul * (night ? 0.78
    : (tod === "dusk" || tod === "dawn") ? Math.min(0.70, 0.05 + 0.58 * Math.max(LT.twilightFloor ?? 0.30, clamp(1 - sunY * (LT.twilightRamp ?? 6), 0, 1)))
    : 0));
}

const DAY_PAL_BLEND = 0.5;
const STORM_DECK_DARK = 0.86;
function _weatherDaylightScale() {
  const d = G.frame.sunDir || G.frameSky.sunDir;
  const el = clamp(Math.asin(clamp(d ? d[1] : 1, -1, 1)) + (LT.sunElev || 0) * Math.PI / 180, -1.54, 1.54);
  const sunE = clamp(Math.sin(el) * 1.4, 0, 1);
  return 0.35 + 0.65 * _smooth(0.35, 0.60, sunE);
}
function _dayWetGreyDeck(G, mix) {
  if (!G.frameSky.zenith || !G.frameSky.horizon || mix <= 0) return;
  const w = clamp(mix, 0, 1);
  const light = _weatherDaylightScale();
  const deckZ = [0.58, 0.60, 0.64].map((v) => v * light);
  const deckH = [0.74, 0.73, 0.74].map((v) => v * light);
  G.frameSky.zenith = G.frameSky.zenith.map((v, i) => v + (deckZ[i] - v) * w);
  G.frameSky.horizon = G.frameSky.horizon.map((v, i) => v + (deckH[i] - v) * w);
  G.frame.skyZenith = G.frameSky.zenith;
  G.frame.skyHorizon = G.frameSky.horizon;
}

function _smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, ((x != null ? x : 0) - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function _twilightFog(h) {
  const y = 0.2126 * h[0] + 0.7152 * h[1] + 0.0722 * h[2];
  const g = [y, y * 1.02, y * 1.05];
  return g.map((v, i) => v + (h[i] - v) * 0.35);
}

const _sunDir = [0, 0, 0];
function _sunDirAz(base, xBias) {
  const az = Math.atan2(base[0] + xBias, base[2]);
  const h  = Math.hypot(base[0], base[2]);
  const x = h * Math.sin(az), y = base[1], z = h * Math.cos(az);
  const l = Math.hypot(x, y, z) || 1;
  _sunDir[0] = x / l; _sunDir[1] = y / l; _sunDir[2] = z / l;
  return _sunDir;
}

const _ATMO_BIAS = {
    spa:        0.85,
    silverstone: 0.70,
    zandvoort:  0.60,
    interlagos: 0.55,
    mexico:    -0.10,
    redbull:    0.10,
    monaco:    -0.25,
    imola:     -0.20,
    suzuka:     0.05,
    shanghai:   0.15,
    baku:      -0.10,
    jeddah:    -0.20,
    singapore:  0.10,
    vegas:     -0.30,
    miami:     -0.05,
    madrid:    -0.15,
    montreal:   0.20,
    albert_park: 0.05,
    bahrain:   -0.50,
    qatar:     -0.55,
    abudhabi:  -0.45,
    cota:       0.10,
    hungaroring: 0.15,
};
function _trackAtmoBias(def) {
  if (!def) return 0;
  if (_ATMO_BIAS[def.id] !== undefined) return _ATMO_BIAS[def.id];
  if (def.theme === "desert") return -0.45;
  if (def.theme === "street_night") return -0.10;
  return 0;
}
function prebakeLamps() {
  if (!G.track || !G.gfx || !G.gfx.hasLampBake) return null;
  if (typeof applyLightTune === "function") applyLightTune(true);
  if (!(isFloodActiveSession() || LT.floodDay > 0) || !(LT.lampBake > 0) || LT.tailLightEmit > 0) return null;
  if (!G.track._lights || !G.track._lights.length) G.track._lights = buildTrackLights(G.track);
  return LampBake.prebake(G.track, G.track._lights, LT.lampNearClamp, LampBake.budget(G.gfx));
}
return { applyRaceSettings, prebakeLamps, floodEmit, tick, wxBlend, WX_BLEND_S };
}

return { create };
})();
