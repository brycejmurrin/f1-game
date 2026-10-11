/* Apex 26 — LIVE WEATHER + the DYNAMIC WEATHER ARC (WeatherArc.create(G, deps)): the one path a session's weather changes through, and the optional per-race progression that walks it. The CHANGEABLE (MIXED) chip's plan lives here too; the lighting it re-applies is js/lighting/atmosphere.js. */
const WeatherArc = (function () {
  "use strict";

  // The ladder an arc walks STAGE BY STAGE. Lateral conditions (overcast, fog)
  // are not on it, so an arc into or out of one jumps direct.
  const LADDER = ["dry", "wet", "rain"];
  const VALID = ["dry", "wet", "rain", "overcast", "fog"];
  // What a CHANGEABLE race may be walked TO — the ladder plus the lateral pair.
  const TARGETS = ["dry", "overcast", "wet", "rain", "fog"];

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
      G.raceWeather = (w === "wet" || w === "rain" || w === "overcast" || w === "fog") ? w : "dry";
      if (G.isWetRoad()) {   // rain = storm, wet = drizzle tier (see applyRaceSettings)
        G.initRainDrops();
        Particles.rainShow(true);
      } else {
        Particles.rainShow(false);
      }
      if (G.soundOn) { if (G.isRaining()) GameAudio.startRain(); else GameAudio.stopRain(); }
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
      const key = [seed, round, from, capLaps(), G.track && G.track.total].join("|");
      if (memo && memo.key === key) return { to: memo.plan.to, dur: memo.plan.dur };
      const r = (k) => Career.hash(seed, round, "wx", k);
      const opts = TARGETS.filter((w) => w !== from);
      const to = opts[Math.floor(r("to") * opts.length)] || "wet";
      const dur = capPlanDur(120 + Math.floor(r("dur") * 300));
      memo = { key, plan: { to, dur } };
      return { to, dur };
    }
    function startChangeable() {
      if (!changeable || isTimeTrial() || isQuali()) return null;
      const p = plan || planFor();
      base = G.raceWeather;
      const a = startArc(G.raceWeather, p.to, p.dur);
      if (a) Log.info("game", "changeable " + G.raceWeather + " -> " + p.to + " over " + p.dur + " s");
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
    function startArc(from, to, dur) {
      if (VALID.indexOf(from) < 0 || VALID.indexOf(to) < 0 || from === to) return null;
      arc = { from, to, t: 0, dur: Math.max(1, dur || 60), seq: arcSeq(from, to) };
      if (G.raceWeather !== from) setWeatherLive(from);
      return arc;
    }
    function tick(dt) {
      // render() is the ONE producer of frame.wetness (it feeds the shaders at
      // the frame rate); the physics tick only stands in for it when no render
      // runs (headless look=drive), else the lag integrated twice per frame and
      // ramped at ~2x the 0.8/s that frame.rain uses.
      if (G.headlessMode) syncWetness(dt);
      if (!arc) return;
      arc.t += dt;
      const f = Math.min(1, arc.t / arc.dur);
      const seq = arc.seq;
      const want = seq[Math.min(seq.length - 1, Math.floor(f * seq.length))];
      if (G.raceWeather !== want) { setWeatherLive(want, true); G.announce("WEATHER: " + want.toUpperCase(), 2, "info"); }
      // The rain follows WETNESS (isWetRoad ≥ 0.25 shows the field, isRaining
      // ≥ 0.72 picks the storm tier and the rain loop), which an arc ramps
      // continuously — and the stage flips above land off those lines: rain→dry
      // flips "dry" at 0.333 (still wet, so it seeded and showed), dry→rain
      // flips "rain" at 0.667 (still drizzle). Until 2026-10-04 only the audio
      // was re-decided here, so a drying race left a frozen box of streaks
      // hanging for the rest of it and a storm ran on drizzle-tier drops.
      // Re-decide visibility, tier and loop on each crossing.
      const wet = G.isWetRoad(), raining = G.isRaining();
      if (arc.wet !== undefined && (wet !== arc.wet || (wet && raining !== arc.raining))) {
        if (wet) G.initRainDrops();   // reseed: drizzle below 0.72, storm above
        Particles.rainShow(wet);
      }
      if (raining !== arc.raining) {
        if (arc.raining !== undefined && G.soundOn) { if (raining) GameAudio.startRain(); else GameAudio.stopRain(); }
      }
      arc.wet = wet; arc.raining = raining;
      if (f >= 1) {
        if (G.raceWeather !== arc.to) setWeatherLive(arc.to, true);
        arc = null;   // arc complete — weather stays at `to`
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
      const wetTarget = G.trackWetness ? G.trackWetness() : 0;
      const cur = frame.wetness || 0;
      const step = (dt == null || !(dt > 0)) ? 1 : Math.min(1, dt * 0.8);
      frame.wetness = cur + (wetTarget - cur) * step;
    }

    return {
      setWeatherLive, setTimeOfDay, weather,
      startArc, tick, syncWetness, planFor, startChangeable, endChangeable, restoreBase, endSession,
      get arc() { return arc; }, set arc(v) { arc = v; },
      get changeable() { return changeable; }, set changeable(v) { changeable = v; },
      get plan() { return plan; }, set plan(v) { plan = v; },
    };
  }
  return { create, arcSeq };
})();
Object.freeze(WeatherArc);
