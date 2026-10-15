/* Per-career MY TEAM appearance. Global garage keys remain the one-off GP identity. */
const CareerTeamIdentity = (() => {
  "use strict";
  const KEYS = Object.freeze(["customTeam", "customLogo", "livery.custom.custom", "livery.custom"]);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  function value(key, raw) {
    if (!KEYS.includes(key)) return undefined;
    if (raw == null) return null;
    if (typeof SettingsExport !== "undefined" && SettingsExport.garageValue) {
      const cleaned = SettingsExport.garageValue(key, raw);
      return cleaned === undefined ? undefined : clone(cleaned);
    }
    if (key === "customTeam") return raw && typeof raw === "object" && !Array.isArray(raw) && typeof Teams !== "undefined" && Teams.sanitizeCustom ? clone(Teams.sanitizeCustom(raw)) : undefined;
    if (key === "customLogo") return typeof raw === "string" && raw.length <= 400000 && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(raw) ? raw : undefined;
    if (key === "livery.custom") return typeof raw === "string" && raw.length <= 128 ? raw : undefined;
    // Before SettingsExport is loaded, retain only plain bounded paint rows.
    if (!Array.isArray(raw)) return undefined;
    return raw.slice(0, 20).filter((r) => r && typeof r.id === "string" && r.id.length <= 128 && [r.c1, r.c2].every((c) => Array.isArray(c) && c.length === 3 && c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))).map((r) => {
      const out = { id: r.id, name: typeof r.name === "string" ? r.name.slice(0, 48) : r.id, c1: r.c1.slice(), c2: r.c2.slice() };
      const fields = typeof Liveries !== "undefined" && Liveries.FIELDS ? Liveries.FIELDS : [];
      for (const k of fields) if (Array.isArray(r[k]) && r[k].length === 3 && r[k].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) out[k] = r[k].slice();
      return out;
    });
  }
  function sanitize(raw) {
    const out = {};
    for (const key of KEYS) { const v = value(key, raw && raw[key]); if (v !== undefined) out[key] = v; }
    return out;
  }
  function capture(store) { const raw = {}; for (const key of KEYS) raw[key] = store.get(key, null); return sanitize(raw); }
  return Object.freeze({ KEYS, value, sanitize, capture });
})();
