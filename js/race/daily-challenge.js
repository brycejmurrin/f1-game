/* Apex 26 — DAILY CHALLENGE: one time-trial plan per UTC day, derived from the date alone (circuit, weather, time of day, sim seed), with a per-day best, a streak and a shareable result line. No server: every player who opens the game on the same day gets the same plan. */
const DailyChallenge = (function () {
  "use strict";

  const KEY = "daily.v1";   // store adds the apex26. prefix
  const HISTORY_DAYS = 60;
  // Weighted toward dry so most days are a clean lap; the rest are the game's
  // real conditions (game.js WEATHER chips). Time of day includes night, which
  // loadTrack lights per circuit.
  const WEATHER = ["dry", "dry", "overcast", "wet", "rain", "fog"];
  const TOD = ["default", "dawn", "day", "dusk", "night"];

  // Hash32 primitives only — never Career.hash: a career seed must not move the daily plan.
  function pick(day, field, n) { return Hash32.mix(Hash32.fnv1a("daily:" + day + ":" + field)) % n; }

  // UTC day, YYYY-MM-DD — the one calendar every player shares.
  function dayKey(d) { return (d || new Date()).toISOString().slice(0, 10); }
  function prevDay(day) {
    const d = new Date(day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // The plan is a pure function of the day. Circuits are drawn from the
  // championship calendar BY ID (Tracks.SEASON), never by list index.
  function plan(day = dayKey()) {
    const pool = Tracks.SEASON;
    const track = pool[pick(day, "track", pool.length)];
    return {
      day, trackId: track.id, trackName: track.name || track.id,
      weather: WEATHER[pick(day, "wx", WEATHER.length)],
      tod: TOD[pick(day, "tod", TOD.length)],
      seed: Hash32.mix(Hash32.fnv1a("daily:" + day)) || 1,
    };
  }

  function create(G) {
    Log.info("game", "DailyChallenge.create");
    const { store } = G;
    let active = null;   // the plan of the session being driven, else null

    function data() {
      const raw = store.get(KEY, null);
      const d = raw && typeof raw === "object" ? raw : {};
      const days = d.days && typeof d.days === "object" ? d.days : {};
      const st = d.streak && typeof d.streak === "object" ? d.streak : {};
      return { days, streak: { count: Number.isInteger(st.count) ? st.count : 0, last: typeof st.last === "string" ? st.last : null } };
    }
    function today() { return data().days[dayKey()] || null; }

    // Stage the plan as a TIME TRIAL without starting it. The circuit picker
    // uses this so DAILY follows the same select → NEXT → RACE SETTINGS → RACE!
    // contract as every circuit button; open() remains the explicit direct-start
    // API for the title door and scripted hooks.
    function select(day, mode = "standard") {
      const p = plan(day);
      const idx = Tracks.LIST.findIndex((t) => t.id === p.trackId);
      if (idx < 0) return null;
      if (G.records) G.records.restoreDaily();
      G.flow = "gp"; G.timeTrial = true;
      G.trackIdx = idx;
      G.raceWeather = p.weather; G.raceTimeOfDay = p.tod;
      G.raceLaps = G.ttDistance;
      G.seed = p.seed;
      active = p;
      p.class = mode === "standard" && G.records ? "standard" : "open";
      if (p.class === "standard") G.records.prepareDaily();
      Log.info("game", "DailyChallenge.select " + p.day + " " + p.trackId + " " + p.weather + " " + p.tod);
      return p;
    }

    // Explicit direct start (main-menu DAILY and developer hooks). The seed is
    // staged before startRace so the one grid draw and start hold are the day's.
    function open(day, mode = "standard") {
      const p = select(day, mode);
      if (!p) return null;
      G.startRace();
      return p;
    }

    // Called from onTTLap for every valid lap of an active daily session.
    function record(lapTime, context = null) {
      if (!active || !(lapTime > 0) || !Number.isFinite(lapTime)) return null;
      const d = data();
      const day = active.day;
      const e = d.days[day] || (d.days[day] = { best: null, laps: 0 });
      e.laps++;
      if (context != null) {
        if (!e.classes || typeof e.classes !== "object" || Array.isArray(e.classes)) e.classes = {};
        const cls = e.classes[context] || { best: null, laps: 0 };
        cls.laps++;
        if (cls.best == null || lapTime < cls.best) cls.best = +lapTime.toFixed(3);
        e.classes[context] = cls;
      }
      if (e.best == null || lapTime < e.best) e.best = +lapTime.toFixed(3);
      // Streak: consecutive UTC days with at least one lap.
      if (d.streak.last !== day) {
        d.streak.count = d.streak.last === prevDay(day) ? d.streak.count + 1 : 1;
        d.streak.last = day;
      }
      // The per-day history is write-only (every reader asks for today; the
      // streak lives in d.streak), so it keeps a window rather than growing
      // ~680 chars a day for ever.
      const floor = new Date(day + "T00:00:00Z");
      if (Number.isFinite(floor.getTime())) {
        floor.setUTCDate(floor.getUTCDate() - HISTORY_DAYS);
        const cut = floor.toISOString().slice(0, 10);
        for (const k of Object.keys(d.days)) if (k < cut) delete d.days[k];
      }
      store.set(KEY, d);
      return e;
    }

    // "APEX 26 DAILY 2026-09-03 · MONZA · 1:21.345 · GOLD · STREAK 4"
    function shareText(medal) {
      const p = active || plan();
      const day = data().days[p.day];
      const context = G.records && G.records.key();
      const e = context ? day && day.classes && day.classes[context] : day;
      const st = data().streak;
      const parts = ["APEX 26 DAILY " + p.day, p.trackName.toUpperCase(),
        e && e.best != null ? G.fmtTime(e.best) : "NO LAP"];
      if (context) parts.push((p.class === "standard" ? "STANDARD CLASS " : "OPEN CLASS ") + Hash32.fnv1a(context).toString(16));
      if (medal) parts.push(medal.toUpperCase());
      if (st.last === p.day && st.count > 0) parts.push("STREAK " + st.count);
      return parts.join(" · ");
    }

    function stop() { if (G.records) G.records.restoreDaily(); active = null; }
    function isActive() { return !!active; }
    function current() { return active; }
    return { plan, dayKey, select, open, record, shareText, stop, isActive, current, data, today };
  }

  return { create, plan, dayKey, prevDay };
})();
Object.freeze(DailyChallenge);
