/* Per-career MY TEAM appearance. Global garage keys remain the one-off GP identity. */
const CareerTeamIdentity = (() => {
  "use strict";
  const KEYS = Object.freeze(["customTeam", "customLogo", "livery.custom.custom", "livery.custom"]);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  function value(key, raw) {
    if (!KEYS.includes(key)) return undefined;
    if (raw == null) return null;
    // Use the same value policy before and after the settings UI is loaded.
    // These are the full-boot garage bounds; the former early fallback clipped
    // at 20 rows and discarded every string pill. No import writes happen here.
    if (key === "customTeam") return raw && typeof raw === "object" && !Array.isArray(raw)
      && Array.isArray(raw.drivers) && raw.drivers.length > 0 ? clone(Teams.sanitizeCustom(raw)) : undefined;
    if (key === "customLogo") return typeof raw === "string" && raw.length <= 400000 && /^data:image\/(png|jpeg|webp);base64,/.test(raw) ? raw : undefined;
    if (key === "livery.custom") return typeof raw === "string" && raw.length <= 64 ? raw : undefined;
    // Match the existing 1 MiB garage transport bound, independently of the
    // pure per-row policy. Career saves keep their own ownership/write gates.
    if (!Array.isArray(raw)) return undefined;
    return raw.slice(0, Math.floor(1024 * 1024 / 48)).map((l) => Teams.cleanLivery(l)).filter(Boolean);
  }
  function sanitize(raw) {
    const out = {};
    for (const key of KEYS) { const v = value(key, raw && raw[key]); if (v !== undefined) out[key] = v; }
    return out;
  }
  function capture(store) { const raw = {}; for (const key of KEYS) raw[key] = store.get(key, null); return sanitize(raw); }
  return Object.freeze({ KEYS, value, sanitize, capture });
})();
