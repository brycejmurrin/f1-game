const WeatherArc = (function () {
  "use strict";

  const LADDER = ["dry", "wet", "rain", "storm"];
  const VALID = ["dry", "wet", "rain", "overcast", "fog", "storm"];
  const TARGETS = ["dry", "overcast", "wet", "rain", "fog", "storm"];
  const DRAWN = TARGETS.slice(0, 5);
  const STORM_ODDS = 0.25;
  const asRain = (w) => (w === "storm" ? "rain" : w);
  const INTENSITY = { wet: 0.5, rain: 1, storm: 1.5 };
  const intOf = (w) => INTENSITY[w] || 0;
  const STORM_AT = 1.25;

  function arcSeq(from, to) {
    const a = LADDER.indexOf(from), b = LADDER.indexOf(to);
    if (a >= 0 && b >= 0 && a !== b) {
      const seq = [];
      for (let i = a; (a < b) ? i <= b : i >= b; i += (a < b) ? 1 : -1) seq.push(LADDER[i]);
      return seq;
    }
    return [from, to];
  }

  function create(G, deps) {
    Log.info("game", "WeatherArc.create");
    const { isTimeTrial, isQuali } = deps;

    let arc = null;
    let changeable = false;
    let plan = null;
    let base = null;

    function setWeatherLive(w, blend) {
      G.raceWeather = (VALID.indexOf(w) >= 0) ? w : "dry";
      if (typeof Particles !== "undefined" && Particles.rainIntensity && typeof Storm !== "undefined") Particles.rainIntensity(Storm.rainK(G.raceWeather));
      const v = viewRain();
      if (v.wet) {
        reseedRain(v.w);
        Particles.rainShow(true);
      } else {
        Particles.rainShow(false);
      }
      if (G.soundOn) { if (v.wet) GameAudio.startRain(); else GameAudio.stopRain(); }
      if (G.track) G.applyRaceSettings(blend);
      return G.raceWeather;
    }

    function setTimeOfDay(tod) {
      if (tod === undefined) return G.raceTimeOfDay;
      const valid = ["default", "dawn", "day", "dusk", "night"];
      G.raceTimeOfDay = valid.indexOf(tod) >= 0 ? tod : "default";
      G.loadTrack(G.trackIdx);
      G.applyRaceSettings();
      return G.raceTimeOfDay;
    }
    function weather(w) {
      if (w === undefined) return G.raceWeather;
      arc = null; grooveEnd = null;
      return setWeatherLive(w);
    }

    function capLaps() {
      const live = G.state === "race" || G.state === "count";
      return live ? ((G.lapsTarget | 0) || (G.raceLaps | 0)) : (G.raceLaps | 0);
    }
    function capPlanDur(dur, laps = capLaps(), len = G.track && G.track.total) {
      dur = Math.max(1, dur | 0);
      if (!(laps > 0) || !(len > 0)) return dur;
      const cap = Math.max(90, Math.floor(laps * (len / 48) * 0.72));
      return Math.min(dur, cap);
    }
    function planSeed() {
      if (typeof Career !== "undefined" && Career.inCareer && Career.inCareer() && Career.seasonSeed) return Career.seasonSeed();
      if (G.flow === "season" && G.season && typeof SeasonCal !== "undefined" && SeasonCal.luckSeed) {
        return SeasonCal.luckSeed(G.season, G.simSeed());
      }
      return G.simSeed();
    }
    let memo = null;
    function planInputs() {
      const round = (G.seasonMode && typeof SeasonCal !== "undefined" && SeasonCal.drawRound && G.season)
        ? SeasonCal.drawRound(G.season) : G.raceRound;
      return { seed: planSeed(), round, from: base != null ? base : G.raceWeather };
    }
    function drawPlan(seed, round, from, laps, len) {
      const r = (k) => Career.hash(seed, round, "wx", k);
      const opts = DRAWN.filter((w) => w !== from);
      let to = opts[Math.floor(r("to") * opts.length)] || "wet";
      if (to === "rain" && from !== "storm" && r("storm") < STORM_ODDS) to = "storm";
      return { to, dur: capPlanDur(120 + Math.floor(r("dur") * 300), laps, len) };
    }
    function planFor() {
      const { seed, round, from } = planInputs();
      const key = [seed, round, from, capLaps(), G.track && G.track.total].join("|");
      if (memo && memo.key === key) return { to: memo.plan.to, dur: memo.plan.dur };
      const plan = drawPlan(seed, round, from, capLaps(), G.track && G.track.total);
      memo = { key, plan };
      return { to: plan.to, dur: plan.dur };
    }
    function previewPlan(o) {
      o = o || {};
      const i = planInputs();
      return drawPlan(i.seed, i.round, o.from != null ? o.from : i.from, o.laps != null ? o.laps : capLaps(), o.len != null ? o.len : G.track && G.track.total);
    }
    function plannedArc(from, p, len) {
      const a = { from, to: p.to, dur: Math.max(1, p.dur || 60), t: 0, w0: wetOf(from) };
      if (typeof RainCells !== "undefined" && len > 0) a.cell = RainCells.forPlan(from, a.to, a.dur, len, wetOf);
      a.wetIn = wetInOf(a);
      return a;
    }
    function previewArc(o) {
      o = o || {};
      return plannedArc(o.from != null ? o.from : planInputs().from, previewPlan(o), o.len != null ? o.len : G.track && G.track.total);
    }
    function startChangeable(origin) {
      if (!changeable || isTimeTrial() || isQuali()) return null;
      const p = plan || planFor();
      base = G.raceWeather;
      const a = startArc(G.raceWeather, p.to, p.dur);
      if (a && Number.isFinite(origin)) a.t0 = origin;
      if (a) {
        const preview = plannedArc(a.from, p, G.track && G.track.total);
        a.cell = preview.cell; a.wetIn = preview.wetIn;
      }
      if (a) Log.info("game", "changeable " + G.raceWeather + " -> " + p.to + " over " + p.dur + " s" + (a && a.cell ? " (local shower, " + Math.round(a.cell.h * 200) + "% of the lap)" : ""));
      return a;
    }
    function endChangeable(keepPlan) {
      if (base != null && G.raceWeather !== base) G.raceWeather = base;
      base = null;
      if (!keepPlan && !G.netPlay.active()) plan = null;
    }
    function restoreBase() {
      if (base != null && G.raceWeather !== base) G.raceWeather = base;
      base = null;
      arc = null; grooveEnd = null;
    }
    function endSession(keepPlan) {
      arc = null; grooveEnd = null;
      const restored = base != null && G.raceWeather !== base;
      endChangeable(keepPlan);
      if (restored && G.track) { Particles.rainShow(false); G.applyRaceSettings(); }
    }

    const TAU_WET = 8, TAU_DRY = 36;
    const SETTLE = 0.005;
    const RAINING = 0.72;
    const reseedRain = (vw) => { if (typeof Particles !== "undefined" && Particles.rainSeed) Particles.rainSeed(!arc && vw < RAINING); else G.initRainDrops(); };
    const _vr = { w: 0, wet: false, raining: false };
    function viewRain() {
      const w = viewRainfall(); _vr.w = w; _vr.wet = w > 0.01; _vr.raining = w >= RAINING;
      return _vr;
    }

    function rainfallAt(s) {
      const a = arc;
      if (!a) return intOf(G.raceWeather);
      const f = Math.min(1, Math.max(0, a.t / a.dur)), peak = intAt(a, f);
      if (a.r0s && hasRC()) {
        const len = G.track && G.track.total;
        const start = Number.isFinite(s) && len > 0 ? RainCells.sample(a.r0s, s / len) : a.i0;
        return start + (intOf(a.to) - start) * f;
      }
      if (!a.cell || !hasRC()) return peak;
      const len = G.track && G.track.total;
      const baseRain = typeof a.i0 === "number" ? a.i0 : intOf(a.from);
      const frac = Number.isFinite(s) && len > 0 ? s / len : a.cell.c0 + a.cell.v * a.t / a.cell.total;
      return baseRain + (peak - baseRain) * RainCells.strength(a.cell, frac, a.t);
    }
    function viewRainfall() { return rainfallAt(G.player && G.player.s); }
    function maxDev(a, target) {
      if (!(local(a) && hasRC())) return Math.abs(wetness() - target);
      const g = segs(a);
      let m = 0;
      for (let i = 0; i < g.length; i++) m = Math.max(m, Math.abs(g[i] - target));
      return m;
    }
    const hasTM = () => typeof TyreModel !== "undefined" && !!TyreModel && !!TyreModel.treadFor;
    const wetOf = (w) => { w = asRain(w); return hasTM() ? TyreModel.wetness(w, null) : (w === "rain" ? 1 : w === "wet" ? 0.5 : 0); };
    const treadOf = (w) => hasTM() ? TyreModel.treadFor(null, w) : (w >= 0.72 ? 2 : w >= 0.25 ? 1 : 0);
    let ownT = 0;
    const now = () => (typeof G.raceT === "number" && Number.isFinite(G.raceT)) ? G.raceT : ownT;

    function wetAt(a, e) {
      if (!(e > 0)) return a.w0;
      const w1 = wetOf(a.to), dur = a.dur, s = (w1 - a.w0) / dur, tau = s >= 0 ? TAU_WET : TAU_DRY;
      const ramp = (u) => a.w0 + s * u - s * tau * (1 - Math.exp(-u / tau));
      if (e <= dur) return ramp(e);
      const wE = ramp(dur);
      return w1 + (wE - w1) * Math.exp(-(e - dur) / (w1 >= wE ? TAU_WET : TAU_DRY));
    }
    function wetInOf(a) {
      if (local(a)) return wetInLocal(a);
      if (treadOf(a.w0) >= 1) return 0;
      if (treadOf(wetOf(a.to)) < 1) return null;
      let lo = 0, hi = a.dur + 20 * TAU_WET;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (treadOf(wetAt(a, m)) >= 1) hi = m; else lo = m; }
      return hi;
    }
    let _sw = null, _sv = 0;
    function wetness() {
      const a = arc;
      if (!a) {
        const w = G.raceWeather;
        if (w !== _sw) { _sv = wetOf(w); _sw = w; }
        return _sv;
      }
      if (typeof a.w0 !== "number") adopt(a);
      if (a._wt !== a.t) {
        a._wt = a.t;
        if (local(a)) { const g = segs(a); let m = 0; for (let i = 0; i < g.length; i++) m += g[i]; a._w = m / g.length; }
        else a._w = wetAt(a, a.t);
      }
      return a._w;
    }

    const local = (a) => !!a && (!!a.cell || !!a.w0s);
    const hasRC = () => typeof RainCells !== "undefined" && !!RainCells;
    function segAt(a, i, n, t) {
      return RainCells.segWet({
        rs: a.w0s ? a.w0s[i] : a.w0, w1: wetOf(a.to), dur: a.dur, wOut: a.w0, cell: a.cell || null,
        tauW: TAU_WET, tauD: TAU_DRY,
      }, RainCells.segFrac(i, n), t);
    }
    function segs(a) {
      if (a._st !== a.t || !a._sg) {
        const n = a.w0s ? a.w0s.length : RainCells.SEGS;
        const g = a._sg && a._sg.length === n ? a._sg : new Float64Array(n);
        for (let i = 0; i < n; i++) g[i] = segAt(a, i, n, a.t);
        a._sg = g; a._st = a.t;
      }
      return a._sg;
    }
    function wetnessAt(s, x) {
      const a = arc, len = G.track && G.track.total;
      let w = wetness();
      if (local(a) && hasRC() && len > 0 && Number.isFinite(s)) {
        if (typeof a.w0 !== "number") adopt(a);
        w = RainCells.sample(segs(a), s / len);
      }
      const k = a ? 1 : grooveFade();
      return k > 0 && Number.isFinite(x) && len > 0 && Number.isFinite(s) ? w * (1 - k * DRYLINE_K * dryLine(s / len, x) * Math.sqrt(Math.max(0, 1 - w))) : w;
    }
    const DRYLINE_FADE_S = 5;
    let grooveEnd = null;
    function settle() { arc = null; grooveEnd = now(); }
    function grooveFade() {
      if (grooveEnd == null) return 0;
      const e = now() - grooveEnd;
      if (!(e >= 0) || e >= DRYLINE_FADE_S) { grooveEnd = null; return 0; }
      return 1 - e / DRYLINE_FADE_S;
    }
    const DRYLINE_K = 0.6, DRYLINE_W = 2.2, DRYLINE_AMP = 2.5;
    let _grooveH = null;
    function grooveX(frac) {
      const n = 12, f = (frac - Math.floor(frac)) * n, i = Math.floor(f), u = f - i, k = u * u * (3 - 2 * u);
      if (!_grooveH) { _grooveH = new Float64Array(n); for (let j = 0; j < n; j++) _grooveH[j] = RainCells.h01("groove|" + j) * 2 - 1; }
      const a = _grooveH[((i % n) + n) % n], b = _grooveH[(((i + 1) % n) + n) % n];
      return DRYLINE_AMP * (a + (b - a) * k);
    }
    function dryLine(frac, x) {
      if (!hasRC()) return 0;
      const d = (x - grooveX(frac)) / DRYLINE_W;
      return Math.exp(-d * d);
    }
    function viewWetness() {
      const p = G.player;
      return p && Number.isFinite(p.s) ? wetnessAt(p.s, p.x) : wetness();
    }
    function wetMax(a) {
      const g = segs(a);
      let m = 0;
      for (let i = 0; i < g.length; i++) if (g[i] > m) m = g[i];
      return m;
    }
    function rainSectors() {
      const a = arc;
      if (!local(a) || !hasRC()) return null;
      if (typeof a.w0 !== "number") adopt(a);
      const def = G.track && G.track.def;
      return RainCells.sectors(segs(a), a.cell, a.t, def && def.sectors);
    }
    function wetInLocal(a) {
      const n = a.w0s ? a.w0s.length : RainCells.SEGS;
      const mean = (t) => { let m = 0; for (let i = 0; i < n; i++) m += segAt(a, i, n, t); return m / n; };
      if (treadOf(mean(0)) >= 1) return 0;
      const end = (a.cell ? a.cell.life : a.dur) + 10 * TAU_WET;
      for (let t = 2; t <= end; t += 2) {
        if (treadOf(mean(t)) >= 1) {
          let lo = t - 2, hi = t;
          for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (treadOf(mean(m)) >= 1) hi = m; else lo = m; }
          return hi;
        }
      }
      return null;
    }
    function adopt(a) {
      a.w0 = wetOf(a.from); a.seq = a.seq || arcSeq(a.from, a.to); a.wetIn = wetInOf(a);
      if (typeof a.i0 !== "number") a.i0 = intOf(a.from);
    }
    const intAt = (a, f) => {
      const i0 = typeof a.i0 === "number" ? a.i0 : intOf(a.from);
      if (a.cell && a.t >= a.cell.life) return i0;
      return i0 + (intOf(a.to) - i0) * f;
    };
    function stageFor(a, w, f) {
      const w0 = wetOf(a.from), w1 = wetOf(a.to);
      if (w0 === 0 && w1 === 0 && !(a.w0 > 0)) return a.seq[Math.min(a.seq.length - 1, Math.floor(f * a.seq.length))];
      const tread = treadOf(w);
      if (tread >= 2) return intAt(a, f) >= STORM_AT ? "storm" : "rain";
      if (tread >= 1) return "wet";
      return w1 === 0 ? a.to : w0 === 0 ? a.from : "dry";
    }

    function startArc(from, to, dur) {
      if (VALID.indexOf(from) < 0 || VALID.indexOf(to) < 0) return null;
      const live = !!arc;
      const w0 = live ? wetness() : wetOf(from);
      const i0 = live ? intAt(arc, Math.min(1, arc.t / arc.dur)) : intOf(from);
      if (from === to && (!live || (Math.abs(w0 - wetOf(to)) < SETTLE && Math.abs(i0 - intOf(to)) < SETTLE))) {
        if (live) { settle(); if (G.raceWeather !== to) setWeatherLive(to, true); }
        return null;
      }
      const t0 = (typeof G.raceT === "number" && G.state !== "race") ? 0 : now();
      const w0s = live && local(arc) && hasRC() ? Float64Array.from(segs(arc)) : null;
      const r0s = w0s && G.track ? Float64Array.from({ length: 128 }, (_, i) => rainfallAt(RainCells.segFrac(i, 128) * G.track.total)) : null;
      arc = { from, to, t: 0, dur: Math.max(1, dur || 60), seq: arcSeq(from, to), w0, i0, t0, _tt: 0 };
      if (w0s) arc.w0s = w0s;
      if (r0s) arc.r0s = r0s;
      arc.wetIn = wetInOf(arc);
      if (!live && G.raceWeather !== from) setWeatherLive(from);
      return arc;
    }
    function tick(dt) {
      if (dt > 0) ownT += dt;
      if (G.headlessMode) syncWetness(dt);
      if (!arc) return;
      if (typeof arc.w0 !== "number") adopt(arc);
      if (arc.t0 == null || arc.t !== arc._tt) arc.t0 = now() - (arc.t || 0);
      arc.t = arc._tt = Math.max(0, now() - arc.t0);
      const f = Math.min(1, arc.t / arc.dur);
      const loc = local(arc) && hasRC();
      const w = loc ? wetMax(arc) : wetness();
      const want = stageFor(arc, w, f);
      if (G.raceWeather !== want) { setWeatherLive(want, true); G.announce("WEATHER: " + want.toUpperCase(), 2, "info"); }
      const vr = viewRain(), vw = vr.w, wet = vr.wet, raining = vr.raining;
      if (loc && !(Math.abs(arc.t - (arc._secT == null ? -1 : arc._secT)) < 0.5)) {
        arc._secT = arc.t; arc.sectors = rainSectors();
        arc.where = arc.sectors ? arc.sectors.filter((o) => o.raining).map((o) => o.sector) : null;
      }
      if (wet !== arc.wet) {
        if (wet) reseedRain(vw);
        Particles.rainShow(wet);
      }
      if (wet !== arc.wet) {
        if (G.soundOn) { if (wet) GameAudio.startRain(); else GameAudio.stopRain(); }
      }
      arc.wet = wet; arc.raining = raining;
      if (arc.cell) {
        if (arc.t >= arc.cell.life && maxDev(arc, arc.w0) < SETTLE) {
          if (G.raceWeather !== arc.from) setWeatherLive(arc.from, true);
          settle();
        }
      } else if (f >= 1 && maxDev(arc, wetOf(arc.to)) < SETTLE) {
        if (G.raceWeather !== arc.to) setWeatherLive(arc.to, true);
        settle();
      }
    }

    function syncWetness(dt) {
      const frame = G.frame;
      if (!frame) return;
      const knobs = (typeof LightKnobs !== "undefined" && LightKnobs) ? LightKnobs.LT : null;
      const pin = knobs && typeof knobs.wetness === "number" ? knobs.wetness : -0.05;
      if (pin >= 0) {
        frame.wetness = pin;
        return;
      }
      const wetTarget = (local(arc) || (G.player && Number.isFinite(G.player.x))) && hasRC() ? viewWetness() : (G.trackWetness ? G.trackWetness() : 0);
      const cur = frame.wetness || 0;
      const step = (dt == null || !(dt > 0)) ? 1 : Math.min(1, dt * 0.8);
      frame.wetness = cur + (wetTarget - cur) * step;
    }

    return {
      setWeatherLive, setTimeOfDay, weather,
      startArc, tick, syncWetness, wetness, wetnessAt, dryLine, viewWetness, rainfallAt, viewRainfall, rainSectors, planFor, previewPlan, previewArc, startChangeable, endChangeable, restoreBase, endSession,
      get arc() { return arc; }, set arc(v) { arc = v; grooveEnd = null; if (!arc) setWeatherLive(G.raceWeather); },
      get changeable() { return changeable; }, set changeable(v) { changeable = v; },
      get plan() { return plan; }, set plan(v) { plan = v; },
    };
  }
  return { create, arcSeq, LADDER, VALID, TARGETS };
})();
Object.freeze(WeatherArc);
