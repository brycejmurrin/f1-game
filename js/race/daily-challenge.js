const DailyChallenge = (function () {
  "use strict";

  const KEY = "daily.v1";
  const HISTORY_DAYS = 60;
  const WEATHER = ["dry", "dry", "overcast", "wet", "rain", "fog"];
  const TOD = ["default", "dawn", "day", "dusk", "night"];

  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

  function pick(day, field, n) { return Hash32.mix(Hash32.fnv1a("daily:" + day + ":" + field)) % n; }

  function dayKey(d) {
    const t = d || new Date(), p2 = (n) => String(n).padStart(2, "0");
    return t.getFullYear() + "-" + p2(t.getMonth() + 1) + "-" + p2(t.getDate());
  }
  function prevDay(day) {
    const d = new Date(day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

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

  function recordDay(d, day, lapTime, context) {
    const e = isObj(d.days[day]) ? d.days[day] : (d.days[day] = { best: null, laps: 0 });
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    e.laps = (num(e.laps) || 0) + 1;
    if (context != null) {
      if (!isObj(e.classes)) e.classes = {};
      const cls = isObj(e.classes[context]) ? e.classes[context] : { best: null, laps: 0 };
      cls.laps = (num(cls.laps) || 0) + 1;
      if (num(cls.best) == null || lapTime < cls.best) cls.best = +lapTime.toFixed(3);
      e.classes[context] = cls;
    }
    if (num(e.best) == null || lapTime < e.best) e.best = +lapTime.toFixed(3);
    const t = new Date(), soon = (t.setDate(t.getDate() + 1), dayKey(t));
    if (!d.streak.last || day > d.streak.last || d.streak.last > soon) {
      d.streak.count = d.streak.last === prevDay(day) ? d.streak.count + 1 : 1;
      d.streak.last = day;
    }
    const floor = new Date(day + "T00:00:00Z");
    if (Number.isFinite(floor.getTime())) {
      floor.setUTCDate(floor.getUTCDate() - HISTORY_DAYS);
      const cut = floor.toISOString().slice(0, 10);
      for (const k of Object.keys(d.days)) if (k < cut || k > soon) delete d.days[k];
    }
    return e;
  }

  function create(G) {
    Log.info("game", "DailyChallenge.create");
    const { store } = G;
    let active = null;
    let savedSeed, savedStream;

    function data() {
      const raw = store.get(KEY, null);
      const d = raw && typeof raw === "object" ? raw : {};
      const days = isObj(d.days) ? d.days : {};
      const st = d.streak && typeof d.streak === "object" ? d.streak : {};
      return { days, streak: { count: Number.isInteger(st.count) ? st.count : 0, last: typeof st.last === "string" ? st.last : null } };
    }
    function today() { const e = data().days[dayKey()]; return isObj(e) ? e : null; }

    function select(day, mode = "standard") {
      const p = plan(day);
      const idx = Tracks.LIST.findIndex((t) => t.id === p.trackId);
      if (idx < 0) return null;
      if (G.records) G.records.restoreDaily();
      G.flow = "gp"; G.timeTrial = true;
      G.trackIdx = idx;
      G.raceWeather = p.weather; G.raceTimeOfDay = p.tod;
      G.raceLaps = G.ttDistance;
      if (!active) { savedSeed = G.seed; savedStream = G.simSeed ? G.simSeed(undefined, true) : undefined; }
      if (G.resetRaceDraft) G.resetRaceDraft();
      G.seed = p.seed;
      active = p;
      p.class = mode === "standard" && G.records ? "standard" : "open";
      if (p.class === "standard") G.records.prepareDaily();
      Log.info("game", "DailyChallenge.select " + p.day + " " + p.trackId + " " + p.weather + " " + p.tod);
      return p;
    }

    function open(day, mode = "standard") {
      const p = select(day, mode);
      if (!p) return null;
      G.startRace();
      return p;
    }

    function record(lapTime, context = null) {
      if (!active || !(lapTime > 0) || !Number.isFinite(lapTime)) return null;
      const d = data();
      const day = active.day;
      const e = recordDay(d, day, lapTime, context);
      store.set(KEY, d);
      if (typeof Badges !== "undefined") Badges.onStreak(d.streak.count);
      return e;
    }

    function shareResult() {
      const p = active || plan();
      const day = data().days[p.day];
      const context = G.records && G.records.key();
      const e = context ? day && day.classes && day.classes[context] : day;
      const best = e && e.best != null ? e.best : undefined;
      const medal = best != null && typeof Quali !== "undefined" && G.referencePole
        ? Quali.medalFor(best, G.referencePole()) : null;
      return { day: p.day, track: p.trackId, trackName: p.trackName, weather: p.weather,
        best, medal, streak: liveStreak(), class: p.class || "standard" };
    }

    function shareText(medal) {
      const p = active || plan(), result = shareResult();
      const context = G.records && G.records.key();
      const st = data().streak;
      const parts = ["APEX 26 DAILY " + p.day, p.trackName.toUpperCase(),
        result.best != null ? G.fmtTime(result.best) : "NO LAP"];
      if (context) parts.push((p.class === "standard" ? "STANDARD CLASS " : "OPEN CLASS ") + Hash32.fnv1a(context).toString(16));
      if (medal === undefined) medal = result.medal;
      if (medal) parts.push(medal.toUpperCase());
      if (st.last === p.day && st.count > 0) parts.push("STREAK " + st.count);
      return parts.join(" · ");
    }

    function card(medal) {
      if (typeof ShareCardData === "undefined") throw new Error("Share cards are unavailable");
      const p = active || plan(), day = data().days[p.day];
      const context = G.records && G.records.key();
      const entry = context ? day && day.classes && day.classes[context] : day;
      const result = shareResult();
      if (medal === undefined) medal = result.medal;
      let link = null;
      if (typeof ShareCode !== "undefined" && ShareCode.encode) {
        const encoded = ShareCode.encode("daily", { ...result, medal });
        if (encoded.ok) link = encoded.url;
      }
      return { model: ShareCardData.fromDaily(p, entry, medal, liveStreak(), { link }), name: "daily-" + p.day, text: shareText(medal) };
    }
    async function shareCard(medal) {
      if (typeof ShareCard === "undefined") throw new Error("Share cards are unavailable");
      const c = card(medal), blob = await ShareCard.render(c.model, "portrait");
      return ShareCard.deliver(blob, "apex26-" + c.name + ".png", { title: "APEX 26 DAILY", text: c.text, url: c.model.link });
    }

    function stop() {
      if (G.records) G.records.restoreDaily();
      if (active && savedSeed !== undefined) { if (savedStream !== undefined) G.simSeed(savedSeed, savedStream); else G.seed = savedSeed; }
      savedSeed = savedStream = undefined; active = null;
    }
    function isActive() { return !!active; }
    function current() { return active; }
    function liveStreak() {
      const st = data().streak, day = dayKey();
      return st.count > 0 && (st.last === day || st.last === prevDay(day)) ? st.count : 0;
    }

    return { plan, dayKey, select, open, record, shareResult, shareText, card, shareCard, stop, isActive, current, data, today, liveStreak };
  }

  return { create, plan, dayKey, prevDay };
})();
Object.freeze(DailyChallenge);
