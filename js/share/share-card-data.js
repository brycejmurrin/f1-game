/* Apex 26 — pure, JSON-safe data models for exported result cards. */
"use strict";

const ShareCardData = (function () {
  const MODEL_KEYS = Object.freeze([
    "v", "kind", "title", "subtitle", "trackId", "trackName", "dayKey",
    "weather", "rows", "hero", "chart", "display", "link",
  ]);
  const MEDALS = ["gold", "silver", "bronze"];
  const MAX_ROWS = 10;

  function text(value, max) {
    return String(value == null ? "" : value)
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .replace(/formula\s*1/gi, "GRAND PRIX")
      .trim().slice(0, max || 80);
  }
  function lapTime(value) {
    if (!(typeof value === "number" && isFinite(value) && value > 0)) return "NO LAP";
    const ms = Math.round(value * 1000), minutes = Math.floor(ms / 60000);
    return minutes + ":" + ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  }
  function freezeModel(model) {
    for (const key of ["rows", "hero", "chart", "display"]) {
      const value = model[key];
      if (Array.isArray(value)) {
        for (const item of value) if (item && typeof item === "object") Object.freeze(item);
        Object.freeze(value);
      } else if (value && typeof value === "object") Object.freeze(value);
    }
    return Object.freeze(model);
  }

  function colour(value) {
    const v = String(value == null ? "" : value).trim();
    return /^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\([\d.,\s%]+\)$/i.test(v) ? v : null;
  }
  function row(pos, code, name, teamColor, value, you) {
    return { pos: Number.isInteger(pos) && pos > 0 ? pos : null, code: text(code, 4).toUpperCase(),
      name: text(name, 40), teamColor: colour(teamColor), value: text(value, 24).toUpperCase(), you: !!you };
  }
  function common(opts) {
    return { display: { name: text(opts.displayName, 32) || "DRIVER" },
      link: /^https?:\/\//.test(opts.link || "") ? text(opts.link, 512) : null };
  }
  function obj(value) { return value && typeof value === "object" ? value : {}; }

  // A race: the classified podium (a DNF/DSQ car in the top three is not on it,
  // as ResultsStory.summary), then the player's row when they finished outside it.
  function fromRace(order, opts) {
    order = Array.isArray(order) ? order.filter((c) => c && typeof c === "object") : [];
    opts = obj(opts);
    const out = typeof opts.dnfOf === "function" ? opts.dnfOf
      : (c) => c.dsq ? "DSQ" : c.retired ? c.dnf || "DNF" : null;
    const status = (c) => {
      const o = out(c);
      return o ? (/^\s*dsq/i.test(o) ? "DSQ" : "DNF") : c.classified === false ? "NC" : null;
    };
    const tint = typeof opts.color === "function" ? opts.color : () => null;
    const points = Array.isArray(opts.points) ? opts.points : null;
    const value = (c, i) => status(c) || (points ? "+" + ((points[i] || 0) + (opts.fastestLap === c.driverId ? 1 : 0)) + " PTS" : "");
    const team = (c) => c.team && typeof c.team === "object" ? c.team.name : "";
    const make = (c, i) => row(i + 1, c.code, c.name || team(c), tint(c), value(c, i), c.isPlayer);
    const rows = [];
    order.slice(0, 3).forEach((c, i) => { if (!status(c)) rows.push(make(c, i)); });
    const self = order.findIndex((c) => c.isPlayer);
    if (self >= 0 && !rows.some((r) => r.you)) rows.push(make(order[self], self));
    const fl = order.find((c) => opts.fastestLap != null && c.driverId === opts.fastestLap);
    const model = {
      v: 1, kind: "race",
      title: text(opts.title, 40).toUpperCase() || "RACE RESULT",
      subtitle: [text(opts.subtitle, 40).toUpperCase(), fl ? "FASTEST LAP " + text(fl.code, 4).toUpperCase() : ""].filter(Boolean).join(" · "),
      trackId: text(opts.trackId, 48), trackName: text(opts.trackName || opts.trackId || "CIRCUIT", 72),
      dayKey: null, weather: text(opts.weather, 24) || null,
      rows, hero: null, chart: null,
    };
    return freezeModel(Object.assign(model, common(opts)));
  }

  // A championship table: standings rows already ranked [{code,name,teamColor,value,you}],
  // clamped to ten — the player's row replaces the tenth when they stand lower.
  function fromSeason(standings, opts) {
    standings = Array.isArray(standings) ? standings.filter((r) => r && typeof r === "object") : [];
    opts = obj(opts);
    const ranked = standings.map((r, i) => row(i + 1, r.code, r.name, r.teamColor, r.value, r.you));
    const rows = ranked.slice(0, MAX_ROWS);
    const self = ranked.findIndex((r) => r.you);
    if (self >= MAX_ROWS) rows[MAX_ROWS - 1] = ranked[self];
    const round = Number.isInteger(opts.round) && opts.round >= 0 ? opts.round : null;
    const rounds = Number.isInteger(opts.rounds) && opts.rounds > 0 ? opts.rounds : null;
    const final = round != null && rounds != null && round >= rounds;
    const model = {
      v: 1, kind: "season",
      title: final ? "FINAL CHAMPIONSHIP" : "CHAMPIONSHIP",
      subtitle: final ? "SEASON COMPLETE" : round != null && rounds != null ? "AFTER ROUND " + round + " / " + rounds : "",
      trackId: "", trackName: text(opts.headline || (rows[0] ? rows[0].code + " LEADS" : "STANDINGS"), 72),
      dayKey: null, weather: null, rows, hero: null, chart: null,
    };
    return freezeModel(Object.assign(model, common(opts)));
  }

  // One career.history entry, as rollover() writes it.
  function fromCareerYear(entry, opts) {
    entry = obj(entry); opts = obj(opts);
    const n = (v) => Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
    const pos = n(entry.pos), cPos = n(entry.cPos);
    const year = Number.isInteger(entry.year) ? entry.year : null;
    const rows = [
      row(null, "", "WORLD CHAMPION", null, text(entry.champion, 4).toUpperCase() || "—"),
      row(null, "", "CONSTRUCTORS", opts.teamColor, cPos ? "P" + cPos + " · " + (n(entry.cPts) || 0) + " PTS" : "—"),
      row(null, "", "WINS / PODIUMS", null, (n(entry.wins) || 0) + " / " + (n(entry.podiums) || 0)),
    ];
    const model = {
      v: 1, kind: "career",
      title: year ? "CAREER · SEASON " + year : "CAREER SEASON",
      subtitle: pos === 1 ? "WORLD CHAMPION" : "",
      trackId: "", trackName: text(opts.teamName || entry.team || "TEAM", 72).toUpperCase(),
      dayKey: null, weather: null, rows,
      hero: { label: "DRIVERS' CHAMPIONSHIP", value: pos ? "P" + pos + " · " + (n(entry.pts) || 0) + " PTS" : "—", medal: null, streak: null },
      chart: null,
    };
    return freezeModel(Object.assign(model, common(opts)));
  }

  function fromDaily(plan, entry, medal, streak, opts) {
    plan = plan && typeof plan === "object" ? plan : {};
    entry = entry && typeof entry === "object" ? entry : {};
    opts = opts && typeof opts === "object" ? opts : {};
    const day = /^\d{4}-\d{2}-\d{2}$/.test(plan.day || "") ? plan.day : null;
    const medalName = typeof medal === "string" && MEDALS.includes(medal.toLowerCase())
      ? medal.toUpperCase() : null;
    const streakCount = Number.isInteger(streak) && streak > 0 ? streak : null;
    const conditions = [day, text(plan.weather, 24).toUpperCase(), text(plan.tod, 24).toUpperCase()].filter(Boolean);
    const model = {
      v: 1,
      kind: "daily",
      title: "DAILY CHALLENGE",
      subtitle: conditions.join(" · "),
      trackId: text(plan.trackId, 48),
      trackName: text(plan.trackName || plan.trackId || "CIRCUIT", 72),
      dayKey: day,
      weather: text(plan.weather, 24) || null,
      rows: [],
      hero: { label: "BEST LAP", value: lapTime(entry.best), medal: medalName, streak: streakCount },
      chart: null,
    };
    return freezeModel(Object.assign(model, common(opts)));
  }

  return Object.freeze({ MODEL_KEYS, MAX_ROWS, text, lapTime, fromDaily, fromRace, fromSeason, fromCareerYear });
})();
Object.freeze(ShareCardData);
