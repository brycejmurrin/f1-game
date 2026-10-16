/* Apex 26 — LIVE WEATHER + the DYNAMIC WEATHER ARC (WeatherArc.create(G, deps)): the one path a session's weather changes through, and the optional per-race progression that walks it. The CHANGEABLE (MIXED) chip's plan lives here too; the lighting it re-applies is js/lighting/atmosphere.js. */
const WeatherArc = (function () {
  "use strict";

  // The ladder an arc walks STAGE BY STAGE. Lateral conditions (overcast, fog)
  // are not on it, so an arc into or out of one jumps direct. STORM (js/race/
  // storm.js) sits above rain: as wet a road, but heavier rain and no visibility.
  const LADDER = ["dry", "wet", "rain", "storm"];
  const VALID = ["dry", "wet", "rain", "overcast", "fog", "storm"];
  // What a CHANGEABLE race may be walked TO — the ladder plus the lateral pair.
  // The seed draws from the first five (the pre-storm list, so every existing
  // seed keeps its target); a drawn RAIN then escalates to STORM 1 in 4 —
  // never in a friend room, whose lobby does not know the word.
  const TARGETS = ["dry", "overcast", "wet", "rain", "fog", "storm"];
  const DRAWN = TARGETS.slice(0, 5);
  const STORM_ODDS = 0.25;
  const asRain = (w) => (w === "storm" ? "rain" : w);   // grip/tread: a storm is full rain (Storm.asRain)
  // ATMOSPHERIC INTENSITY, apart from road wetness: rain and storm are both a
  // wetness of 1, so the stage between them is read off this linear ramp
  // instead — STORM while the arc's intensity is past STORM_AT (and the road
  // is full-wet). Not lagged: a cloudburst arrives with the cloud.
  const INTENSITY = { wet: 0.5, rain: 1, storm: 1.5 };
  const intOf = (w) => INTENSITY[w] || 0;
  const STORM_AT = 1.25;

  function arcSeq(from, to) {
    const a = LADDER.indexOf(from), b = LADDER.indexOf(to);
    if (a >= 0 && b >= 0 && a !== b) {
      const seq = [];
      for (let i = a; (a < b) ? i <= b : i >= b; i += (a < b) ? 1 : -1) seq.push(LADDER[i]);
      return seq;   // e.g. dry→rain = [dry, wet, rain]; rain→dry = [rain, wet, dry]
    }
    return [from, to];
  }

  /** @param {*} G the js/game.js ctx façade.
   *  @param {*} deps the two SESSION-FORMAT predicates that stay in game.js —
   *  taken here rather than added to G, which already carries 265 members. */
  function create(G, deps) {
    Log.info("game", "WeatherArc.create");
    const { isTimeTrial, isQuali } = deps;

    // The live arc: { from, to, t, dur, seq }, or null when none is armed.
    // OFF by default — nothing starts one unless __apex.weatherArc(from, to,
    // secs) or the MIXED chip (startChangeable, below) asks for it.
    let arc = null;
    // CHANGEABLE conditions (the MIXED chip). The target and the transition
    // length come from the sim seed and the race counter — the reliability idiom
    // — so a solo race is reproducible and the makeCars stream is untouched. In a
    // friend race the HOST's plan rides in SETTINGS (lobby wxArc): seeds are not
    // shared between peers, so a guest must never derive its own.
    let changeable = false;
    let plan = null;     // { to, dur } from the host, else derived at start
    let base = null;     // the chip's weather, restored when the arc's race ends

    // ── Live weather switch (shared path) ───────────────────────────────────
    // The single way weather changes mid-session: sets raceWeather, re-seeds the
    // rain overlay, flips the rain audio and re-applies the frame lighting. Used
    // by __apex.weather() and the arc progression below, so every consumer (rain
    // layer, audio, lighting, AI grip, wetness ramp target) follows no matter who
    // initiated the change.
    function setWeatherLive(w, blend) {   // blend: true = cross-fade the lighting (the arc); omitted = cut
      G.raceWeather = (VALID.indexOf(w) >= 0) ? w : "dry";
      // Storm rain is heavier: set the streak scale BEFORE the reseed below.
      if (typeof Particles !== "undefined" && Particles.rainIntensity && typeof Storm !== "undefined") Particles.rainIntensity(Storm.rainK(G.raceWeather));
      // The VIEW's road (viewWetness): under a local shower the rain falls where the camera is, not lap-wide.
      const v = viewRain();
      if (v.wet) {   // rain = storm, wet = drizzle tier (see applyRaceSettings)
        reseedRain(v.w);
        Particles.rainShow(true);
      } else {
        Particles.rainShow(false);
      }
      if (G.soundOn) { if (v.raining) GameAudio.startRain(); else GameAudio.stopRain(); }
      // Re-apply the frame lighting NOW: without this a live weather change only
      // moved the wetness ramp / rain overlay — the cloud cover, muted sun,
      // ambient lift, fog density and exposure branches in applyRaceSettings
      // silently kept the previous weather (fog looked like a clear day).
      if (G.track) G.applyRaceSettings(blend);   // true: Atmosphere cross-fades over WX_BLEND_S; a chip or __apex cuts
      return G.raceWeather;
    }

    // Live time-of-day + weather for player UI (lighting tuner) and __apex. The
    // agent surface is absent on GitHub Pages, so anything player-facing must go
    // through G — not window.__apex.
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
      arc = null;
      return setWeatherLive(w);
    }

    /** The distance a MIXED plan is capped for. G.lapsTarget is only the CURRENT
     *  session's once a race is counting down or running; before that it still
     *  holds the LAST session's (1 after qualifying, 4 after a time trial), so the
     *  host's lobby shipped a plan capped for the wrong distance and the guest
     *  adopted it unchanged. Outside a live race the choice on the sheet decides. */
    function capLaps() {
      const live = G.state === "race" || G.state === "count";
      return live ? ((G.lapsTarget | 0) || (G.raceLaps | 0)) : (G.raceLaps | 0);
    }
    /** Cap a derived MIXED walk so a 3–5 lap race still reaches `to` before the
     *  flag. The seed still draws 2–7 minutes; a host-supplied wxArc.dur is
     *  never recapped (the lobby already agreed those seconds). ~48 m/s is a
     *  conservative race-average so a street circuit is not over-cut. */
    function capPlanDur(dur) {
      dur = Math.max(1, dur | 0);
      const laps = capLaps();
      const len = G.track && G.track.total;
      if (!(laps > 0) || !(len > 0)) return dur;
      const cap = Math.max(90, Math.floor(laps * (len / 48) * 0.72));
      return Math.min(dur, cap);
    }
    // The seed the plan draws from: the same selector as reliability, launch and
    // qualifying (game.js luckSeed, quali-model.js) — a career's season seed, a
    // standalone Season's stamped one (SeasonCal.luckSeed, so a reload cannot
    // re-roll the rain), else the session's.
    function planSeed() {
      if (typeof Career !== "undefined" && Career.inCareer && Career.inCareer() && Career.seasonSeed) return Career.seasonSeed();
      if (G.flow === "season" && G.season && typeof SeasonCal !== "undefined" && SeasonCal.luckSeed) {
        return SeasonCal.luckSeed(G.season, G.simSeed());
      }
      return G.simSeed();
    }
    // planFor() is read twice for one race: by the host's lobby when it ships
    // SETTINGS, and by startChangeable() at the green. It is a pure function of
    // the inputs in `memoKey`, so it is remembered until one of them changes and
    // the two reads cannot disagree.
    let memo = null;     // { key, plan }
    /** The CHANGEABLE plan derived from (sim seed, race counter): 2–7 minutes
     *  to a target that is never the weather we start on, then capPlanDur. */
    function planFor() {
      const seed = planSeed();
      const round = (G.seasonMode && typeof SeasonCal !== "undefined" && SeasonCal.drawRound && G.season)
        ? SeasonCal.drawRound(G.season) : G.raceRound;
      // `base` is the weather the armed race STARTED on: raceWeather itself walks
      // away from it during the arc.
      const from = base != null ? base : G.raceWeather;
      const room = !!(G.netRoom || (G.netPlay && G.netPlay.active && G.netPlay.active()));
      const key = [seed, round, from, capLaps(), G.track && G.track.total, room].join("|");
      if (memo && memo.key === key) return { to: memo.plan.to, dur: memo.plan.dur };
      const r = (k) => Career.hash(seed, round, "wx", k);
      const opts = DRAWN.filter((w) => w !== from);
      let to = opts[Math.floor(r("to") * opts.length)] || "wet";
      if (to === "rain" && !room && from !== "storm" && r("storm") < STORM_ODDS) to = "storm";
      const dur = capPlanDur(120 + Math.floor(r("dur") * 300));
      memo = { key, plan: { to, dur } };
      return { to, dur };
    }
    function startChangeable() {
      if (!changeable || isTimeTrial() || isQuali()) return null;
      const p = plan || planFor();
      base = G.raceWeather;
      const a = startArc(G.raceWeather, p.to, p.dur);
      // A LOCAL SHOWER (js/race/rain-cells.js): drawn from the start weather, the plan and the track length —
      // what both peers of a friend race already hold — so host and guest derive the same cell.
      if (a && typeof RainCells !== "undefined" && G.track) {
        a.cell = RainCells.forPlan(a.from, a.to, a.dur, G.track.total, wetOf);
        if (a.cell) a.wetIn = wetInOf(a);
      }
      if (a) Log.info("game", "changeable " + G.raceWeather + " -> " + p.to + " over " + p.dur + " s" + (a && a.cell ? " (local shower, " + Math.round(a.cell.h * 200) + "% of the lap)" : ""));
      return a;
    }
    function endChangeable(keepPlan) {
      if (base != null && G.raceWeather !== base) G.raceWeather = base;   // the chip's pick, not where the arc ended
      base = null;
      // The plan is the HOST's for the duration of one networked race. Keeping it
      // afterwards made a guest's later SOLO changeable races replay that host's
      // {to, dur} instead of deriving their own from the seed. `keepPlan` is the
      // agent's race()/tt(): a start follows at once, and a plan set for THAT
      // race (a host's, a test's) must reach startChangeable like restoreBase().
      if (!keepPlan && !G.netPlay.active()) plan = null;
    }
    /** startRace's re-arm, from INSIDE a running race (pm-restart): restore the
     *  chip's pick and drop the half-walked arc, but KEEP the plan — a host's
     *  plan for THIS race is set before startRace runs, and endChangeable()
     *  would throw it away. startChangeable() re-arms after. */
    function restoreBase() {
      if (base != null && G.raceWeather !== base) G.raceWeather = base;
      base = null;
      arc = null;
    }
    /** The flag, or a quit to the menu: an arc that outlived the race would
     *  become the next race's starting weather. Restoring the chip's pick also
     *  re-lights for it (a CUT apply, which drops an in-flight fade) and hides
     *  the rain: the fade is ticked only in a race, so otherwise the results and
     *  the menu kept the arc's last sky until the next flyby. */
    function endSession(keepPlan) {
      arc = null;
      const restored = base != null && G.raceWeather !== base;
      endChangeable(keepPlan);
      if (restored && G.track) { Particles.rainShow(false); G.applyRaceSettings(); }
    }

    // ── Dynamic weather progression ─────────────────────────────────────────
    // The arc walks the dry↔wet↔rain ladder stage by stage over its duration,
    // flipping each stage through setWeatherLive() so the rain overlay / audio /
    // lighting / AI grip all follow, and frame.wetness ramps via the existing
    // per-frame ramp. Ticked from game.js update() on the fixed physics clock,
    // so it also runs under __apex.headless.
    //
    // WETNESS IS A LAGGED STATE, not the arc's linear ramp. The ramp is the
    // TARGET (from w0 — the road's wetness when the arc was armed — to the
    // destination's over `dur`); the road chases it as a first-order lag that
    // wets quickly and dries ~4.5x slower, because standing water takes laps to
    // clear once rain stops (the slick crossover comes laps after a shower:
    // https://www.pirelli.com/global/en-ww/race/when-it-s-time-to-change-from-slick-to-wet-tyres-in-formula-1 ).
    // The lag is solved in CLOSED FORM on the arc's elapsed time (wetAt), so it
    // is a pure function of the clock — frame-rate independent, and identical
    // on every peer sharing it. The stage (raceWeather: sky, announce, rain
    // loop) is read OFF that wetness with the tyre model's own thresholds, so
    // the road can no longer be inter-wet under a sky that still reads dry. An
    // arc stays armed past `dur` until the road has settled on its target.
    const TAU_WET = 8, TAU_DRY = 36;   // s: the lag wetting / drying (4.5x slower)
    const SETTLE = 0.005;              // |wetness - target| that ends an arc
    const WET_ROAD = 0.25, RAINING = 0.72;   // game.js isWetRoad / isRaining (TyreModel.treadFor's ladder)
    // game.js initRainDrops picks the tier off the LAP's wetness; under a local
    // shower the tier is the view's (drizzle between the two lines).
    const reseedRain = (vw) => { if (local(arc) && typeof Particles !== "undefined" && Particles.rainSeed) Particles.rainSeed(vw >= WET_ROAD && vw < RAINING); else G.initRainDrops(); };
    // Rain shown / rain loop: G's lap-wide predicates, or the VIEW's road under a local shower.
    const _vr = { w: 0, wet: false, raining: false };
    function viewRain() {
      if (local(arc) && hasRC()) { const w = viewWetness(); _vr.w = w; _vr.wet = w >= WET_ROAD; _vr.raining = w >= RAINING; }
      else { _vr.w = -1; _vr.wet = !!G.isWetRoad(); _vr.raining = !!G.isRaining(); }
      return _vr;
    }
    /** The largest |segment − target| of a local arc (the scalar's own gap otherwise). */
    function maxDev(a, target) {
      if (!(local(a) && hasRC())) return Math.abs(wetness() - target);
      const g = segs(a);
      let m = 0;
      for (let i = 0; i < g.length; i++) m = Math.max(m, Math.abs(g[i] - target));
      return m;
    }
    // What a weather means as wetness, and the tread ladder that splits it:
    // TyreModel's own (wetValue via wetness(w, null); treadFor — 0.25 inter,
    // 0.72 full wet), with the same numbers inline for a VM with no tyre model.
    const hasTM = () => typeof TyreModel !== "undefined" && !!TyreModel && !!TyreModel.treadFor;
    const wetOf = (w) => { w = asRain(w); return hasTM() ? TyreModel.wetness(w, null) : (w === "rain" ? 1 : w === "wet" ? 0.5 : 0); };
    const treadOf = (w) => hasTM() ? TyreModel.treadFor(null, w) : (w >= 0.72 ? 2 : w >= 0.25 ? 1 : 0);
    // THE SHARED RACE CLOCK. game.js snaps raceT to the host's wall clock in a
    // friend race; summed sim dt drops time to the 5-step cap and background
    // tabs, so two peers summing dt walked different wetness → different grip.
    // A stub G without raceT (unit VMs) runs on summed dt instead.
    let ownT = 0;
    const now = () => (typeof G.raceT === "number" && Number.isFinite(G.raceT)) ? G.raceT : ownT;

    /** Road wetness `e` s into arc `a`: the exact solution of dw/dt = (target-w)/τ
     *  for the linear ramp (w(0) = w0), then for the constant target past `dur`. */
    function wetAt(a, e) {
      if (!(e > 0)) return a.w0;
      const w1 = wetOf(a.to), dur = a.dur, s = (w1 - a.w0) / dur, tau = s >= 0 ? TAU_WET : TAU_DRY;
      const ramp = (u) => a.w0 + s * u - s * tau * (1 - Math.exp(-u / tau));
      if (e <= dur) return ramp(e);
      const wE = ramp(dur);
      return w1 + (wE - w1) * Math.exp(-(e - dur) / (w1 >= wE ? TAU_WET : TAU_DRY));
    }
    /** Seconds into `a` at which the road turns inter-wet (0.25): 0 if it
     *  already is, null if this arc never gets there — what the engineer's
     *  "rain in N laps" counts to. Monotone within one arc, so bisection. */
    function wetInOf(a) {
      if (local(a)) return wetInLocal(a);
      if (treadOf(a.w0) >= 1) return 0;
      if (treadOf(wetOf(a.to)) < 1) return null;
      let lo = 0, hi = a.dur + 20 * TAU_WET;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (treadOf(wetAt(a, m)) >= 1) hi = m; else lo = m; }
      return hi;
    }
    /** game.js trackWetness(): the live road wetness — the LAP MEAN under a
     *  local shower (what tread advice and pit calls read, so a half-wet lap is
     *  a dilemma, not a verdict). No arc → the weather's own value. Cached per
     *  arc.t (gripMult reads it per car, per step). */
    function wetness() {
      const a = arc;
      if (!a) return wetOf(G.raceWeather);
      if (typeof a.w0 !== "number") adopt(a);
      if (a._wt !== a.t) {
        a._wt = a.t;
        if (local(a)) { const g = segs(a); let m = 0; for (let i = 0; i < g.length; i++) m += g[i]; a._w = m / g.length; }
        else a._w = wetAt(a, a.t);
      }
      return a._w;
    }

    // ── Localized rain (js/race/rain-cells.js) ──────────────────────────────
    // An arc is LOCAL when it carries a rain cell (a MIXED shower) or a per-
    // segment start (`w0s`: a re-target of a local arc, so a half-wet lap is
    // not flattened to its mean). Then the road is a grid of RainCells.SEGS
    // segments, each with WeatherArc's exact closed-form lag; otherwise every
    // position reads the one scalar above, exactly as before.
    const local = (a) => !!a && (!!a.cell || !!a.w0s);
    const hasRC = () => typeof RainCells !== "undefined" && !!RainCells;
    function segAt(a, i, n, t) {
      return RainCells.segWet({
        rs: a.w0s ? a.w0s[i] : a.w0, w1: wetOf(a.to), dur: a.dur, wOut: a.w0, cell: a.cell || null,
        tauW: TAU_WET, tauD: TAU_DRY,
      }, RainCells.segFrac(i, n), t);
    }
    /** The segment grid at the arc's own clock, cached per arc.t. */
    function segs(a) {
      if (a._st !== a.t || !a._sg) {
        const n = a.w0s ? a.w0s.length : RainCells.SEGS;
        const g = a._sg && a._sg.length === n ? a._sg : new Float64Array(n);
        for (let i = 0; i < n; i++) g[i] = segAt(a, i, n, a.t);
        a._sg = g; a._st = a.t;
      }
      return a._sg;
    }
    /** Road wetness at arc position `s` (metres) — the SURFACE under that car.
     *  Global weather (no local arc) is the scalar wetness(). */
    function wetnessAt(s) {
      const a = arc, len = G.track && G.track.total;
      if (!local(a) || !hasRC() || !(len > 0) || !Number.isFinite(s)) return wetness();
      if (typeof a.w0 !== "number") adopt(a);
      return RainCells.sample(segs(a), s / len);
    }
    /** What the VIEW stands on: the followed car's (camera's) position, so the
     *  rain starts and stops as you drive into and out of a shower. */
    function viewWetness() {
      const p = G.player;
      return p && Number.isFinite(p.s) ? wetnessAt(p.s) : wetness();
    }
    /** The wettest segment: what the SKY shows (a shower anywhere darkens the
     *  circuit's one sky) and what ends a local arc once it has dried. */
    function wetMax(a) {
      const g = segs(a);
      let m = 0;
      for (let i = 0; i < g.length; i++) if (g[i] > m) m = g[i];
      return m;
    }
    /** Per-sector picture for the engineer / forecast: [{sector, wet, raining}],
     *  1-based on the circuit's own splits. null when the rain is lap-wide. */
    function rainSectors() {
      const a = arc;
      if (!local(a) || !hasRC()) return null;
      if (typeof a.w0 !== "number") adopt(a);
      const def = G.track && G.track.def;
      return RainCells.sectors(segs(a), a.cell, a.t, def && def.sectors);
    }
    /** wetInOf for a local arc: the first second the LAP MEAN turns inter-wet
     *  (treadFor's crossing — when the tread advice flips), null if a narrow
     *  shower never wets enough of the lap. The mean rises then falls (the
     *  shower passes), so a 2 s scan finds the bracket and bisection the edge. */
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
    // An arc assigned from outside (G.weatherArc = a restored tuner snapshot).
    function adopt(a) {
      a.w0 = wetOf(a.from); a.seq = a.seq || arcSeq(a.from, a.to); a.wetIn = wetInOf(a);
      if (typeof a.i0 !== "number") a.i0 = intOf(a.from);
    }
    /** The arc's atmospheric intensity at progress f (0..1). */
    const intAt = (a, f) => {
      const i0 = typeof a.i0 === "number" ? a.i0 : intOf(a.from);
      if (a.cell && a.t >= a.cell.life) return i0;   // the shower has passed: no cloudburst over a drying road
      return i0 + (intOf(a.to) - i0) * f;
    };
    /** The stage the sky shows at road wetness `w`. Between two dry-side
     *  conditions (overcast ↔ fog) wetness never moves, so that walk keeps
     *  flipping its stage list by time. */
    function stageFor(a, w, f) {
      const w0 = wetOf(a.from), w1 = wetOf(a.to);
      if (w0 === 0 && w1 === 0 && !(a.w0 > 0)) return a.seq[Math.min(a.seq.length - 1, Math.floor(f * a.seq.length))];
      const tread = treadOf(w);
      if (tread >= 2) return intAt(a, f) >= STORM_AT ? "storm" : "rain";
      if (tread >= 1) return "wet";
      return w1 === 0 ? a.to : w0 === 0 ? a.from : "dry";
    }

    /** Arm an arc. A call while one is live RE-TARGETS it: the new ramp starts
     *  from the road's wetness NOW, not `from`'s nominal value, so grip does
     *  not jump; and `from === to` is then allowed — a dry→rain arc still
     *  reading "dry" can be sent back to dry. An arc armed outside a race
     *  starts at the green (raceT 0, the instant every peer zeroes). */
    function startArc(from, to, dur) {
      if (VALID.indexOf(from) < 0 || VALID.indexOf(to) < 0) return null;
      const live = !!arc;
      const w0 = live ? wetness() : wetOf(from);
      const i0 = live ? intAt(arc, Math.min(1, arc.t / arc.dur)) : intOf(from);
      if (from === to && (!live || (Math.abs(w0 - wetOf(to)) < SETTLE && Math.abs(i0 - intOf(to)) < SETTLE))) {
        if (live) { arc = null; if (G.raceWeather !== to) setWeatherLive(to, true); }
        return null;
      }
      const t0 = (typeof G.raceT === "number" && G.state !== "race") ? 0 : now();
      const w0s = live && local(arc) && hasRC() ? Float64Array.from(segs(arc)) : null;
      arc = { from, to, t: 0, dur: Math.max(1, dur || 60), seq: arcSeq(from, to), w0, i0, t0, _tt: 0 };
      if (w0s) arc.w0s = w0s;
      arc.wetIn = wetInOf(arc);
      if (!live && G.raceWeather !== from) setWeatherLive(from);
      return arc;
    }
    function tick(dt) {
      // render() is the ONE producer of frame.wetness (it feeds the shaders at
      // the frame rate); the physics tick only stands in for it when no render
      // runs (headless look=drive), else the lag integrated twice per frame and
      // ramped at ~2x the 0.8/s that frame.rain uses.
      if (dt > 0) ownT += dt;
      if (G.headlessMode) syncWetness(dt);
      if (!arc) return;
      if (typeof arc.w0 !== "number") adopt(arc);
      // Progress is READ off the shared clock, never summed. A written arc.t
      // (a test, the tuner, a seek) re-bases t0 so the poke sticks.
      if (arc.t0 == null || arc.t !== arc._tt) arc.t0 = now() - (arc.t || 0);
      arc.t = arc._tt = Math.max(0, now() - arc.t0);
      const f = Math.min(1, arc.t / arc.dur);
      const loc = local(arc) && hasRC();
      const w = loc ? wetMax(arc) : wetness();   // a local shower: the sky shows its wettest segment
      const want = stageFor(arc, w, f);
      if (G.raceWeather !== want) { setWeatherLive(want, true); G.announce("WEATHER: " + want.toUpperCase(), 2, "info"); }
      // The rain follows WETNESS (isWetRoad ≥ 0.25 shows the field, isRaining
      // ≥ 0.72 picks the storm tier and the rain loop). The stage now reads the
      // same wetness, but an overcast/fog walk still flips by time, so show,
      // tier and loop are re-decided on each crossing (until 2026-10-04 a
      // drying race left a frozen box of streaks for the rest of it).
      const vr = viewRain(), vw = vr.w, wet = vr.wet, raining = vr.raining;   // isWetRoad/isRaining, off the VIEW's road under a shower
      // A local shower's sector picture, published ON THE ARC (G.weatherArc.sectors / .where) for the engineer
      // and the forecast — refreshed every 0.5 s of arc time, not per step.
      if (loc && !(Math.abs(arc.t - (arc._secT == null ? -1 : arc._secT)) < 0.5)) {
        arc._secT = arc.t; arc.sectors = rainSectors();
        arc.where = arc.sectors ? arc.sectors.filter((o) => o.raining).map((o) => o.sector) : null;
      }
      if (arc.wet !== undefined && (wet !== arc.wet || (wet && raining !== arc.raining))) {
        if (wet) reseedRain(vw);   // reseed: drizzle below 0.72, storm above
        Particles.rainShow(wet);
      }
      if (raining !== arc.raining) {
        if (arc.raining !== undefined && G.soundOn) { if (raining) GameAudio.startRain(); else GameAudio.stopRain(); }
      }
      arc.wet = wet; arc.raining = raining;
      if (arc.cell) {
        // A shower ENDS: past its life every segment dries back to the start
        // weather, and once the wettest is there the arc lets go of the road.
        if (arc.t >= arc.cell.life && maxDev(arc, arc.w0) < SETTLE) {
          if (G.raceWeather !== arc.from) setWeatherLive(arc.from, true);
          arc = null;
        }
      } else if (f >= 1 && maxDev(arc, wetOf(arc.to)) < SETTLE) {
        if (G.raceWeather !== arc.to) setWeatherLive(arc.to, true);
        arc = null;   // the road has settled — weather stays at `to`
      }
    }

    // Continuous track wetness → frame.wetness for every renderer. LightKnobs.LT
    // wetness ≥ 0 is the LIVE tuner / localStorage diagnostic pin only — shipped
    // LightPresets must leave the knob at AUTO (−0.05) so dry cannot look wet.
    function syncWetness(dt) {
      const frame = G.frame;
      if (!frame) return;
      const knobs = (typeof LightKnobs !== "undefined" && LightKnobs) ? LightKnobs.LT : null;
      const pin = knobs && typeof knobs.wetness === "number" ? knobs.wetness : -0.05;
      if (pin >= 0) {
        frame.wetness = pin;
        return;
      }
      // The VIEW's road: the lap mean (trackWetness) unless a local shower makes it position-dependent.
      const wetTarget = local(arc) && hasRC() ? viewWetness() : (G.trackWetness ? G.trackWetness() : 0);
      const cur = frame.wetness || 0;
      const step = (dt == null || !(dt > 0)) ? 1 : Math.min(1, dt * 0.8);
      frame.wetness = cur + (wetTarget - cur) * step;
    }

    return {
      setWeatherLive, setTimeOfDay, weather,
      startArc, tick, syncWetness, wetness, wetnessAt, viewWetness, rainSectors, planFor, startChangeable, endChangeable, restoreBase, endSession,
      get arc() { return arc; }, set arc(v) { arc = v; },
      get changeable() { return changeable; }, set changeable(v) { changeable = v; },
      get plan() { return plan; }, set plan(v) { plan = v; },
    };
  }
  return { create, arcSeq, LADDER, VALID, TARGETS };
})();
Object.freeze(WeatherArc);
