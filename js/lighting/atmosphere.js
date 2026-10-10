/* Apex 26 — session atmosphere for js/game.js: applyRaceSettings(), the
   lighting/weather/time-of-day monolith (sun + sky + ambient + fog branches
   for night/dawn/dusk/day and the palette-driven "default" mode, then
   weather overlays and live LightTune knob overrides on top). Everything is
   re-derived from its base on every call — never accumulated — because this
   re-runs on every tuner drag tick (see APPLY_RACE_IDS in
   js/lighting/profiles.js); accumulating would compound per tick instead of
   settling. One function by design (a continuous branch, not steps to
   split). */
const Atmosphere = (function () {
  "use strict";

function create(G) {
Log.info("game", "Atmosphere.create");
// Stable helpers from the game.js closure. Wet/rain atmosphere branches stay on
// the discrete raceWeather enum so a mid-arc stage flip updates sky/fog with
// the chip; road look / FX / grip use G.isWetRoad (wetness) elsewhere.
const { clamp, satAdjust, isFloodActiveSession,
        _nightAmbientBand, applyLightTune } = G;
const wxWet = () => G.raceWeather === "wet" || G.raceWeather === "rain";
const wxRain = () => G.raceWeather === "rain";
const { LT, buildTrackLights } = LightTune;
const TUNE_DEFS = LightTune.TUNE_DEFS || [];

const CLEAR_FOG_SCALE = 0.45;

// ── Blended weather ──────────────────────────────────────────────────────────
// applyRaceSettings(blendS) cross-fades the session lighting from what the
// frame showed to what it computes, over blendS seconds, instead of cutting.
// The dynamic weather arc (js/race/weather-arc.js tick) asks for WX_BLEND_S so
// a front arrives as a darkening sky and a softening sun, the way the wetness
// ramp already brings the rain in; a chip, a slider or __apex.weather() passes
// nothing and keeps the instant switch (tests and the tuner read the frame
// right after). tick(dt), from js/game.js's update next to wxArc.tick, walks
// the fade and keeps the lightning's saved base (_ltBase) on the blended
// values so a strike restores to the look in flight, not the target.
// Until 2026-10-01 only wetness and the rain overlay ramped; cloud cover, sun
// strength, ambient and fog stepped (the second graphics-detail survey, item 11).
// Until 2026-10-07 cityGlow and moon stepped with the sky while LT knobs faded.
//
// THE KNOBS FADE TOO (2026-10-04). A stage flip changes the LightStore key
// (track|tod|WEATHER), and LightStore.apply() used to land every LT knob of the
// new preset in one frame: keyMul 0.115 -> 0.76, bloomMul x13, fogDensityMul x4
// mid-race, under a sky that was fading (review-wgx-lighting item 2). Now the
// blended re-apply snapshots LT on both sides and tick() walks every knob on the
// same smoothstep, rounded to the knob's grid where the grid is whole numbers
// (counts, toggles). Two exceptions keep a flip from costing a frame:
//  - the lamp REBUILD knobs and bake inputs are HELD (LightStore.apply
//    holdRebuild), so the flip never nulls track._lights or re-bakes the pools;
//  - sunElev/sunAzim are keyed by track x tod (profiles.js keyFor), so the sun
//    never moves with the weather and needs no slerp.
// A knob someone else writes mid-fade (a tuner slider, __apex.lightTune) leaves
// the fade at once rather than being dragged back each frame.
const WX_BLEND_S = 25;
const WX_FRAME = ["sunColor", "ambientSky", "ambientGround", "fogColor", "fogDensity", "exposure", "groundMist"];
const WX_SKY = ["sunColor", "cloud", "zenith", "horizon", "cityGlow", "moon"];
let _wx = null;   // { from, to, t, dur, last } while a fade is in flight
let _hold = false;   // true while a blended re-apply resolves LT (holds the lamp set)
const _pick = (o, keys) => { const r = {}; for (const k of keys) { const v = o[k]; r[k] = Array.isArray(v) ? v.slice() : v; } return r; };
const _snapLt = () => { const r = {}; for (const d of TUNE_DEFS) if (typeof LT[d.id] === "number") r[d.id] = LT[d.id]; return r; };
// A strike spikes frame.ambient*/exposure IN PLACE (game.js lightning block) on top of
// G._ltBase, so mid-strike the fade's SOURCE look is that base, not the spiked frame.
function _snapWx() {
  const f = _pick(G.frame, WX_FRAME), b = G._ltFlash > 0 && G._ltBase;
  if (b) { f.ambientSky = b.ambientSky.slice(); f.ambientGround = b.ambientGround.slice(); f.exposure = b.exposure; }
  return { frame: f, sky: _pick(G.frameSky, WX_SKY), lt: _snapLt() };
}
const _mixv = (a, b, s) => {
  if (b == null) return a; if (a == null) return b;
  if (Array.isArray(b)) return b.map((v, i) => a[i] + (v - a[i]) * s);
  return a + (b - a) * s;
};
function _writeWx(s) {
  const { from, to } = _wx;
  for (const k of WX_FRAME) { const v = _mixv(from.frame[k], to.frame[k], s); if (v != null) G.frame[k] = v; }
  for (const k of WX_SKY) { const v = _mixv(from.sky[k], to.sky[k], s); if (v != null) G.frameSky[k] = v; }
  G.frame.skyZenith = G.frameSky.zenith; G.frame.skyHorizon = G.frameSky.horizon;
  _writeLt(s);
  if (G._ltBase) G._ltBase = { ambientSky: G.frame.ambientSky.slice(), ambientGround: G.frame.ambientGround.slice(),
                               exposure: G.frame.exposure != null ? G.frame.exposure : 1.0 };
}
function _writeLt(s) {
  const { from, to, last } = _wx;
  for (const d of TUNE_DEFS) {
    const id = d.id, a = from.lt[id], b = to.lt[id];
    if (a === undefined || b === undefined || a === b) continue;
    if (id in last && LT[id] !== last[id]) { delete from.lt[id]; continue; }   // written by someone else: theirs now
    let v = s >= 1 ? b : s <= 0 ? a : a + (b - a) * s;
    if (d.step >= 1 && s > 0 && s < 1) v = Math.min(Math.max(a, b), Math.max(Math.min(a, b), d.min + Math.round((v - d.min) / d.step) * d.step));
    LT[id] = v; last[id] = v;
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
  _wx = from ? { from, to: _snapWx(), t: 0, dur: blendS, last: {} } : null;
  if (_wx) _writeWx(0);   // start the fade on the look the frame had
}

function _applyRaceBody() {
  Log.info("game", "Atmosphere.applyRaceSettings tod=" + G.raceTimeOfDay + " wx=" + G.raceWeather);
  if (typeof applyLightTune === "function") applyLightTune(true, _hold ? { holdRebuild: true } : undefined);
  const isNightSession = G.raceTimeOfDay === "night" ||
    (G.raceTimeOfDay === "default" && G.track && G.track.def && G.track.def.night);
  // City light-pollution SKYGLOW: at night the lit circuit domes the horizon —
  // strong + tinted over neon cities, a faint warm haze over flood-lit open
  // circuits. Cleared here so day/dusk skies never inherit it.
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
  // Pre-build the lamp set at race start so the first dark-session frame is
  // never unlit (the render path rebuilds it if empty as a fallback). Floodlights
  // are used on ANY track at night/dusk/dawn, so build whenever the scene is dark.
  // DAYTIME LAMPS (LT.floodDay > 0, resolved by applyLightTune above) light the
  // same set by day: the render loop gates on exactly (floodActive || floodDay).
  const floodLit = isFloodActiveSession() || LT.floodDay > 0;
  if (floodLit && G.track && (!G.track._lights || !G.track._lights.length)) G.track._lights = buildTrackLights(G.track);
  // ...and bake its ground pools now, not on the first lit frame (a hitch there).
  // Pre-race this bakes SYNC under the loading screen (a same-circuit restart with
  // new weather keeps the track but rebuilds _lights: the debounced path would
  // draw the OLD bake into the race). Mid-race (setWeatherLive swaps the preset
  // profile, whose rebuild knobs null _lights) it must never block: false keeps
  // the drawing bake while the new one is sliced over frames.
  const midRace = G.state === "race" || G.state === "count";
  if (floodLit && G.track && G.gfx && G.gfx.hasLampBake && LT.lampBake > 0 && !(LT.tailLightEmit > 0))
    LampBake.forTrack(G.track, G.track._lights, LT.lampNearClamp, undefined, !midRace, LampBake.budget(G.gfx));
  if (G.raceTimeOfDay !== "default") {
    const night = G.raceTimeOfDay === "night";
    G.frameSky.stars = night ? 1 : 0;
    if (night) {
      G.frameSky.zenith = [0.01, 0.02, 0.05];
      G.frameSky.horizon = [0.04, 0.03, 0.06];
      G.frame.sunColor = [0.12, 0.14, 0.22];   // faint cool moonlight key (unified w/ default-night)
      // MOON key-light direction: reset from the shipped palette (or a fixed
      // high default) EVERY call: inheriting the previous time-of-day's
      // direction makes the sunElev/sunAzim tuner offsets applied further down
      // COMPOUND on each re-run (applyRaceSettings fires on every slider tick)
      // instead of offsetting a stable baseline, so the moon runs away while dragging.
      const _npal = G.track && G.track.def && G.track.def.palette;
      G.frame.sunDir = V3.norm(_npal && _npal.sunDir ? _npal.sunDir.slice() : [0.42, 0.66, 0.36]);
      G.frameSky.sunDir = G.frame.sunDir;
      // Re-derive the SKY sun tint from a stable base EVERY call (like dawn/dusk/
      // day do). This branch never set it, so the wet/overcast/fog multipliers
      // below (frameSky.sunColor *= 0.8/0.7) compounded on their own previous
      // output — dragging any night slider in a wet/foggy night race decayed the
      // moon/cloud/horizon tint toward black. Same palette base loadTrack uses.
      G.frameSky.sunColor = _npal && _npal.sun ? _npal.sun.slice() : [1.0, 0.95, 0.84];
      G.frame.ambientGround = [0.0012, 0.0015, 0.0045];
      G.frame.ambientSky = [0.0034, 0.0046, 0.0110];
      _nightAmbientBand();
      G.frame.fogColor = [0.015, 0.017, 0.035];
      G.frame.fogDensity = 0.004;
      // When raceTimeOfDay !== "default", sync sky colours to frame too
      G.frame.skyZenith  = G.frameSky.zenith;
      G.frame.skyHorizon = G.frameSky.horizon;
      // Moon: high visibility at night to give soft blue fill light
      G.frameSky.moon = 0.85;
      // Night skies: few scattered clouds (don't block stars)
      G._cloudBase = 0.22;
      G.frame.exposure = (G.track && G.track.def && G.track.def.theme === "street_night") ? 0.86 : 0.90;
    } else if (G.raceTimeOfDay === "dawn") {
      const _dwBias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const _dwClr = Math.max(0, -_dwBias);   // 0 … 0.55 clearness
      const _dwOvc = Math.max(0, _dwBias);    // 0 … 0.85 overcast
      G.frameSky.zenith  = [0.07 + _dwOvc * 0.09, 0.12 + _dwOvc * 0.09, 0.27 + _dwOvc * 0.04 - _dwClr * 0.03];
      G.frameSky.horizon = [0.88 - _dwOvc * 0.26 + _dwClr * 0.08, 0.50 - _dwOvc * 0.06, 0.40 + _dwOvc * 0.12 - _dwClr * 0.06];
      G.frameSky.sunColor = [1.0, 0.74 - _dwClr * 0.06 + _dwOvc * 0.10, 0.44 - _dwClr * 0.08 + _dwOvc * 0.16];
      const _dawnAz = G.track && G.track.def ? ((_dwBias * 0.28) - 0.14) : 0;
      G.frameSky.sunDir  = _sunDirAz([-0.62, 0.08, 0.28], -_dawnAz);
      G.frame.sunDir     = G.frameSky.sunDir;
      G.frame.sunColor   = [1.0 - _dwOvc * 0.10, 0.80 - _dwClr * 0.04 + _dwOvc * 0.06, 0.50 - _dwClr * 0.08 + _dwOvc * 0.16];
      // Cool teal fill from the sky, soft warm rose bounce from the ground
      G.frame.ambientGround = [0.20 - _dwOvc * 0.03, 0.13 + _dwOvc * 0.02, 0.10 + _dwOvc * 0.04];
      G.frame.ambientSky    = [0.22 + _dwOvc * 0.05, 0.26 + _dwOvc * 0.05, 0.40 + _dwOvc * 0.03];
      G.frame.fogColor      = [0.52 + _dwOvc * 0.06 - _dwClr * 0.02, 0.36 + _dwOvc * 0.10, 0.34 + _dwOvc * 0.14 - _dwClr * 0.04];
      G.frame.fogDensity    = 0.0028 + _dwOvc * 0.0018 - _dwClr * 0.0012;
      G.frame.skyZenith     = G.frameSky.zenith;
      G.frame.skyHorizon    = G.frameSky.horizon;
      G.frameSky.moon = 0.30;   // fading moon still visible in the pre-dawn sky
      // Dawn: lingering cloud banks catch the first pink/gold light
      G._cloudBase = 0.56;
      G.frame.exposure = 1.08;
    } else if (G.raceTimeOfDay === "dusk") {
      const _dkBias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const _dkClr = Math.max(0, -_dkBias);   // 0 … 0.55 clearness
      const _dkOvc = Math.max(0, _dkBias);    // 0 … 0.85 overcast
      G.frameSky.zenith  = [0.08 + _dkOvc * 0.08, 0.10 + _dkOvc * 0.08, 0.28 + _dkOvc * 0.03];
      G.frameSky.horizon = [0.72 - _dkOvc * 0.20 + _dkClr * 0.10, 0.34 + _dkOvc * 0.02, 0.08 + _dkOvc * 0.14 - _dkClr * 0.02];
      G.frameSky.sunColor = [1.0, 0.55 + _dkOvc * 0.10 - _dkClr * 0.05, 0.18 + _dkOvc * 0.16 - _dkClr * 0.05];
      const _duskAz = G.track && G.track.def ? ((_dkBias * 0.28) - 0.14) : 0;
      G.frameSky.sunDir  = _sunDirAz([0.50, 0.10, 0.22], _duskAz);
      G.frame.sunDir     = G.frameSky.sunDir;
      G.frame.sunColor   = [1.0 - _dkOvc * 0.12, 0.62 + _dkOvc * 0.04 - _dkClr * 0.05, 0.22 + _dkOvc * 0.14 - _dkClr * 0.06];
      // Warm amber ground bounce, cool sky fill from the blue zenith overhead
      G.frame.ambientGround = [0.28 - _dkOvc * 0.05, 0.16 + _dkOvc * 0.01, 0.06 + _dkOvc * 0.05];
      G.frame.ambientSky    = [0.32 + _dkOvc * 0.03, 0.22 + _dkOvc * 0.04, 0.28 + _dkOvc * 0.04];
      G.frame.fogColor      = [0.58 - _dkOvc * 0.08, 0.28 + _dkOvc * 0.06, 0.10 + _dkOvc * 0.14];
      G.frame.fogDensity    = 0.0022 + _dkOvc * 0.0014 - _dkClr * 0.0008;
      G.frame.skyZenith     = G.frameSky.zenith;
      G.frame.skyHorizon    = G.frameSky.horizon;
      G.frameSky.moon = 0;
      // Dusk: plenty of cloud to catch the orange light and set the sky alight
      G._cloudBase = 0.58;
      G.frame.exposure = 1.03;
    } else {
      const _bias = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;
      const clr = Math.max(0, -_bias);    // 0 … 0.55 clearness
      const ovc = Math.max(0, _bias);     // 0 … 0.85 overcast
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
      G._cloudBase = 0.44 + ovc * 0.42;     // modest broken cloud (sky shader adds the cumulus richness); overcast → heavy deck
      G.frame.exposure = 0.99 + clr * 0.05 - ovc * 0.08;
    }
  } else {
    // "default" — the base sun/ambient come from the track palette (set ONCE at
    // load). Re-derive them from the palette HERE, every call, so the live tuner
    // offsets applied further down (sunElev/sunAzim/sunTemp/ambTemp/ambBalance/
    // cloudCover) never COMPOUND: applyRaceSettings fires on every slider input
    // event, and without this reset each event stacked its offset on the previous
    // result, so those knobs ran away in one direction regardless of drag
    // direction. The explicit-time branches above already rebuild their base.
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
    // "default" — driven by the track palette; set moon + stars for night tracks.
    // stars must be reset here symmetrically with moon: otherwise a live
    // explicit-night → default flip (any applyRaceSettings re-run without a
    // track reload) keeps stars in a day sky.
    G.frameSky.moon = isNightSession ? 0.85 : 0;
    G.frameSky.stars = isNightSession ? 1 : 0;
    if (isNightSession) G.frame.sunColor = [0.12, 0.14, 0.22];   // unified moonlight key (matches explicit-night)
    G._cloudBase = G.frameSky.cloud !== undefined ? G.frameSky.cloud
               : (isNightSession ? 0.22 : 0.44);   // modest cover; the sky shader carries the richer cumulus look

    if (isNightSession) _nightAmbientBand();

    if (G.track && G.track.def) {
      const _def  = G.track.def;
      const _pal  = _def.palette || {};   // built def carries `palette` (not `pal`);
      const _bias = _trackAtmoBias(_def);   // -1 (clear) … +1 (overcast)

      const _cloudNudge = _bias > 0 ? _bias * 0.20 : _bias * 0.18;
      G._cloudBase = Math.max(0.10, Math.min(isNightSession ? 0.45 : 0.80,
                            G._cloudBase + _cloudNudge));

      // Fog density: cloudy/misty circuits get a touch more atmospheric haze.
      if (_bias > 0.2 && _pal.fogDensity != null) {
        G.frame.fogDensity = Math.min(0.005, _pal.fogDensity * (1 + _bias * 0.30));
      }

      if (isNightSession) {
        // Low night exposure so the dark stays dark and the neon/floodlights punch.
        G.frame.exposure = (_def.theme === "street_night") ? 0.86 : 0.90;
      } else if (_def.theme === "desert") {
        // Daytime desert: very bright, slight exposure pull-back
        G.frame.exposure = 0.88;
      } else if (_bias > 0.3) {
        // Overcast / grey-sky circuits: lift exposure so the scene isn't muddy
        G.frame.exposure = 1.08;
      } else {
        G.frame.exposure = 1.0;
      }

      if (_pal.sunDir && !isNightSession) {
        const _sd = _pal.sunDir.slice();
        const _azOffset = _def.sunAzimBias != null ? _def.sunAzimBias * 0.2 : _bias * 0.12;
        // Rotate the horizontal (X,Z) components by _azOffset radians
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
  // Baked HDRI ambient (assets/pack). AFTER every TOD base (palette default OR
  // explicit day/dusk/dawn) and BEFORE weather post-modifiers — so overcast/
  // rain/fog still scale measured values the same way they scale palette ones.
  // Skipped for night: night ambient is intentionally near-black so lamps carve
  // the scene; an HDRI fill would re-wash it to "dim day".
  // Keys: "<track>|<tod>" then "*|<tod>". Absent → leave the TOD base untouched.
  // A WILDCARD hit is the pack's one generic (procedural) environment, so it
  // may only fill in what nobody authored: on the "default" time of day the
  // palette's own ambientSky/ambientGround/zenith/horizon win. Until 2026-10-01
  // the wildcard replaced them, and the shipped pack carries ONLY wildcard
  // keys — so forty circuits' authored ambient was dead and Bahrain, Spa and
  // Monaco shared one grey (the second graphics-detail survey). An exact
  // "<track>|<tod>" key is a measurement of THAT circuit and still overrides.
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
  // Wet / rain: overcast the sky and flatten the light (soft, diffuse, fewer
  // shadows) — clouds roll in and the sun is muted while ambient lifts. A full
  // storm ("rain") rolls in heavier cloud and mutes the sun more than a merely
  // damp track ("wet"), which sits between clear and storm.
  // WEATHER SUN MUTE knob: scale how deeply bad weather dims the direct sun.
  // Each branch below mutes the sun by a fixed factor f (<1); _mute reshapes that
  // as 1−(1−f)·knob so 0 = weather never mutes the sun, 1 = as-shipped, >1 = deeper
  // murk (floored at 0). No-op in clear/dry weather (branches skipped).
  // CLEAR-CONDITION HAZE PULL-BACK. Applied HERE, after every time-of-day branch
  // has set its base and before the weather branches add their own haze —
  // inside the "default mode only" per-track block it would never run for an
  // explicit time of day, a dead edit that measures as "no change".
  //
  // Why: the exp² falloff at the shipped densities erases the mid-distance.
  // MEASURED on Spa day/dry (no fogDensityMul preset, so this is the base), a
  // terrain band 300 m out renders (103,110,104) and the ground slab
  // (177,170,164) — both effectively neutral — against an unlit source colour of
  // (98,136,105). Everything past ~200 m converges on one tone, which is most of
  // what reads as a flat daytime scene. A straight A/B at 0.35x moved the frame
  // 16.9/255 and gave the distance its colour back.
  //
  // CLEAR WEATHER ONLY. Rain, wet, overcast and fog each set their own haze
  // below and are authored to be murky; they keep exactly what they were given.
  // The FOG DENSITY tuner still multiplies on top, so the full wash is one
  // slider away.
  if (!wxWet() && G.raceWeather !== "overcast" && G.raceWeather !== "fog") {
    G.frame.fogDensity = (G.frame.fogDensity || 0.0016) * CLEAR_FOG_SCALE;
  }
  const _wsm = LT.weatherSunMute != null ? LT.weatherSunMute : 1;
  const _mute = (f) => Math.max(0, 1 - (1 - f) * _wsm);
  if (wxWet()) {
    const _storm = wxRain();
    // Heavier cloud cover in the rain; cap at 0.96 to let the shader still vary
    G._cloudBase = Math.min(0.96, G._cloudBase + (_storm ? 0.52 : 0.32));
    G.frameSky.cloud = G._cloudBase;
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(_storm ? 0.5 : 0.68));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(_storm ? 0.65 : 0.80));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * (_storm ? 1.08 : 1.06)));
    // The distance fades to the SKY the sky shader paints, not the clear one.
    // Every lit backend greys its horizon under cloud (wgsl-chunks.js SKY:
    // horizonO = mix(horizon, greyH, smoothstep(0.5, 1, cloud) * 0.60), greyH a
    // daylight grey or, at night, the night lid); until 2026-10-04 this branch
    // left fogColor at the TOD's clear value, so wet/rain terrain faded to a
    // blue (or dusk-orange) haze that met a grey horizon in a seam. Same grey,
    // same weight, same cloud value the sky uploads.
    if (G.frame.fogColor) {
      const _ov = _smooth(0.5, 1.0, clamp(G.frameSky.cloud + (LT.cloudCover || 0), 0, 1)) * 0.60;   // + the CLOUD COVER offset applied below
      const _gH = isNightSession && G.frameSky.zenith && G.frameSky.horizon
        ? G.frameSky.zenith.map((v, i) => (v + G.frameSky.horizon[i]) * 1.25)
        : [0.58, 0.58, 0.60];
      G.frame.fogColor = G.frame.fogColor.map((v, i) => v + (_gH[i] - v) * _ov);
    }
    // Wet + overcast: lift exposure to keep the scene moody but readable — BUT a
    // wet NIGHT must stay dark (lifting it to 1.10 greys out the night and kills
    // the lamp-pool contrast), so dark sessions only get a whisker of lift.
    G.frame.exposure = isNightSession
      ? Math.max(G.frame.exposure != null ? G.frame.exposure : 0.90, 0.95)
      : Math.max(G.frame.exposure != null ? G.frame.exposure : 1.0, _storm ? 1.03 : 1.00);
  } else if (G.raceWeather === "overcast") {
    // Dry but heavy grey cloud: flat, soft, shadow-light. No rain, dry grip.
    G._cloudBase = Math.min(0.90, G._cloudBase + 0.50);
    G.frameSky.cloud = G._cloudBase;
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(0.7));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(0.8));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * 1.06));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * 1.06));
    G.frame.fogDensity = (G.frame.fogDensity || 0.0016) * (LT.overcastFogMul != null ? LT.overcastFogMul : 1.7);
    // Flatten the palette horizon to the grey deck — but a NIGHT overcast keeps
    // a night horizon (the fog branch's guard, below): the seven night-default
    // circuits run "default" too, and the 0.74 daylight grey under the sky's
    // night lid painted a ~0.85 grey band round a night race.
    if (G.raceTimeOfDay === "default") {
      G.frameSky.horizon = isNightSession ? [0.05, 0.05, 0.07] : [0.74, 0.73, 0.74];
      G.frame.skyHorizon = G.frameSky.horizon;
    }
    // A night session must stay dark under overcast too — same guard the wet/fog
    // branches use. Without it the 0.86/0.90 night exposure was forced up to 1.0,
    // greying out the night and killing lamp-pool contrast.
    const _ovcFloor = isNightSession ? 0.95 : 1.0;
    if (G.frame.exposure == null || G.frame.exposure < _ovcFloor) G.frame.exposure = _ovcFloor;
  } else if (G.raceWeather === "fog") {
    // Low-visibility mist: dense pale fog, muted sun, moderate cloud. No rain, dry grip.
    G.frameSky.cloud = Math.min(0.85, G._cloudBase + 0.35);
    G.frame.fogDensity = (G.frame.fogDensity || 0.0017) * (LT.fogWxMul != null ? LT.fogWxMul : 3.0);
    // A NIGHT fog must stay night — the same guard, for the same reason, as the
    // exposure floor below. This pale daylight grey is ~20x the night horizon
    // band ([0.04,0.03,0.06]) and fogWxMul has just TRIPLED the density on the
    // line above, so on a dark session it laid a bright grey sheet across the
    // whole distance and grey-washed exactly the night the exposure guard exists
    // to protect. The night value is a dim cool murk — lifted well clear of the
    // near-black clear-night base ([0.015,0.017,0.035]) so the fog still reads as
    // fog and catches the lamp glow, nowhere near daylight. Density is untouched:
    // a night fog is every bit as THICK, it just is not bright. The default-mode
    // horizon flatten below reads the same `fc`, so it follows automatically.
    //
    // Dusk and dawn are the same mistake in colour: the midday grey at x3
    // density laid a pale daylight wall against an orange or pink horizon. A
    // twilight fog is the horizon's own light, desaturated: its luminance with
    // the slight cool lift of the day grey, keeping 35 % of the horizon's hue.
    const _twl = G.raceTimeOfDay === "dusk" || G.raceTimeOfDay === "dawn";
    const _hz = G.frameSky.horizon;
    const fc = isNightSession ? [0.09, 0.10, 0.13]
      : _twl && _hz ? _twilightFog(_hz)
      : [0.74, 0.76, 0.78];
    G.frame.fogColor = fc;
    if (G.raceTimeOfDay === "default") { G.frameSky.horizon = fc.slice(); G.frame.skyHorizon = G.frameSky.horizon; }
    G.frame.sunColor = G.frame.sunColor.map((v) => v * _mute(0.6));
    G.frameSky.sunColor = G.frameSky.sunColor.map((v) => v * _mute(0.7));
    G.frame.ambientSky = G.frame.ambientSky.map((v) => Math.min(1, v * 1.05));
    G.frame.ambientGround = G.frame.ambientGround.map((v) => Math.min(1, v * 1.05));
    // Lift for visibility in the murk — but a NIGHT fog must stay night: forcing
    // 1.08 over the 0.86-0.90 night base (+25%) grey-washed the dark and killed
    // the lamp-glow-in-fog mood. Dark sessions get a smaller floor.
    // Twilight keeps its own exposure (dusk 1.03, dawn 1.08): the 1.08 day floor
    // lifted a dusk fog brighter than a clear dusk.
    const _fogFloor = isNightSession ? 0.95 : _twl ? 1.03 : 1.08;
    if (G.frame.exposure == null || G.frame.exposure < _fogFloor) G.frame.exposure = _fogFloor;
  } else {
    G.frameSky.cloud = G._cloudBase;
    // Guarantee frame.exposure always has a value (default = 1.0 if nothing set above)
    if (G.frame.exposure == null) G.frame.exposure = 1.0;
  }
  {
    let gm = 0;
    if (G.raceTimeOfDay === "dawn") gm = 0.40;
    else if (G.raceTimeOfDay === "dusk") gm = 0.22;
    else if (isNightSession) gm = 0.16;
    if (wxWet()) gm = Math.max(gm, wxRain() ? 0.18 : 0.12);
    else if (G.raceWeather === "overcast") gm = Math.max(gm, 0.34);
    else if (G.raceWeather === "fog") gm = Math.max(gm, 0.58);
    const _mb = G.track && G.track.def ? _trackAtmoBias(G.track.def) : 0;   // +overcast/humid, -arid
    gm *= 1.0 + clamp(_mb, -0.6, 0.6) * 0.5;
    G.frame.groundMist = clamp(gm, 0, 0.7);
  }
  // Live lighting-tuner overrides on the CONDITION-derived values
  // Re-derived fresh from the branch values every call (applyRaceSettings re-runs
  // whenever one of these knobs changes — see _APPLY_RACE_IDS), so they never
  // compound. All default to a no-op.
  {
    // SUN / MOON WARMTH — white-balance the final direct key colour.
    const st = LT.sunTemp || 0;
    if (st && G.frame.sunColor) {
      const sr = 1 + Math.max(0, -st) * 0.18 - Math.max(0, st) * 0.12;
      const sb = 1 - Math.max(0, -st) * 0.30 + Math.max(0, st) * 0.20;
      G.frame.sunColor = [G.frame.sunColor[0] * sr, G.frame.sunColor[1] * (1 - Math.abs(st) * 0.02), G.frame.sunColor[2] * sb];
    }
    // SUN ELEVATION / AZIMUTH offset — rebuild sunDir from the default direction.
    if ((LT.sunElev || LT.sunAzim) && G.frame.sunDir) {
      const d = G.frame.sunDir;
      let el = Math.asin(clamp(d[1], -1, 1)) + (LT.sunElev || 0) * Math.PI / 180;
      let az = Math.atan2(d[0], d[2]) + (LT.sunAzim || 0) * Math.PI / 180;
      el = clamp(el, -1.54, 1.54);
      const ce = Math.cos(el), nd = [ce * Math.sin(az), Math.sin(el), ce * Math.cos(az)];
      G.frame.sunDir = nd; G.frameSky.sunDir = nd;
    }
    // CLOUD COVER offset (also drives cloud shadows via uCloudCover).
    if (LT.cloudCover) G.frameSky.cloud = clamp((G.frameSky.cloud != null ? G.frameSky.cloud : 0) + LT.cloudCover, 0, 1);
    // MOON BRIGHTNESS.
    if (G.frameSky.moon) G.frameSky.moon *= LT.moonBright;
    // CITY SKYGLOW (fresh array — never mutate the palette in place).
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
  // Save base ambient + exposure so the lightning system can restore them each
  // frame. Exposure matters: the flash SETS frame.exposure from this base — the
  // old `frame.exposure +=` compounded ~+1.65 per strike and never restored, so
  // every strike left the whole scene permanently brighter (a stormy race washed
  // out to white over a few minutes).
  G._ltBase = {
    ambientSky:    G.frame.ambientSky.slice(),
    ambientGround: G.frame.ambientGround.slice(),
    exposure:      G.frame.exposure != null ? G.frame.exposure : 1.0,
  };
  // Arm lightning timing (first strike after a random 3-8 s delay) — but only
  // when no countdown is already pending: applyRaceSettings re-runs on EVERY
  // tuner drag tick for the _APPLY_RACE_IDS knobs, and unconditionally
  // re-arming here kept pushing the strike 3-8 s away, so lightning never
  // fired while a sun/ambient slider was being dragged in the rain.
  if (!(G._ltNextT > 0)) { G._ltFlash = 0; G._ltNextT = 3 + Math.random() * 5; }
  // Resolve the prop-emissive ramp NOW, not only on the next rendered frame:
  // stars/moon/ambient above land synchronously, and a read between a night→day
  // rebuild and the first day frame used to pair the day sky with the night's
  // floodEmit (qatar-foundation.spec, 2026-10-05: day 0.0858 == night 0.0858).
  G._lastFloodEmit = floodEmit(G.frame && G.frame.sunDir ? G.frame.sunDir[1] : null);
}

// Prop emissive (lit windows / signage / neon) — how strongly the buildings
// glow after dark. A full night session goes to full emissive REGARDLESS of the
// palette's sun elevation: many night palettes keep the sun above the horizon
// for the sky glow (sunY≈0.25), which would pin an elevation ramp near 0.10 and
// leave the glowing-glass towers reading as dark boxes. Dusk/dawn ramp by the
// (genuinely low) sun elevation; day stays dark. min(1): glsl-lit.js mix()
// EXTRAPOLATES past 1. The ONE formula: game.js's frame and the resolve above.
function floodEmit(sunY) {
  const tod = G.raceTimeOfDay;
  const night = tod === "night" || (tod === "default" && !!(G.track && G.track.def && G.track.def.night));
  if (sunY == null) sunY = night ? -1 : 1;
  return Math.min(1, LT.floodEmitMul * (night ? 0.78
    : (tod === "dusk" || tod === "dawn") ? Math.min(0.70, 0.05 + 0.58 * Math.max(LT.twilightFloor ?? 0.30, clamp(1 - sunY * (LT.twilightRamp ?? 6), 0, 1)))
    : 0));
}

// The sky shader's smoothstep, for the overcast horizon weight above.
function _smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, ((x != null ? x : 0) - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
// Twilight fog colour from the horizon: luminance with the day grey's cool
// lift ([0.74,0.76,0.78] is 1 : 1.03 : 1.05), mixed 35 % back toward the hue.
function _twilightFog(h) {
  const y = 0.2126 * h[0] + 0.7152 * h[1] + 0.0722 * h[2];
  const g = [y, y * 1.02, y * 1.05];
  return g.map((v, i) => v + (h[i] - v) * 0.35);
}

// Per-track sun AZIMUTH bias
// Apply a per-track azimuth (compass) bias to an authored sun direction as a TRUE
// XZ ROTATION — the same idiom the default-mode block below uses on _pal.sunDir.
// Folding the bias straight into x and then V3.norm-ing the result is NOT that:
// adding a scalar to x changes |v|, so normalising rescales y as well and a knob
// documented as HORIZONTAL silently moves the sun's ELEVATION. Measured on the
// shipped bias tables: Spa's DAY sun sinks 42.96° -> 30.28° while Bahrain's
// rises to 53.34° — a 23° elevation spread across the roster — and Qatar's DUSK
// sun climbs 10.37° -> 18.36°, right out of the "close to the deck" golden hour
// its branch is written for. `xBias` sets the compass angle; the elevation stays
// at the branch's authored base (dawn 6.71°, dusk 10.37°, day 42.96°). Holding
// y AND the horizontal length |xz| fixed is what makes a rotation a rotation.
function _sunDirAz(base, xBias) {
  const az = Math.atan2(base[0] + xBias, base[2]);   // the compass angle, as shipped
  const h  = Math.hypot(base[0], base[2]);           // authored horizontal length — preserved
  return V3.norm([h * Math.sin(az), base[1], h * Math.cos(az)]);
}

// Specific well-known circuits first (highest priority) — module const, not a
// per-call literal: _trackAtmoBias runs several times per applyRaceSettings.
const _ATMO_BIAS = {
    // Notoriously overcast / changeable
    spa:        0.85,
    silverstone: 0.70,
    zandvoort:  0.60,
    interlagos: 0.55,
    // High-altitude / hazy
    mexico:    -0.10,
    // Crisp mountain air
    redbull:    0.10,
    // Mediterranean / sunny
    monaco:    -0.25,
    imola:     -0.20,
    // Asian circuits — moderate humidity but generally good visibility
    suzuka:     0.05,
    shanghai:   0.15,
    // Street circuits in sunny climates
    baku:      -0.10,
    jeddah:    -0.20,
    singapore:  0.10,   // humid but the night keeps it dark regardless
    vegas:     -0.30,   // desert night, very clear
    miami:     -0.05,
    madrid:    -0.15,
    montreal:   0.20,
    albert_park: 0.05,
    // Pure desert / very clear skies
    bahrain:   -0.50,
    qatar:     -0.55,
    abudhabi:  -0.45,
    cota:       0.10,
    hungaroring: 0.15,
};
function _trackAtmoBias(def) {
  if (!def) return 0;
  if (_ATMO_BIAS[def.id] !== undefined) return _ATMO_BIAS[def.id];
  // Fall back to theme
  if (def.theme === "desert") return -0.45;
  if (def.theme === "street_night") return -0.10;
  return 0;
}
// MENU LAMP PRE-BAKE (scheduleFlybyTrack): the lamp half of applyRaceSettings
// for the menu-built track and the chosen time/weather — the same resolved LT,
// the same _lights array, the same forTrack key — started as a sliced job
// (LampBake.prebake) so the sync forTrack on the RACE! tap is a cache hit.
// Returns step(ms) (true when done) or null when the session bakes nothing.
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
