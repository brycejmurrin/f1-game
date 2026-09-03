/* Apex 26 — DAILY CHALLENGE: one time-trial plan per UTC day, derived from the date alone (circuit, weather, time of day, sim seed), with a per-day best, a streak and a shareable result line. No server: every player who opens the game on the same day gets the same plan. */
"use strict";

const DailyChallenge = (function () {
  const KEY = "daily.v1";   // store adds the apex26. prefix
  // Weighted toward dry so most days are a clean lap; the rest are the game's
  // real conditions (game.js WEATHER chips). Time of day includes night, which
  // loadTrack lights per circuit.
  const WEATHER = ["dry", "dry", "overcast", "wet", "rain", "fog"];
  const TOD = ["default", "dawn", "day", "dusk", "night"];

  // FNV-1a + a murmur-style finaliser: the same shape as Career.hash (which
  // this module does not call — a career seed must not move the daily plan).
  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function mix32(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function pick(day, field, n) { return mix32(hash32("daily:" + day + ":" + field)) % n; }

  // UTC day, YYYY-MM-DD — the one calendar every player shares.
  function dayKey(d) { return (d || new Date()).toISOString().slice(0, 10); }
  function prevDay(day) {
    const d = new Date(day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // The plan is a pure function of the day. Circuits are drawn from the
  // championship calendar BY ID (Tracks.SEASON), never by list index.
  function plan(day) {
    day = day || dayKey();
    const pool = Tracks.SEASON;
    const track = pool[pick(day, "track", pool.length)];
    return {
      day, trackId: track.id, trackName: track.name || track.id,
      weather: WEATHER[pick(day, "wx", WEATHER.length)],
      tod: TOD[pick(day, "tod", TOD.length)],
      seed: mix32(hash32("daily:" + day)) || 1,
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

    // Stage the plan as a TIME TRIAL and start it. The seed is set BEFORE
    // startRace so the one grid draw and the start hold are the day's.
    function open(day) {
      const p = plan(day);
      const idx = Tracks.LIST.findIndex((t) => t.id === p.trackId);
      if (idx < 0) return null;
      G.flow = "gp"; G.timeTrial = true;
      G.trackIdx = idx;
      G.raceWeather = p.weather; G.raceTimeOfDay = p.tod;
      G.raceLaps = G.ttDistance;
      G.seed = p.seed;
      active = p;
      Log.info("game", "DailyChallenge.open " + p.day + " " + p.trackId + " " + p.weather + " " + p.tod);
      G.startRace();
      return p;
    }

    // Called from onTTLap for every valid lap of an active daily session.
    function record(lapTime) {
      if (!active || !(lapTime > 0)) return null;
      const d = data();
      const day = active.day;
      const e = d.days[day] || (d.days[day] = { best: null, laps: 0 });
      e.laps++;
      if (e.best == null || lapTime < e.best) e.best = +lapTime.toFixed(3);
      // Streak: consecutive UTC days with at least one lap.
      if (d.streak.last !== day) {
        d.streak.count = d.streak.last === prevDay(day) ? d.streak.count + 1 : 1;
        d.streak.last = day;
      }
      store.set(KEY, d);
      return e;
    }

    // "APEX 26 DAILY 2026-09-03 · MONZA · 1:21.345 · GOLD · STREAK 4"
    function shareText(medal) {
      const p = active || plan();
      const e = data().days[p.day];
      const st = data().streak;
      const parts = ["APEX 26 DAILY " + p.day, p.trackName.toUpperCase(),
        e && e.best != null ? G.fmtTime(e.best) : "NO LAP"];
      if (medal) parts.push(medal.toUpperCase());
      if (st.last === p.day && st.count > 0) parts.push("STREAK " + st.count);
      return parts.join(" · ");
    }

    function stop() { active = null; }
    function isActive() { return !!active; }
    function current() { return active; }
    return { plan, dayKey, open, record, shareText, stop, isActive, current, data, today };
  }

  return { create, plan, dayKey, prevDay, hash32, mix32 };
})();
