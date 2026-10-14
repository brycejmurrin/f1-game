/* Apex 26 — DevFlags: one registry for boot-time URL / hash / localStorage toggles.
   Resolution order: query string, then hash (#…&name=value), then apex26.* storage.
   Bool flags: 1/on/true/yes → on, 0/off/false/no → off. Legacy boot readers that
   only accepted =1 in the URL keep `legacyQueryOne` / `legacyStorageOne` so migrated
   call sites stay bit-identical. */
const DevFlags = (function () {
  "use strict";

  const PREFIX = "apex26.";

  /** @type {Record<string, { param: string, storage?: string, kind?: "bool"|"string", legacyQueryOne?: boolean, legacyStorageOne?: boolean, noHash?: boolean, default?: boolean|string|null }>} */
  const REGISTRY = {
    upscale: { param: "upscale", storage: "spatialUpscale", legacyQueryOne: true, legacyStorageOne: true, noHash: true },
    gfxdebug: { param: "gfxdebug", storage: "gfxDebug", legacyQueryOne: true, legacyStorageOne: true, noHash: true },
    inputdebug: { param: "inputdebug", storage: "inputDebug", legacyQueryOne: true, legacyStorageOne: true, noHash: true },
    metrics: { param: "metrics", storage: "metrics", legacyStorageOne: true, noHash: true },
    fullIntro: { param: "fullIntro", legacyQueryOne: true, noHash: true, default: false },
    "three-devtools": { param: "three-devtools", legacyQueryOne: true, noHash: true, default: false },
    viz: { param: "viz", storage: "tlxViz", kind: "string", noHash: true, default: null },
  };

  function parseBoolish(raw) {
    if (raw == null || raw === "") return null;
    const s = String(raw).trim().toLowerCase();
    if (/^(1|on|true|yes)$/.test(s)) return true;
    if (/^(0|off|false|no)$/.test(s)) return false;
    return null;
  }

  function parseLegacyOne(raw) {
    if (raw == null || raw === "") return null;
    const s = String(raw).trim();
    if (s === "1") return true;
    if (s === "0") return false;
    return null;
  }

  function searchGet(param) {
    try {
      if (typeof location === "undefined" || !location.search) return null;
      const esc = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp("[?&]" + esc + "=([^&]*)", "i").exec(location.search);
      return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
    } catch (_) { return null; }
  }

  function hashGet(param) {
    try {
      const h = typeof location !== "undefined" && location.hash ? String(location.hash) : "";
      if (!h) return null;
      const esc = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp("[#&]" + esc + "=([^&]*)", "i").exec(h);
      return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
    } catch (_) { return null; }
  }

  function storageGet(shortKey) {
    if (!shortKey) return null;
    try {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(PREFIX + shortKey);
    } catch (_) { return null; }
  }

  function resolveBool(def, name) {
    const param = def.param || name;
    const fromQuery = def.legacyQueryOne ? parseLegacyOne(searchGet(param)) : parseBoolish(searchGet(param));
    if (fromQuery !== null) return fromQuery;

    if (!def.noHash) {
      const fromHash = def.legacyQueryOne ? parseLegacyOne(hashGet(param)) : parseBoolish(hashGet(param));
      if (fromHash !== null) return fromHash;
    }

    if (def.storage) {
      const raw = storageGet(def.storage);
      if (def.legacyStorageOne) {
        if (raw === "1") return true;
        if (raw === "0") return false;
      } else {
        const fromStore = parseBoolish(raw);
        if (fromStore !== null) return fromStore;
      }
    }

    return def.default === undefined ? false : !!def.default;
  }

  function resolveString(def, name) {
    const param = def.param || name;
    const q = searchGet(param);
    if (q != null && q !== "") return q;
    if (!def.noHash) {
      const h = hashGet(param);
      if (h != null && h !== "") return h;
    }
    const raw = def.storage ? storageGet(def.storage) : null;
    if (raw != null && raw !== "") return raw;
    return def.default === undefined ? null : def.default;
  }

  function get(name) {
    const def = REGISTRY[name];
    if (!def) return undefined;
    if (def.kind === "string") return resolveString(def, name);
    return resolveBool(def, name);
  }

  function flags() {
    const out = {};
    for (const name of Object.keys(REGISTRY)) out[name] = get(name);
    return out;
  }

  function names() {
    return Object.keys(REGISTRY);
  }

  return { get, flags, names, REGISTRY };
})();

if (typeof window !== "undefined") window.DevFlags = DevFlags;
