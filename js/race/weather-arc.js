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
    function setWeatherLive(w) {
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
      if (G.track) G.applyRaceSettings();
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

    /** The CHANGEABLE plan derived from (sim seed, race counter): 2–7 minutes
     *  to a target that is never the weather we start on. */
    function planFor() {
      const r = (k) => {
        const seed = (typeof Career !== "undefined" && Career.inCareer && Career.inCareer() && Career.seasonSeed)
          ? Career.seasonSeed() : G.simSeed();
        const round = (G.seasonMode && typeof SeasonCal !== "undefined" && SeasonCal.drawRound && G.season)
          ? SeasonCal.drawRound(G.season) : G.raceRound;
        return Career.hash(seed, round, "wx", k);
      };
      const opts = TARGETS.filter((w) => w !== G.raceWeather);
      const to = opts[Math.floor(r("to") * opts.length)] || "wet";
      const dur = 120 + Math.floor(r("dur") * 300);   // 2–7 minutes of transition
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
    function endChangeable() {
      if (base != null && G.raceWeather !== base) G.raceWeather = base;   // the chip's pick, not where the arc ended
      base = null;
      // The plan is the HOST's for the duration of one networked race. Keeping it
      // afterwards made a guest's later SOLO changeable races replay that host's
      // {to, dur} instead of deriving their own from the seed.
      if (!G.netPlay.active()) plan = null;
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
     *  become the next race's starting weather. */
    function endSession() { arc = null; endChangeable(); }

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
      if (!arc) return;
      arc.t += dt;
      const f = Math.min(1, arc.t / arc.dur);
      const seq = arc.seq;
      const want = seq[Math.min(seq.length - 1, Math.floor(f * seq.length))];
      if (G.raceWeather !== want) { setWeatherLive(want); G.announce("WEATHER: " + want.toUpperCase(), 2, "info"); }
      if (f >= 1) {
        if (G.raceWeather !== arc.to) setWeatherLive(arc.to);
        arc = null;   // arc complete — weather stays at `to`
      }
    }

    return {
      setWeatherLive, setTimeOfDay, weather,
      startArc, tick, planFor, startChangeable, endChangeable, restoreBase, endSession,
      get arc() { return arc; }, set arc(v) { arc = v; },
      get changeable() { return changeable; }, set changeable(v) { changeable = v; },
      get plan() { return plan; }, set plan(v) { plan = v; },
    };
  }
  return { create, arcSeq };
})();
Object.freeze(WeatherArc);
