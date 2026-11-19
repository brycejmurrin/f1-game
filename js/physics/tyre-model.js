const TyreModel = (function () {
  "use strict";

  const clamp = M4.clamp;
  const fin = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

  const LEVELS = { off: 0, light: 0.55, real: 1 };
  function isLevel(v) { return Object.prototype.hasOwnProperty.call(LEVELS, v); }

  const CURVE_PEAK_X = Math.PI / 2;
  const CURVE_PEAK_X_F = (Math.PI / 2) * (8.5 / 10.5);
  const CURVE_FLOOR = 0.75;
  const CURVE_FALL_W = 1.4;
  const CURVE_FLOOR_R = 0.80;
  const CURVE_FALL_W_R = 2.0;
  const CURVE_HOLD_R = 2.6;
  function lateralCurve(x, floor, fallW, hold) {
    if (hold != null) {
      const ax = Math.abs(x);
      if (ax <= CURVE_PEAK_X) return Math.sin(x);
      if (ax <= hold) return x < 0 ? -1 : 1;
      const d = (ax - hold) / fallW;
      const g = floor + (1 - floor) * Math.exp(-d * d);
      return x < 0 ? -g : g;
    }
    const ax = Math.abs(x);
    const k = (Math.PI / 2) / CURVE_PEAK_X_F;
    if (ax <= CURVE_PEAK_X_F) return Math.sin(x * k);
    const d = (ax - CURVE_PEAK_X_F) / CURVE_FALL_W;
    const g = CURVE_FLOOR + (1 - CURVE_FLOOR) * Math.exp(-d * d);
    return x < 0 ? -g : g;
  }

  const LIFE_MID = 0.88;
  const LIFE_K = 2.31;
  const LIFE_MIN = 0.30, LIFE_MAX = 1.20;
  function deriveLife(cornering) {
    const c = Number(cornering);
    return clamp(LIFE_MID * Math.exp(LIFE_K * (1 - (isFinite(c) ? c : 1))), LIFE_MIN, LIFE_MAX);
  }
  function lifeOf(opt) {
    if (!opt) return LIFE_MID;
    return opt.life != null ? clamp(+opt.life, LIFE_MIN, LIFE_MAX) : deriveLife(opt.cornering);
  }

  const MIN_LIFE_LAPS = 5;
  function lifeLaps(life, lapsTarget) {
    return Math.max(MIN_LIFE_LAPS, (life || LIFE_MID) * Math.max(1, lapsTarget || 1));
  }

  const LOAD_REF = 0.49;
  const LOAD_IDLE = 0.30;
  const W_LAT = 0.95;
  const W_LONG = 0.30;
  const W_SLIDE = 0.90;
  const W_KERB = 0.35;
  const W_OFF = 1.20;
  const LOAD_MIN = 0.20, LOAD_MAX = 3.0;
  const W_OFF_N = W_OFF / LOAD_REF;
  const LOAD_MAX_N = LOAD_MAX / LOAD_REF;

  function humanLoad(c, latMax) {
    const lat = clamp(Math.abs(fin(c.speed, 0) * fin(c.yawRateCur, 0)) / Math.max(1, fin(latMax, 1)), 0, 1.2);
    const lng = clamp(fin(c.axFrac, 0), 0, 1);
    const slide = clamp(fin(c.skidIntensity, 0), 0, 1);
    const raw = clamp(LOAD_IDLE + W_LAT * lat * lat + W_LONG * lng * lng + W_SLIDE * slide
      + (c.onKerb ? W_KERB : 0), LOAD_MIN, LOAD_MAX);
    return Math.min(LOAD_MAX_N, raw / LOAD_REF + (c.offroad ? W_OFF_N : 0));
  }

  const FUEL_LOAD = 0.22;
  function fuelLoadMul(c, lapsTarget) { return 1 + FUEL_LOAD * fuelFrac(c, lapsTarget); }

  const LOAD_AI_BASE = 0.92;
  const LOAD_AI_STYLE = 0.45;
  const LOAD_AI_LONG = 0.30;
  const LOAD_AI_CARE = 0.12;
  const LOAD_AI_REF = 1.23;
  function aiLong(c) { return fin(c.corridorAccel, fin(c.accSm, 0)); }
  function aiLoad(c, aTop) {
    const cons = clamp(fin(c.consistency, 0.75), 0, 1);
    const lng = clamp(fin(Math.abs(aiLong(c)) / Math.max(1, aTop), 0), 0, 1);
    const care = 1 - LOAD_AI_CARE * clamp(fin(c.tyreCare, 0), -1, 1);
    return Math.min(LOAD_MAX_N, clamp((LOAD_AI_BASE + LOAD_AI_STYLE * (1 - cons) + LOAD_AI_LONG * lng * lng) * care,
      LOAD_MIN, LOAD_MAX) / LOAD_AI_REF + (c.offroad ? W_OFF_N : 0));
  }

  const DROP_LIN = 0.05;
  const DROP_CLIFF = 0.50;
  const GRIP_FLOOR = 0.55;
  const LONG_SHARE = 0.45;

  function gripFor(wear) {
    const w = Math.max(0, wear || 0);
    return clamp(1 - DROP_LIN * Math.min(w, 1) - DROP_CLIFF * Math.max(0, w - 1), GRIP_FLOOR, 1);
  }

  const AXLE_LONG = 0.55;
  const AXLE_REST = 0.06;
  const AXLE_BB = 1.8;
  const BB_REF = PhysicsConsts.BB_REF;

  function longSigned(c, aTop) {
    if (c.human) return ((c.axEstSm || 0) < 0 ? -1 : 1) * clamp(fin(c.axFrac, 0), 0, 1);
    return clamp(fin(aiLong(c) / Math.max(1, aTop), 0), -1, 1);
  }
  function axleShare(c, aTop) {
    const d = axleTilt(c, aTop);
    return [1 + d, 1 - d];
  }
  function axleTilt(c, aTop) {
    const lng = longSigned(c, aTop);
    const bb = c.brakeBias != null && isFinite(c.brakeBias) ? c.brakeBias : BB_REF;
    const bias = lng < 0 ? clamp(1 + AXLE_BB * (bb - BB_REF), 0.3, 1.7) : 1;
    return clamp(AXLE_REST - lng * AXLE_LONG * bias, -0.9, 0.9);
  }
  const AXLE_EVEN = Object.freeze({ f: 1, r: 1 });

  const T_AMBIENT = { dry: 30, overcast: 22, fog: 18, wet: 16, rain: 13 };
  const T_BLANKET = 70;
  const T_OPT_MID = 105, T_OPT_SPAN = 35, T_WINDOW = 18;
  function optTemp(life) { return T_OPT_MID + T_OPT_SPAN * ((life == null ? LIFE_MID : life) - LIFE_MID); }

  const HEAT_K = 7.8, HEAT_ROLL = 1.0, HEAT_SLIP = 0.55;
  const COOL_K = 0.06, COOL_V = 0.8;
  const SINK_TRACK = 0.45;
  const T_TRACK_DELTA = { dry: 18, overcast: 10, fog: 5, wet: 3, rain: 1 };
  const EXCH = 0.020, COOL_B = 0.008;
  function warmRate(life) { return clamp(1.35 - 0.4 * ((life == null ? LIFE_MID : life) / LIFE_MID), 0.7, 1.5); }

  const T_REF_LOAD = 1.10, T_REF_V = 0.95;
  function sinkOf(amb, track) {
    const tr = track != null && isFinite(track) ? track : amb;
    return (1 - SINK_TRACK) * amb + SINK_TRACK * tr;
  }
  function coolFor(life) {
    const refAmb = T_AMBIENT.dry;
    const refSink = sinkOf(refAmb, refAmb + T_TRACK_DELTA.dry);
    const rise = Math.max(20, optTemp(life) - refSink);
    return HEAT_K * warmRate(life) * HEAT_ROLL * T_REF_LOAD * T_REF_V / ((1 + COOL_V * T_REF_V) * rise);
  }

  function stepTemp(ts, tb, { load, vFrac, amb, track, life, slide, dt }) {
    return tempInto([0, 0], ts, tb, load, vFrac, amb, track, life, slide, dt);
  }
  function tempInto(out, ts, tb, load, vFrac, amb, track, life, slide, dt) {
    const w = warmRate(life);
    const v = clamp(vFrac, 0, 1);
    const ld = Math.max(0, load);
    const sl = clamp(slide || 0, 0, 1);
    const heat = HEAT_K * w * (HEAT_ROLL * ld * v + HEAT_SLIP * sl * ld * v);
    const sink = sinkOf(amb, track);
    const cool = coolFor(life) * (1 + COOL_V * v) * (ts - sink);
    const ns = ts + (heat - cool - EXCH * (ts - tb)) * dt;
    const nb = tb + (EXCH * (ts - tb) - COOL_B * (tb - amb)) * dt;
    out[0] = Number.isFinite(ns) ? clamp(ns, -40, 400) : (Number.isFinite(ts) ? ts : 0);
    out[1] = Number.isFinite(nb) ? clamp(nb, -40, 400) : (Number.isFinite(tb) ? tb : 0);
    return out;
  }

  const COLD_PEN = 0.12, HOT_PEN = 0.12, TEMP_SPAN = 40, TEMP_FLOOR = 0.80;
  function tempGrip(ts, life) {
    if (ts == null) return 1;
    const opt = optTemp(life);
    const cold = Math.max(0, (opt - T_WINDOW) - ts) / TEMP_SPAN;
    const hot = Math.max(0, ts - (opt + T_WINDOW)) / TEMP_SPAN;
    return clamp(1 - COLD_PEN * cold * cold - HOT_PEN * hot * hot, TEMP_FLOOR, 1);
  }

  const GRAIN_RATE = 0.055, GRAIN_HEAL = 0.02, GRAIN_GRIP = 0.05;
  const BLIST_OVER = 35, BLIST_RATE = 0.0012, BLIST_GRIP = 0.14;
  function stepGrain(grain, { ts, life, slide, dt }) { return grainStep(grain, ts, life, slide, dt); }
  function stepBlister(blister, { tb, life, dt }) { return blisterStep(blister, tb, life, dt); }
  function grainStep(grain, ts, life, slide, dt) {
    const opt = optTemp(life);
    const cold = clamp(((opt - T_WINDOW) - ts) / TEMP_SPAN, 0, 1);
    const g = (grain || 0) + (cold > 0 ? GRAIN_RATE * cold * clamp(slide, 0, 1) : -GRAIN_HEAL) * dt;
    return clamp(g, 0, 1);
  }
  function blisterStep(blister, tb, life, dt) {
    const over = tb - (optTemp(life) + T_WINDOW + BLIST_OVER);
    return clamp((blister || 0) + (over > 0 ? BLIST_RATE * over * dt : 0), 0, 1);
  }
  function defectGrip(grain, blister) {
    return clamp(1 - GRAIN_GRIP * clamp(grain || 0, 0, 1) - BLIST_GRIP * clamp(blister || 0, 0, 1), 0.6, 1);
  }

  const FUEL_ACCEL = 0.060;
  const FUEL_VMAX = 0.012;
  const lapsDone = (lap) => Math.max(0, (lap || 0) - 1);
  function fuelFrac(c, lapsTarget) {
    const n = Math.max(1, lapsTarget || 1);
    return clamp(1 - lapsDone(c.fuelLap == null ? c.lap : c.fuelLap) / n, 0, 1);
  }

  function codeForLife(life, tread) {
    if (tread === 2) return "W";
    if (tread === 1) return "I";
    return life < 0.70 ? "S" : life < 0.95 ? "M" : "H";
  }

  const AI_CLASS = {
    soft:   { code: "S", life: 0.48, off: 0.004,  tread: 0, colour: [0.92, 0.12, 0.10] },
    medium: { code: "M", life: 0.74, off: 0,      tread: 0, colour: [0.96, 0.80, 0.10] },
    hard:   { code: "H", life: 1.05, off: -0.004, tread: 0, colour: [0.90, 0.90, 0.93] },
    inter:  { code: "I", life: 1.00, off: -0.010, tread: 1, colour: [0.10, 0.72, 0.24],
              mods: { speed: 0.92, accel: 0.93, cornering: 0.94, braking: 0.98 } },
    wet:    { code: "W", life: 1.10, off: -0.020, tread: 2, colour: [0.10, 0.40, 0.92],
              mods: { speed: 0.88, accel: 0.90, cornering: 0.90, braking: 0.94 } },
  };
  function classRecord(cls) {
    const t = AI_CLASS[cls] || AI_CLASS.medium;
    return { id: cls, code: t.code, life: t.life, off: t.off, tread: t.tread || 0, colour: t.colour,
             mods: t.mods || null };
  }
  function asRain(w) { return w === "storm" ? "rain" : w; }
  function wetValue(w) { return w === "rain" || w === "storm" ? 1 : w === "wet" ? 0.5 : 0; }
  function wetness(weather, arc) {
    if (!arc) return wetValue(weather);
    const f = clamp(arc.t / Math.max(1, arc.dur), 0, 1);
    return wetValue(arc.from) + (wetValue(arc.to) - wetValue(arc.from)) * f;
  }
  function weatherGrip(tread, w) {
    const table = PhysicsConsts.WET_GRIP, t = Number.isInteger(tread) && tread >= 0 && tread <= 2 ? tread : 0;
    w = clamp(w, 0, 1);
    return w <= 0.5 ? table.dry[t] + (table.wet[t] - table.dry[t]) * w * 2 : table.wet[t] + (table.rain[t] - table.wet[t]) * (w - 0.5) * 2;
  }
  function treadFor(weather, wetness) {
    if (Number.isFinite(wetness)) return wetness >= 0.72 ? 2 : wetness >= 0.25 ? 1 : 0;
    return weather === "rain" || weather === "storm" ? 2 : weather === "wet" ? 1 : 0;
  }
  function classForTread(tread) { return tread === 2 ? "wet" : tread === 1 ? "inter" : null; }
  function bestTread(w) {
    const g0 = weatherGrip(0, w), g1 = weatherGrip(1, w), g2 = weatherGrip(2, w);
    return g2 > g1 && g2 > g0 ? 2 : g1 > g0 ? 1 : 0;
  }
  function treadOf(c, weather, wetness) {
    if (!c) return 0;
    if (c.wxFollow && c.tyre) return c.tyre.tread || 0;
    return c.tread == null ? treadFor(weather, wetness) : c.tread;
  }
  function carGrip(c, weather, mean, surface) {
    const g = weatherGrip(treadOf(c, weather, mean), surface);
    if (!c || !c.wxFollow || !(c.wxMix < 1) || c.wxPrev == null) return g;
    const g0 = weatherGrip(c.wxPrev, surface), k = clamp(c.wxMix, 0, 1);
    return g0 + (g - g0) * k;
  }

  const AQUA_WET = 0.72;
  const AQUA_ONSET = Object.freeze([140 / 3.6, 215 / 3.6, 290 / 3.6]);
  const AQUA_RAMP = 70 / 3.6;
  const AQUA_LOSS = 0.5;
  const AQUA_AI = 0.1;
  function aquaDepth(wetness) { return clamp((fin(wetness, 0) - AQUA_WET) / (1 - AQUA_WET), 0, 1); }
  function aquaTread(tread) { return Number.isInteger(tread) && tread >= 0 && tread <= 2 ? tread : 0; }
  function aquaplane(speedStd, wetness, tread) {
    const d = aquaDepth(wetness);
    if (!(d > 0)) return 1;
    const r = clamp((Math.abs(fin(speedStd, 0)) - AQUA_ONSET[aquaTread(tread)]) / AQUA_RAMP, 0, 1);
    return 1 - AQUA_LOSS * d * r * r;
  }
  function aquaplaneSafeV(wetness, tread) {
    const full = AQUA_LOSS * aquaDepth(wetness);
    if (!(full > AQUA_AI)) return Infinity;
    return AQUA_ONSET[aquaTread(tread)] + AQUA_RAMP * Math.sqrt(AQUA_AI / full);
  }
  const _aq = { mul: 1, safeV: Infinity };
  function aquaInto(c, speedStd, weather, wetness) {
    const tread = treadOf(c, weather, wetness);
    _aq.mul = aquaplane(speedStd, wetness, tread);
    _aq.safeV = aquaplaneSafeV(wetness, tread);
    return _aq;
  }
  function optionRecord(opt) {
    if (!opt) return classRecord("medium");
    const life = lifeOf(opt);
    const tread = opt.wetTread || 0;
    return {
      id: opt.id, code: codeForLife(life, tread),
      life, off: 0, tread,
      colour: (opt.visual && opt.visual.band) || [0.9, 0.9, 0.93],
      mods: {
        speed: opt.speed == null ? 1 : opt.speed,
        accel: opt.accel == null ? 1 : opt.accel,
        cornering: opt.cornering == null ? 1 : opt.cornering,
        braking: opt.braking == null ? 1 : opt.braking,
      },
    };
  }

  const STAT_KEYS = ["speed", "accel", "cornering", "braking"];
  const _wetMods = { speed: 1, accel: 1, cornering: 1, braking: 1 };
  function wetModsFor(tread, wearOn) {
    const t = AI_CLASS[classForTread(tread)];
    _wetMods.speed = wearOn && t ? 1 + t.off : 1;
    return _wetMods;
  }
  function applyCompound(c, record, wearOn) {
    if (!c) return null;
    c.tyre = record || classRecord("medium");
    if (c.tread !== null || (c.pitPlan && !c.human)) c.tread = c.tyre.tread || 0;
    if (c.tyreBaseMods) {
      const out = c.mods || (c.mods = {}), tm = c.tyre.tread > 0 ? wetModsFor(c.tyre.tread, !!wearOn) : c.tyre.mods || null;
      for (const k of STAT_KEYS) out[k] = c.tyreBaseMods[k] * (tm && tm[k] != null ? tm[k] : 1);
    }
    return c.tyre;
  }

  function startRecord(c, tread) {
    if (c && c.pitPlan && !c.human) {
      const wet = tread > 0 ? classForTread(tread) : null;
      return classRecord(wet || c.pitPlan.start);
    }
    return c && c.tyreOpt ? optionRecord(c.tyreOpt) : classRecord(c && c.tyreClass);
  }

  function create(G) {
    Log.info("game", "TyreModel.create");
    const _tT = [0, 0], _axOut = { f: 1, r: 1 };
    let level = (G && isLevel(G.raceTyreWear)) ? G.raceTyreWear : "off";

    function on() { return LEVELS[level] > 0; }
    function setLevel(v) { if (isLevel(v)) level = v; return level; }
    function effLifeLaps(life, lapsTarget) { return effLifeLapsAt(life, lapsTarget, severity()); }
    function effLifeLapsAt(life, lapsTarget, sev) {
      return Math.max(MIN_LIFE_LAPS, (life || LIFE_MID) * Math.max(1, lapsTarget || 1) / sev);
    }
    function planLaps(life, lapsTarget) {
      const k = LEVELS[level];
      return k > 0 ? effLifeLaps(life, lapsTarget) / k : Math.max(1, lapsTarget || 1);
    }

    function fit(c, record) {
      if (!c) return;
      applyCompound(c, record, on());
      c.wxFollow = !on() && c.tread !== null && !!c.tyreOpt && !c.tyreOpt.wetTread;
      c.wxMix = 1; c.wxPrev = null;
      c.tyreWear = 0;
      c.tyreWearF = 0; c.tyreWearR = 0;
      c.tyreTs = T_BLANKET; c.tyreTb = T_BLANKET;
      if (quali()) { c.tyreTs = optTemp(c.tyre.life); c.tyreTb = c.tyreTs; }
      c.tyreGrain = 0; c.tyreBlister = 0; c.flatSpot = 0;
      c.tyreLap0 = c.lap || 0;
      const physical = physicalLaps(c);
      c.tyrePhysicalOffset = physical == null ? null : physical - lapsDone(c.tyreLap0);
      const len = G.track && G.track.total, at = physical == null ? c.s : c.prog - (c._progGift || 0);
      c.tyreLapAdj = (c.lap || 0) >= 1 && len > 0 && (physical == null ? (at || 0) : at - physical * len) > len * 0.5 ? 1 : 0;
      c.tyreStints = (c.tyreStints || 0) + 1;
      const log = c.tyreLog || (c.tyreLog = []);
      const last = log[log.length - 1];
      if (last && last.lap1 == null) last.lap1 = c.lap || 0;
      log.push({ code: c.tyre.code, id: c.tyre.id, colour: c.tyre.colour,
                 lap0: c.lap || 0, lap1: null });
    }
    function closeStints(c) {
      const log = c && c.tyreLog;
      if (!log || !log.length) return;
      const last = log[log.length - 1];
      if (last.lap1 == null) last.lap1 = c.lap || 0;
    }
    function stints(c) {
      if (!c || !c.tyreLog) return [];
      const end = lapsDone(c.lap);
      return c.tyreLog.map(function (e) {
        const lap0 = lapsDone(e.lap0);
        const lap1 = e.lap1 == null ? end : lapsDone(e.lap1);
        return { code: e.code, id: e.id, colour: e.colour,
                 lap0, lap1, laps: Math.max(0, lap1 - lap0) };
      });
    }

    const SEVERITY_DEFAULT = 1.0;
    function tAmb(w) { const t = T_AMBIENT[asRain(w)]; return t == null ? T_AMBIENT.dry : t; }
    function tTrackDelta(w) { const d = T_TRACK_DELTA[asRain(w)]; return d == null ? T_TRACK_DELTA.dry : d; }
    function ambient() { return ambientAt(G.weatherArc, G.raceWeather); }
    const TAU_DRY = 36;
    function arcFrac(arc) {
      if (arc.cell && arc.t >= arc.cell.life) return Math.exp(-(arc.t - arc.cell.life) / TAU_DRY);
      return clamp(arc.t / arc.dur, 0, 1);
    }
    function ambientAt(arc, weather) {
      if (arc && arc.dur > 0 && arc.from && arc.to) {
        const f = arcFrac(arc);
        return tAmb(arc.from) + (tAmb(arc.to) - tAmb(arc.from)) * f;
      }
      return tAmb(weather);
    }
    function trackTemp() { const arc = G.weatherArc, weather = G.raceWeather; return trackTempAt(arc, weather, ambientAt(arc, weather)); }
    function trackTempAt(arc, weather, a) {
      if (arc && arc.dur > 0 && arc.from && arc.to) {
        const f = arcFrac(arc);
        const d = tTrackDelta(arc.from) + (tTrackDelta(arc.to) - tTrackDelta(arc.from)) * f;
        return a + d;
      }
      return a + tTrackDelta(weather);
    }

    function severity() { return severityAt(G.track); }
    function severityAt(track) {
      const def = track && track.def;
      const v = def && def.tyreSeverity;
      return v != null && isFinite(v) ? clamp(+v, 0.4, 2.0) : SEVERITY_DEFAULT;
    }

    const W_SLIP_SPD = 0.35;

    const WX_CHANGE_S = 3, WX_HYST = 0.002;
    function followWeather(c, dt) {
      if (c.wxMix < 1) c.wxMix = Math.min(1, c.wxMix + (dt > 0 ? dt : 0) / WX_CHANGE_S);
      const w = G.trackWetness ? G.trackWetness() : wetness(G.raceWeather, G.weatherArc);
      const want = bestTread(w), cur = c.tyre ? c.tyre.tread || 0 : -1;
      if (cur === want || (cur >= 0 && weatherGrip(want, w) < weatherGrip(cur, w) + WX_HYST)) return;
      if (cur >= 0) { c.wxPrev = cur; c.wxMix = 0; }
      c.tyre = want > 0 ? classRecord(classForTread(want)) : optionRecord(c.tyreOpt);
    }
    function update(c, dt) {
      if (c && c.wxFollow && !c.retired) followWeather(c, dt);
      if (!on() || !c || c.retired || c.finished) return;
      const track = G.track;
      if (!track || !(track.total > 0) || !(dt > 0)) return;
      if (!c.tyre) fit(c, classRecord("medium"));
      const aTop = G.aTop(), arc = G.weatherArc, weather = G.raceWeather;
      const load = (c.human ? humanLoad(c, G.LAT_MAX) : aiLoad(c, aTop))
        * (1 + FUEL_LOAD * fuelOf(c));
      c._tyreLoad = load;
      const amb = ambientAt(arc, weather);
      const trk = trackTempAt(arc, weather, amb);
      if (c.tyreTs == null) { c.tyreTs = amb; c.tyreTb = amb; }
      const vFrac = fin(Math.abs(fin(c.speed, 0)) / Math.max(1, G.vTop()), 0);
      const slide = c.human ? (c.skidIntensity || 0) : 0;
      const t = tempInto(_tT, c.tyreTs, c.tyreTb, load, vFrac, amb, trk, c.tyre.life, slide, dt);
      c.tyreTs = t[0]; c.tyreTb = t[1];
      c.tyreGrain = grainStep(c.tyreGrain, c.tyreTs, c.tyre.life, slide, dt);
      c.tyreBlister = blisterStep(c.tyreBlister, c.tyreTb, c.tyre.life, dt);
      const lapFrac = Math.abs(fin(c.speed, 0)) * dt / track.total;
      if (!(lapFrac > 0)) return;
      const slipMul = 1 + W_SLIP_SPD * clamp(slide, 0, 1);
      const dw = lapFrac * load * slipMul * LEVELS[level] / effLifeLapsAt(c.tyre.life, G.lapsTarget, severityAt(track));
      if (!Number.isFinite(dw)) return;
      c.tyreWear = (c.tyreWear || 0) + dw;
      const d0 = axleTilt(c, aTop);
      const d = Number.isFinite(d0) ? d0 : 0;
      c.tyreWearF = (c.tyreWearF || 0) + dw * (1 + d);
      c.tyreWearR = (c.tyreWearR || 0) + dw * (1 - d);
    }

    function gripMul(c) {
      if (!on() || !c) return 1;
      const life = c.tyre ? c.tyre.life : null;
      return gripFor(c.tyreWear) * tempGrip(c.tyreTs, life) * defectGrip(c.tyreGrain, c.tyreBlister);
    }
    function tractionMul(c) {
      if (!on() || !c) return 1;
      return 1 - (1 - gripMul(c)) * LONG_SHARE;
    }
    function axleSplit(c) {
      if (!on() || !c || c.tyreWearF == null) return AXLE_EVEN;
      const base = gripFor(c.tyreWear);
      _axOut.f = gripFor(c.tyreWearF) / base; _axOut.r = gripFor(c.tyreWearR) / base;
      return _axOut;
    }
    function quali() { return G.session === "quali"; }
    function fuelOf(c) { return quali() ? 0 : fuelFrac(c, G.lapsTarget); }
    function fuelAccelMul(c) {
      return on() && c ? 1 / (1 + FUEL_ACCEL * fuelOf(c)) : 1;
    }
    function fuelVmaxMul(c) {
      return on() && c ? 1 / (1 + FUEL_VMAX * fuelOf(c)) : 1;
    }

    function physicalLaps(c) {
      const length = G.track && G.track.total;
      return c && Number.isFinite(c.prog) && length > 0
        ? Math.floor(Math.max(0, c.prog - (c._progGift || 0)) / length) : null;
    }
    function lapsOn(c) {
      if (!c || !c.tyre) return 0;
      const physical = physicalLaps(c);
      return Math.max(0, physical != null && c.tyrePhysicalOffset != null
        ? physical - c.tyrePhysicalOffset - lapsDone(c.tyreLap0) - (c.tyreLapAdj || 0)
        : lapsDone(c.lap) - lapsDone(c.tyreLap0) - (c.tyreLapAdj || 0));
    }
    function spent(c) { return c ? clamp(c.tyreWear || 0, 0, 2) : 0; }
    function lapsLeft(c) {
      if (!on() || !c || !c.tyre) return null;
      const w = spent(c), n = lapsOn(c);
      const len = G.track && G.track.total, at = len > 0 && Number.isFinite(c.prog) ? Math.max(0, c.prog - (c._progGift || 0)) / len : 0;
      const life = n >= 1 && w > 0.02 ? (n + (at - Math.floor(at))) / w : planLaps(c.tyre.life, G.lapsTarget);
      return Math.max(0, life * (1 - Math.min(1, w)));
    }

    function belowWindow(c) {
      if (!c || !c.tyre || c.tyreTs == null) return 0;
      const tempS = +c.tyreTs.toFixed(1), tempOpt = +optTemp(c.tyre.life).toFixed(1);
      return Math.max(0, (tempOpt - T_WINDOW) - tempS);
    }

    function info(c) {
      if (!c) return null;
      const t = c.tyre || null;
      return {
        level, on: on(),
        compound: t ? t.id : null,
        code: t ? t.code : null,
        life: t ? t.life : null,
        lifeLaps: t ? +lifeLaps(t.life, G.lapsTarget).toFixed(2) : null,
        wear: +spent(c).toFixed(4),
        wearF: c.tyreWearF != null ? +c.tyreWearF.toFixed(4) : null,
        wearR: c.tyreWearR != null ? +c.tyreWearR.toFixed(4) : null,
        lapsOn: lapsOn(c),
        stints: c.tyreStints || 0,
        load: +(c._tyreLoad || 0).toFixed(3),
        severity: +severity().toFixed(3),
        tempS: c.tyreTs != null ? +c.tyreTs.toFixed(1) : null,
        tempB: c.tyreTb != null ? +c.tyreTb.toFixed(1) : null,
        tempOpt: t ? +optTemp(t.life).toFixed(1) : null,
        tempWindow: T_WINDOW,
        ambient: ambient(),
        trackTemp: +trackTemp().toFixed(1),
        grain: +(c.tyreGrain || 0).toFixed(4),
        blister: +(c.tyreBlister || 0).toFixed(4),
        tempGrip: +tempGrip(c.tyreTs, t ? t.life : null).toFixed(4),
        defectGrip: +defectGrip(c.tyreGrain, c.tyreBlister).toFixed(4),
        grip: +gripMul(c).toFixed(4),
        traction: +tractionMul(c).toFixed(4),
        axleF: +axleSplit(c).f.toFixed(4),
        axleR: +axleSplit(c).r.toFixed(4),
        fuel: +fuelOf(c).toFixed(3),
      };
    }

    function sessionStartRecord(c, tread) {
      const rec = startRecord(c, tread);
      if (!(tread > 0) || !c || !c.tyreOpt || !rec || rec.tread > 0) return rec;
      return classRecord(classForTread(tread));
    }

    return {
      fit, update, gripMul, tractionMul, axleSplit, fuelAccelMul, fuelVmaxMul,
      stints, closeStints,
      lapsOn, spent, lapsLeft, belowWindow, info, severity, ambient, trackTemp,
      level: () => level, setLevel, on, planLaps,
      classRecord, optionRecord, applyCompound: (c, record) => applyCompound(c, record, on()), startRecord: sessionStartRecord,
    };
  }

  function brakeBeta(prev, rearUtil, dt) {
    const K = PhysicsConsts;
    const target = 1 - K.BRAKE_STAB * clamp(((rearUtil || 0) - K.BRAKE_STAB_LO) / (K.BRAKE_STAB_HI - K.BRAKE_STAB_LO), 0, 1);
    return prev == null ? target : M4.lerp(prev, target, 1 - Math.exp(-12 * dt));
  }
  function brakeFront(beta, loadF, loadR) {
    return 1 + PhysicsConsts.BRAKE_STAB_SHIFT * (1 / (loadF + beta * loadR) - 1);
  }

  return {
    LEVELS, isLevel, lateralCurve, CURVE_PEAK_X, CURVE_PEAK_X_F, CURVE_FLOOR, CURVE_FALL_W, CURVE_FLOOR_R, CURVE_FALL_W_R, CURVE_HOLD_R, lifeLaps, MIN_LIFE_LAPS,
    gripFor, humanLoad, aiLoad, fuelFrac,
    optTemp, warmRate, stepTemp, tempGrip, stepGrain, stepBlister,
    axleShare, AXLE_LONG, AXLE_REST, BB_REF, brakeBeta, brakeFront,
    T_AMBIENT, T_TRACK_DELTA, T_BLANKET, T_OPT_MID, T_OPT_SPAN, T_WINDOW, TEMP_FLOOR,
    HEAT_K, HEAT_ROLL, HEAT_SLIP, SINK_TRACK, SEVERITY_DEFAULT: 1.0,
    GRAIN_GRIP, BLIST_GRIP, BLIST_OVER,
    classRecord, optionRecord, applyCompound, startRecord, AI_CLASS, codeForLife, treadFor, treadOf, bestTread, carGrip, classForTread, wetness, weatherGrip,
    aquaplane, aquaplaneSafeV, aquaInto, AQUA_WET, AQUA_ONSET, AQUA_RAMP, AQUA_LOSS, asRain,
    DROP_LIN, DROP_CLIFF, GRIP_FLOOR, LONG_SHARE, LIFE_MIN, LIFE_MAX, FUEL_LOAD,
    create,
  };
})();
Object.freeze(TyreModel);
