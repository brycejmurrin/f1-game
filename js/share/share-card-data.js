/* Apex 26 — pure, JSON-safe data models for exported result cards. */
"use strict";

const ShareCardData = (function () {
  const MODEL_KEYS = Object.freeze([
    "v", "kind", "title", "subtitle", "trackId", "trackName", "dayKey",
    "weather", "rows", "hero", "chart", "display", "link",
  ]);
  const MEDALS = ["gold", "silver", "bronze"];

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
      display: { name: text(opts.displayName, 32) || "DRIVER" },
      link: /^https?:\/\//.test(opts.link || "") ? text(opts.link, 512) : null,
    };
    return freezeModel(model);
  }

  return Object.freeze({ MODEL_KEYS, text, lapTime, fromDaily });
})();
Object.freeze(ShareCardData);
